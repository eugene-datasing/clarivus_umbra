/**
 * SCIM 2.0 Group Provisioning — Single-group endpoints.
 *
 * GET    /api/scim/Groups/:id — Retrieve a group with its members
 * PUT    /api/scim/Groups/:id — Full replace of a group (update members/roles)
 * PATCH  /api/scim/Groups/:id — Partial update (add/remove members)
 * DELETE /api/scim/Groups/:id — Delete group (400 for built-in roles)
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

const SCIM_GROUP_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:Group";
const SCIM_ERROR_SCHEMA = "urn:ietf:params:scim:api:messages:2.0:Error";
const SCIM_PATCH_SCHEMA = "urn:ietf:params:scim:api:messages:2.0:PatchOp";

/** The five built-in Veil role groups. */
const BUILT_IN_ROLES = [
  "admin",
  "request-manager",
  "senior-reviewer",
  "reviewer",
  "final-approver",
] as const;

// ---------------------------------------------------------------------------
// Auth helper (mirrors Users endpoint)
// ---------------------------------------------------------------------------

function authenticateScim(request: NextRequest): boolean {
  const token = process.env.SCIM_API_TOKEN;
  if (!token) return false;

  const authHeader = request.headers.get("authorization");
  if (!authHeader) return false;

  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0].toLowerCase() !== "bearer") return false;

  return parts[1] === token;
}

function scimError(status: number, detail: string) {
  return NextResponse.json(
    {
      schemas: [SCIM_ERROR_SCHEMA],
      detail,
      status,
    },
    { status },
  );
}

// ---------------------------------------------------------------------------
// Mapping helpers
// ---------------------------------------------------------------------------

interface ScimGroupMember {
  value: string;
  display: string;
  $ref: string;
}

interface ScimGroup {
  schemas: string[];
  id: string;
  displayName: string;
  members: ScimGroupMember[];
  meta: {
    resourceType: string;
    location: string;
  };
}

function memberRef(user: { id: string; name: string }): ScimGroupMember {
  return {
    value: user.id,
    display: user.name,
    $ref: `/api/scim/Users/${user.id}`,
  };
}

function toScimGroup(
  role: string,
  members: { id: string; name: string }[],
): ScimGroup {
  return {
    schemas: [SCIM_GROUP_SCHEMA],
    id: role,
    displayName: role,
    members: members.map(memberRef),
    meta: {
      resourceType: "Group",
      location: `/api/scim/Groups/${role}`,
    },
  };
}

/** Check whether a role string is a known group (built-in OR has users). */
async function groupExists(role: string): Promise<boolean> {
  if ((BUILT_IN_ROLES as readonly string[]).includes(role)) return true;
  const count = await prisma.user.count({ where: { role } });
  return count > 0;
}

type RouteContext = { params: Promise<{ id: string }> };

// ---------------------------------------------------------------------------
// GET /api/scim/Groups/:id
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest, { params }: RouteContext) {
  if (!authenticateScim(request)) {
    return scimError(401, "Unauthorized — invalid or missing Bearer token");
  }

  const { id } = await params;

  if (!(await groupExists(id))) {
    return scimError(404, `Group "${id}" not found`);
  }

  const users = await prisma.user.findMany({
    where: { role: id },
    select: { id: true, name: true },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json(toScimGroup(id, users), {
    status: 200,
    headers: { "Content-Type": "application/scim+json" },
  });
}

// ---------------------------------------------------------------------------
// PUT /api/scim/Groups/:id — Full replace
// ---------------------------------------------------------------------------

export async function PUT(request: NextRequest, { params }: RouteContext) {
  if (!authenticateScim(request)) {
    return scimError(401, "Unauthorized — invalid or missing Bearer token");
  }

  const { id } = await params;

  if (!(await groupExists(id))) {
    return scimError(404, `Group "${id}" not found`);
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return scimError(400, "Invalid JSON body");
  }

  // The new member list replaces the current membership entirely.
  const memberPayload = (body.members ?? []) as Array<{ value?: string }>;
  const newMemberIds = new Set(
    memberPayload.map((m) => m.value).filter(Boolean) as string[],
  );

  // Remove role from current members who are not in the new list
  await prisma.user.updateMany({
    where: {
      role: id,
      id: { notIn: [...newMemberIds] },
    },
    data: { role: "reviewer" }, // demote to default role
  });

  // Assign role to new members
  const members: { id: string; name: string }[] = [];
  for (const userId of newMemberIds) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true },
    });
    if (user) {
      await prisma.user.update({
        where: { id: userId },
        data: { role: id },
      });
      members.push(user);
    }
  }

  return NextResponse.json(toScimGroup(id, members), {
    status: 200,
    headers: { "Content-Type": "application/scim+json" },
  });
}

// ---------------------------------------------------------------------------
// PATCH /api/scim/Groups/:id — Partial update (SCIM PatchOp)
// ---------------------------------------------------------------------------

