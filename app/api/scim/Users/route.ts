/**
 * SCIM 2.0 User Provisioning — List & Create endpoints.
 *
 * Provides automated user provisioning from Azure AD / identity providers
 * conforming to the SCIM 2.0 specification (RFC 7644).
 *
 * GET  /api/scim/Users  — List users (supports filter, startIndex, count)
 * POST /api/scim/Users  — Create a user from SCIM payload
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

const SCIM_USER_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:User";
const SCIM_LIST_SCHEMA = "urn:ietf:params:scim:api:messages:2.0:ListResponse";
const SCIM_ERROR_SCHEMA = "urn:ietf:params:scim:api:messages:2.0:Error";

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
// Mapping helpers
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

// ---------------------------------------------------------------------------
// GET /api/scim/Users
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  if (!authenticateScim(request)) {
    return scimError(401, "Unauthorized — invalid or missing Bearer token");
  }

  const url = new URL(request.url);
  const filter = url.searchParams.get("filter");
  const startIndex = Math.max(1, parseInt(url.searchParams.get("startIndex") ?? "1", 10));
  const count = Math.min(200, Math.max(1, parseInt(url.searchParams.get("count") ?? "100", 10)));

  // Build Prisma where clause from SCIM filter
  // Supports: userName eq "value"
  let where: Record<string, unknown> = {};

  if (filter) {
    const match = filter.match(/^userName\s+eq\s+"([^"]+)"$/i);
    if (match) {
      where = { email: match[1] };
    }
  }

  const [totalResults, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      skip: startIndex - 1,
      take: count,
      orderBy: { createdAt: "asc" },
    }),
  ]);

  return NextResponse.json(
    {
      schemas: [SCIM_LIST_SCHEMA],
      totalResults,
      startIndex,
      itemsPerPage: users.length,
      Resources: users.map(toScimUser),
    },
    {
      status: 200,
      headers: { "Content-Type": "application/scim+json" },
    },
  );
}

// ---------------------------------------------------------------------------
// POST /api/scim/Users
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

  const userName = body.userName as string | undefined;
  if (!userName) {
    return scimError(400, "userName is required");
  }

  // Check for existing user with that email
  const existing = await prisma.user.findUnique({ where: { email: userName } });
  if (existing) {
    return scimError(409, `User with userName "${userName}" already exists`);
  }

  // Resolve display name: displayName → name.givenName + name.familyName → userName
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

  // Check active flag — if explicitly false, skip creation
  const active = body.active !== false;
  if (!active) {
    return scimError(400, "Cannot create an inactive user via SCIM provisioning");
  }

  const user = await prisma.user.create({
    data: {
      name: displayName,
      email: userName,
      role: "reviewer", // Default role for SCIM-provisioned users
      passwordHash: null, // SSO-only — no local password
    },
  });

  return NextResponse.json(toScimUser(user), {
    status: 201,
    headers: { "Content-Type": "application/scim+json" },
  });
}
