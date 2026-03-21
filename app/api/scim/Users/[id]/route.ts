/**
 * SCIM 2.0 User Provisioning — Single user endpoints.
 *
 * GET    /api/scim/Users/:id — Retrieve a user
 * PUT    /api/scim/Users/:id — Full replace of a user
 * PATCH  /api/scim/Users/:id — Partial update (SCIM PatchOp)
 * DELETE /api/scim/Users/:id — Deactivate user (soft delete)
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

const SCIM_USER_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:User";
const SCIM_ERROR_SCHEMA = "urn:ietf:params:scim:api:messages:2.0:Error";
const SCIM_PATCH_SCHEMA = "urn:ietf:params:scim:api:messages:2.0:PatchOp";

// ---------------------------------------------------------------------------
// Auth helper
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
// Mapping helper
// ---------------------------------------------------------------------------

interface ScimUser {
  schemas: string[];
  id: string;
  userName: string;
  displayName: string;
  active: boolean;
  meta: {
    resourceType: string;
    created: string;
    lastModified: string;
    location: string;
  };
}

function toScimUser(user: {
  id: string;
  name: string;
  email: string | null;
  passwordHash: string | null;
  createdAt: Date;
  updatedAt: Date;
}): ScimUser {
  return {
    schemas: [SCIM_USER_SCHEMA],
    id: user.id,
    userName: user.email ?? "",
    displayName: user.name,
    active: user.passwordHash !== null || user.email !== null,
    meta: {
      resourceType: "User",
      created: user.createdAt.toISOString(),
      lastModified: user.updatedAt.toISOString(),
      location: `/api/scim/Users/${user.id}`,
    },
  };
}

type RouteContext = { params: Promise<{ id: string }> };

// ---------------------------------------------------------------------------
// GET /api/scim/Users/:id
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest, { params }: RouteContext) {
  if (!authenticateScim(request)) {
    return scimError(401, "Unauthorized — invalid or missing Bearer token");
  }

  const { id } = await params;

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) {
    return scimError(404, `User "${id}" not found`);
  }

  return NextResponse.json(toScimUser(user), {
    status: 200,
    headers: { "Content-Type": "application/scim+json" },
  });
}

// ---------------------------------------------------------------------------
// PUT /api/scim/Users/:id — Full replace
// ---------------------------------------------------------------------------

export async function PUT(request: NextRequest, { params }: RouteContext) {
  if (!authenticateScim(request)) {
    return scimError(401, "Unauthorized — invalid or missing Bearer token");
  }

  const { id } = await params;

  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) {
    return scimError(404, `User "${id}" not found`);
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return scimError(400, "Invalid JSON body");
  }

  const userName = body.userName as string | undefined;
  if (!userName) {
    return scimError(400, "userName is required");
  }

  // Check for email uniqueness if changing
  if (userName !== existing.email) {
    const conflict = await prisma.user.findUnique({ where: { email: userName } });
    if (conflict) {
      return scimError(409, `User with userName "${userName}" already exists`);
    }
  }

  // Resolve display name
  let displayName = body.displayName as string | undefined;
  if (!displayName) {
    const nameObj = body.name as { givenName?: string; familyName?: string } | undefined;
    if (nameObj) {
      const parts = [nameObj.givenName, nameObj.familyName].filter(Boolean);
      if (parts.length > 0) {
        displayName = parts.join(" ");
      }
    }
  }
  if (!displayName) {
    displayName = userName;
  }

  // Handle active status — deactivate by removing passwordHash
  const active = body.active !== false;
  const updateData: Record<string, unknown> = {
    name: displayName,
    email: userName,
  };

  if (!active) {
    updateData.passwordHash = null;
  }

  const user = await prisma.user.update({
    where: { id },
    data: updateData,
  });

  return NextResponse.json(toScimUser(user), {
    status: 200,
    headers: { "Content-Type": "application/scim+json" },
  });
}

// ---------------------------------------------------------------------------
// PATCH /api/scim/Users/:id — Partial update (SCIM PatchOp)
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

  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) {
    return scimError(404, `User "${id}" not found`);
  }

  let body: { schemas?: string[]; Operations?: ScimPatchOperation[] };
  try {
    body = await request.json();
  } catch {
    return scimError(400, "Invalid JSON body");
  }

  // Validate SCIM PatchOp schema
  if (!body.schemas || !body.schemas.includes(SCIM_PATCH_SCHEMA)) {
    return scimError(400, `Request must include schema "${SCIM_PATCH_SCHEMA}"`);
  }

  if (!body.Operations || !Array.isArray(body.Operations)) {
    return scimError(400, "Operations array is required");
  }

  const updateData: Record<string, unknown> = {};

  for (const op of body.Operations) {
    if (!op.op || !op.path) {
      return scimError(400, "Each operation must have 'op' and 'path'");
    }

    const operation = op.op.toLowerCase();
    if (operation !== "replace" && operation !== "add") {
      // We support "replace" and "add" for the fields we handle.
      // "remove" is handled via the DELETE endpoint / active flag.
      return scimError(400, `Unsupported operation: ${op.op}. Supported: replace, add`);
    }

    const path = op.path.toLowerCase();

    switch (path) {
      case "username":
        if (typeof op.value !== "string") {
          return scimError(400, "userName value must be a string");
        }
        // Check uniqueness
        if (op.value !== existing.email) {
          const conflict = await prisma.user.findUnique({ where: { email: op.value } });
          if (conflict) {
            return scimError(409, `User with userName "${op.value}" already exists`);
          }
        }
        updateData.email = op.value;
        break;

      case "displayname":
        if (typeof op.value !== "string") {
          return scimError(400, "displayName value must be a string");
        }
        updateData.name = op.value;
        break;

      case "name.givenname": {
        const currentParts = existing.name.split(" ");
        const familyName = currentParts.length > 1 ? currentParts.slice(1).join(" ") : "";
        updateData.name = `${op.value}${familyName ? " " + familyName : ""}`;
        break;
      }

      case "name.familyname": {
        const currentParts2 = existing.name.split(" ");
        const givenName = currentParts2[0] || "";
        updateData.name = `${givenName}${op.value ? " " + op.value : ""}`;
        break;
      }

      case "active":
        if (typeof op.value !== "boolean") {
          return scimError(400, "active value must be a boolean");
        }
        if (!op.value) {
          // Deactivate: remove passwordHash
          updateData.passwordHash = null;
        }
        // If re-activating, we don't set a password — the user must use SSO
        break;

      default:
        // Unknown paths are ignored per SCIM spec tolerance
        break;
    }
  }

  if (Object.keys(updateData).length === 0) {
    // No actionable changes — return current state
    return NextResponse.json(toScimUser(existing), {
      status: 200,
      headers: { "Content-Type": "application/scim+json" },
    });
  }

  const user = await prisma.user.update({
    where: { id },
    data: updateData,
  });

  return NextResponse.json(toScimUser(user), {
    status: 200,
    headers: { "Content-Type": "application/scim+json" },
  });
}

// ---------------------------------------------------------------------------
// DELETE /api/scim/Users/:id — Soft delete (deactivate)
// ---------------------------------------------------------------------------

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  if (!authenticateScim(request)) {
    return scimError(401, "Unauthorized — invalid or missing Bearer token");
  }

  const { id } = await params;

  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) {
    return scimError(404, `User "${id}" not found`);
  }

  // Soft delete: remove password hash to deactivate, keep the record for audit
  await prisma.user.update({
    where: { id },
    data: { passwordHash: null },
  });

  return new NextResponse(null, { status: 204 });
}