interface ScimPatchOperation {
  op: string;
  path?: string;
  value?: unknown;
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  if (!authenticateScim(request)) {
    return scimError(401, "Unauthorized — invalid or missing Bearer token");
  }

  const { id } = await params;

  if (!(await groupExists(id))) {
    return scimError(404, `Group "${id}" not found`);
  }

  let body: { schemas?: string[]; Operations?: ScimPatchOperation[] };
  try {
    body = await request.json();
  } catch {
    return scimError(400, "Invalid JSON body");
  }

  // Validate SCIM PatchOp schema
  if (!body.schemas || !body.schemas.includes(SCIM_PATCH_SCHEMA)) {
    return scimError(
      400,
      `Request must include schema "${SCIM_PATCH_SCHEMA}"`,
    );
  }

  if (!body.Operations || !Array.isArray(body.Operations)) {
    return scimError(400, "Operations array is required");
  }

  for (const op of body.Operations) {
    if (!op.op) {
      return scimError(400, "Each operation must have an 'op' field");
    }

    const operation = op.op.toLowerCase();
    const path = (op.path ?? "").toLowerCase();

    switch (operation) {
      case "add": {
        // Add members to the group
        if (path !== "members") {
          return scimError(
            400,
            `Unsupported path for add operation: ${op.path}`,
          );
        }

        const addMembers = normaliseMembers(op.value);
        for (const m of addMembers) {
          if (!m.value) continue;
          const user = await prisma.user.findUnique({
            where: { id: m.value },
          });
          if (user) {
            await prisma.user.update({
              where: { id: m.value },
              data: { role: id },
            });
          }
        }
        break;
      }

      case "remove": {
        // Remove members from the group
        if (path !== "members") {
          // Azure AD sometimes sends path like members[value eq "userId"]
          const memberFilter = (op.path ?? "").match(
            /^members\[value\s+eq\s+"([^"]+)"\]$/i,
          );
          if (memberFilter) {
            const userId = memberFilter[1];
            const user = await prisma.user.findUnique({
              where: { id: userId },
            });
            if (user && user.role === id) {
              await prisma.user.update({
                where: { id: userId },
                data: { role: "reviewer" },
              });
            }
            break;
          }

          return scimError(
            400,
            `Unsupported path for remove operation: ${op.path}`,
          );
        }

        // Remove specific members listed in value
        const removeMembers = normaliseMembers(op.value);
        for (const m of removeMembers) {
          if (!m.value) continue;
          const user = await prisma.user.findUnique({
            where: { id: m.value },
          });
          if (user && user.role === id) {
            await prisma.user.update({
              where: { id: m.value },
              data: { role: "reviewer" },
            });
          }
        }
        break;
      }

      case "replace": {
        if (path === "members") {
          // Full replace of member list
          const replaceMembers = normaliseMembers(op.value);
          const newMemberIds = new Set(
            replaceMembers
              .map((m) => m.value)
              .filter(Boolean) as string[],
          );

          // Remove role from current members not in new list
          await prisma.user.updateMany({
            where: {
              role: id,
              id: { notIn: [...newMemberIds] },
            },
            data: { role: "reviewer" },
          });

          // Add role to new members
          for (const userId of newMemberIds) {
            const user = await prisma.user.findUnique({
              where: { id: userId },
            });
            if (user) {
              await prisma.user.update({
                where: { id: userId },
                data: { role: id },
              });
            }
          }
        }
        // Ignore unknown paths per SCIM spec tolerance
        break;
      }

      default:
        return scimError(
          400,
          `Unsupported operation: ${op.op}. Supported: add, remove, replace`,
        );
    }
  }

  // Return updated group
  const users = await prisma.user.findMany({
    where: { role: id },
    select: { id: true, name: true },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json(toScimGroup(id, users), {
    status: 200,
    headers: { "Content-Type": "application/scim+json" },
  });
}

// ---------------------------------------------------------------------------
// DELETE /api/scim/Groups/:id
// ---------------------------------------------------------------------------

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  if (!authenticateScim(request)) {
    return scimError(401, "Unauthorized — invalid or missing Bearer token");
  }

  const { id } = await params;

  // Prevent deletion of built-in role groups
  if ((BUILT_IN_ROLES as readonly string[]).includes(id)) {
    return scimError(
      400,
      `Cannot delete built-in Veil role group "${id}"`,
    );
  }

  // Check custom group exists
  const memberCount = await prisma.user.count({ where: { role: id } });
  if (memberCount === 0) {
    return scimError(404, `Group "${id}" not found`);
  }

  // Move all members back to default role
  await prisma.user.updateMany({
    where: { role: id },
    data: { role: "reviewer" },
  });

  return new NextResponse(null, { status: 204 });
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

/** Normalise the SCIM value field into an array of member references. */
function normaliseMembers(
  value: unknown,
): Array<{ value?: string }> {
  if (Array.isArray(value)) {
    return value as Array<{ value?: string }>;
  }
  if (value && typeof value === "object" && "value" in (value as Record<string, unknown>)) {
    return [value as { value?: string }];
  }
  return [];
}
