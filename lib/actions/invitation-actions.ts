"use server";

import crypto from "crypto";
import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import { createAuditEntry } from "@/lib/data/audit";
import { sendInvitationEmail } from "@/lib/email/send";
import { getSetting, SETTING_KEYS, type OrgIdentity, DEFAULT_ORG_IDENTITY } from "@/lib/data/settings";
import { logger } from "@/lib/logger";

const INVITATION_EXPIRY_DAYS = 14;
const ADMIN_ROLES = ["admin", "request-manager"];

function requireInvitationAdmin(role: string) {
  if (!ADMIN_ROLES.includes(role)) {
    throw new Error("Only administrators and request managers can manage invitations");
  }
}

// ---------------------------------------------------------------------------
// List invitations
// ---------------------------------------------------------------------------

export async function getInvitations() {
  const user = await requireUser();
  requireInvitationAdmin(user.role);

  return prisma.userInvitation.findMany({
    orderBy: { createdAt: "desc" },
  });
}

// ---------------------------------------------------------------------------
// Invite a user
// ---------------------------------------------------------------------------

interface InviteUserParams {
  email: string;
  name: string;
  role: string;
  departmentId?: string;
}

export async function inviteUser(
  params: InviteUserParams,
): Promise<{ success: boolean; error?: string; id?: string }> {
  const user = await requireUser();
  requireInvitationAdmin(user.role);

  const email = params.email?.replace(/[\r\n]/g, "").trim();
  const { name, role, departmentId } = params;

  // RFC 5322 simplified: local@domain with at least one dot in domain
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !EMAIL_RE.test(email)) {
    return { success: false, error: "A valid email address is required." };
  }

  if (!name || name.trim().length === 0) {
    return { success: false, error: "A display name is required." };
  }

  const validRoles = ["reviewer", "senior-reviewer", "request-manager", "admin"];
  if (!validRoles.includes(role)) {
    return { success: false, error: `Invalid role: ${role}` };
  }

  // Check if user already exists
  const existingUser = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
  });
  if (existingUser) {
    return { success: false, error: "A user with this email already exists." };
  }

  // Check if there's already a pending invitation for this email
  const existingInvite = await prisma.userInvitation.findFirst({
    where: {
      email: { equals: email, mode: "insensitive" },
      status: "pending",
    },
  });
  if (existingInvite) {
    return { success: false, error: "An invitation has already been sent to this email." };
  }

  // Generate unique token
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + INVITATION_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

  const invitation = await prisma.userInvitation.create({
    data: {
      email: email.toLowerCase(),
      name: name.trim(),
      role,
      departmentId: departmentId || null,
      invitedBy: user.id,
      token,
      expiresAt,
    },
  });

  // Send invitation email
  const orgIdentity = await getSetting<OrgIdentity>(SETTING_KEYS.ORG_IDENTITY, DEFAULT_ORG_IDENTITY);
  const orgName = orgIdentity.name || "Veil";
  const baseUrl = process.env.NEXTAUTH_URL || process.env.AUTH_URL || "http://localhost:3000";

  await sendInvitationEmail({
    recipientEmail: email.toLowerCase(),
    recipientName: name.trim(),
    orgName,
    inviterName: user.name,
    role,
    loginUrl: `${baseUrl}/login`,
  });

  // Audit log
  try {
    await createAuditEntry({
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      type: "user-invited",
      description: `Invited ${name.trim()} (${email.toLowerCase()}) as ${role}`,
      target: `invitation:${invitation.id}`,
    });
  } catch (err) {
    logger.error("[invitations] Failed to create audit entry:", { error: String(err) });
  }

  return { success: true, id: invitation.id };
}

// ---------------------------------------------------------------------------
// Revoke an invitation
// ---------------------------------------------------------------------------

export async function revokeInvitation(
  invitationId: string,
): Promise<{ success: boolean; error?: string }> {
  const user = await requireUser();
  requireInvitationAdmin(user.role);

  const invitation = await prisma.userInvitation.findUnique({
    where: { id: invitationId },
  });

  if (!invitation) {
    return { success: false, error: "Invitation not found." };
  }

  if (invitation.status !== "pending") {
    return { success: false, error: `Cannot revoke an invitation that is ${invitation.status}.` };
  }

  await prisma.userInvitation.update({
    where: { id: invitationId },
    data: { status: "revoked" },
  });

  try {
    await createAuditEntry({
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      type: "invitation-revoked",
      description: `Revoked invitation for ${invitation.email}`,
      target: `invitation:${invitationId}`,
    });
  } catch (err) {
    logger.error("[invitations] Failed to create audit entry:", { error: String(err) });
  }

  return { success: true };
}

// ---------------------------------------------------------------------------
// Resend an invitation
// ---------------------------------------------------------------------------

export async function resendInvitation(
  invitationId: string,
): Promise<{ success: boolean; error?: string }> {
  const user = await requireUser();
  requireInvitationAdmin(user.role);

  const invitation = await prisma.userInvitation.findUnique({
    where: { id: invitationId },
  });

  if (!invitation) {
    return { success: false, error: "Invitation not found." };
  }

  if (invitation.status !== "pending") {
    return { success: false, error: `Cannot resend an invitation that is ${invitation.status}.` };
  }

  // Generate new token and extend expiry
  const newToken = crypto.randomBytes(32).toString("hex");
  const newExpiry = new Date(Date.now() + INVITATION_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

  await prisma.userInvitation.update({
    where: { id: invitationId },
    data: { token: newToken, expiresAt: newExpiry },
  });

  // Re-send invitation email
  const orgIdentity = await getSetting<OrgIdentity>(SETTING_KEYS.ORG_IDENTITY, DEFAULT_ORG_IDENTITY);
  const orgName = orgIdentity.name || "Veil";
  const baseUrl = process.env.NEXTAUTH_URL || process.env.AUTH_URL || "http://localhost:3000";

  await sendInvitationEmail({
    recipientEmail: invitation.email,
    recipientName: invitation.name || invitation.email,
    orgName,
    inviterName: user.name,
    role: invitation.role,
    loginUrl: `${baseUrl}/login`,
  });

  return { success: true };
}
