/**
 * SCIM 2.0 Group Provisioning — List & Create endpoints.
 *
 * Maps Azure AD groups to Veil roles. Each Veil role (admin,
 * request-manager, senior-reviewer, reviewer, final-approver) is
 * represented as a SCIM Group whose members are users with that role.
 *
 * GET  /api/scim/Groups  — List groups (supports filter, startIndex, count)
 * POST /api/scim/Groups  — Create a group (409 if it clashes with built-in role)
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

const SCIM_GROUP_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:Group";
const SCIM_LIST_SCHEMA =
  "urn:ietf:params:scim:api:messages:2.0:ListResponse";
const SCIM_ERROR_SCHEMA =
  "urn:ietf:params:scim:api:messages:2.0:Error";

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

// ---------------------------------------------------------------------------
// GET /api/scim/Groups
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  if (!authenticateScim(request)) {
    return scimError(401, "Unauthorized — invalid or missing Bearer token");
  }

  const url = new URL(request.url);
  const filter = url.searchParams.get("filter");
  const startIndex = Math.max(
    1,
    parseInt(url.searchParams.get("startIndex") ?? "1", 10),
  );
  const count = Math.min(
    200,
    Math.max(1, parseInt(url.searchParams.get("count") ?? "100", 10)),
  );

  // Determine which roles to return based on filter
  let roles: string[] = [...BUILT_IN_ROLES];

  if (filter) {
    const match = filter.match(/^displayName\s+eq\s+"([^"]+)"$/i);
    if (match) {
      const filterValue = match[1];
      roles = roles.filter((r) => r === filterValue);
    }
  }

  const totalResults = roles.length;

  // Paginate the role list
  const pagedRoles = roles.slice(startIndex - 1, startIndex - 1 + count);

  // Fetch members for each role in the current page
  const groups: ScimGroup[] = [];

  for (const role of pagedRoles) {
    const users = await prisma.user.findMany({
      where: { role },
      select: { id: true, name: true },
      orderBy: { createdAt: "asc" },
    });
    groups.push(toScimGroup(role, users));
  }

  return NextResponse.json(
    {
      schemas: [SCIM_LIST_SCHEMA],
      totalResults,
      startIndex,
      itemsPerPage: groups.length,
      Resources: groups,
    },
    {
      status: 200,
      headers: { "Content-Type": "application/scim+json" },
    },
  );
}

// ---------------------------------------------------------------------------
// POST /api/scim/Groups
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  if (!authenticateScim(request)) {
    return scimError(401, "Unauthorized — invalid or missing Bearer token");
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return scimError(400, "Invalid JSON body");
  }

  const displayName = body.displayName as string | undefined;
  if (!displayName) {
    return scimError(400, "displayName is required");
  }

  // Reject if the group name matches a built-in role
  if ((BUILT_IN_ROLES as readonly string[]).includes(displayName)) {
    return scimError(
      409,
      `Group "${displayName}" already exists as a built-in Veil role`,
    );
  }

  // For non-built-in groups we store them by assigning the role to users.
  // First check if any user already has this role string (i.e. group exists).
  const existingCount = await prisma.user.count({
    where: { role: displayName },
  });
  if (existingCount > 0) {
    return scimError(409, `Group "${displayName}" already exists`);
  }

  // Process initial members if provided
  const memberPayload = body.members as
    | Array<{ value?: string }>
    | undefined;

  const members: { id: string; name: string }[] = [];

  if (memberPayload && Array.isArray(memberPayload)) {
    for (const m of memberPayload) {
      if (!m.value) continue;
      const user = await prisma.user.findUnique({
        where: { id: m.value },
        select: { id: true, name: true },
      });
      if (user) {
        await prisma.user.update({
          where: { id: user.id },
          data: { role: displayName },
        });
        members.push(user);
      }
    }
  }

  const group = toScimGroup(displayName, members);

  return NextResponse.json(group, {
    status: 201,
    headers: { "Content-Type": "application/scim+json" },
  });
}
