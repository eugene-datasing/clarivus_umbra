/**
 * HTML email templates for Umbra transactional emails.
 */

interface InvitationEmailParams {
  recipientName: string;
  orgName: string;
  inviterName: string;
  role: string;
  loginUrl: string;
}

export function invitationEmailHtml(params: InvitationEmailParams): string {
  const { recipientName, orgName, inviterName, role, loginUrl: rawLoginUrl } = params;
  const loginUrl = sanitizeUrl(rawLoginUrl);
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:40px 20px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
        <tr><td style="background:#1e40af;padding:24px 32px;">
          <h1 style="margin:0;color:#fff;font-size:20px;font-weight:600;">Umbra</h1>
          <p style="margin:4px 0 0;color:#93c5fd;font-size:13px;">AI-Powered Document Redaction Platform</p>
        </td></tr>
        <tr><td style="padding:32px;">
          <h2 style="margin:0 0 16px;color:#1f2937;font-size:18px;">You've been invited to Umbra</h2>
          <p style="margin:0 0 12px;color:#4b5563;font-size:14px;line-height:1.6;">
            Hi ${escapeHtml(recipientName)},
          </p>
          <p style="margin:0 0 12px;color:#4b5563;font-size:14px;line-height:1.6;">
            <strong>${escapeHtml(inviterName)}</strong> has invited you to join
            <strong>${escapeHtml(orgName)}</strong>'s Umbra instance as a
            <strong>${escapeHtml(formatRole(role))}</strong>.
          </p>
          <p style="margin:0 0 24px;color:#4b5563;font-size:14px;line-height:1.6;">
            Sign in with your organisation's Azure AD credentials to get started.
          </p>
          <table cellpadding="0" cellspacing="0" width="100%"><tr><td align="center">
            <a href="${escapeHtml(loginUrl)}" style="display:inline-block;background:#1e40af;color:#fff;text-decoration:none;padding:12px 32px;border-radius:6px;font-size:14px;font-weight:600;">
              Sign In to Umbra
            </a>
          </td></tr></table>
          <p style="margin:24px 0 0;color:#9ca3af;font-size:12px;line-height:1.5;">
            If you weren't expecting this invitation, you can safely ignore this email.
          </p>
        </td></tr>
        <tr><td style="padding:16px 32px;background:#f9fafb;border-top:1px solid #e5e7eb;">
          <p style="margin:0;color:#9ca3af;font-size:11px;text-align:center;">
            Umbra &mdash; DataSing
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export function invitationEmailText(params: InvitationEmailParams): string {
  const { recipientName, orgName, inviterName, role, loginUrl: rawLoginUrl } = params;
  const loginUrl = sanitizeUrl(rawLoginUrl);
  return [
    `Hi ${recipientName},`,
    "",
    `${inviterName} has invited you to join ${orgName}'s Umbra instance as a ${formatRole(role)}.`,
    "",
    `Sign in with your organisation's Azure AD credentials:`,
    loginUrl,
    "",
    "If you weren't expecting this invitation, you can safely ignore this email.",
    "",
    "Umbra - DataSing",
  ].join("\n");
}

interface WelcomeEmailParams {
  recipientName: string;
  orgName: string;
  loginUrl: string;
}

export function welcomeEmailHtml(params: WelcomeEmailParams): string {
  const { recipientName, orgName, loginUrl: rawLoginUrl } = params;
  const loginUrl = sanitizeUrl(rawLoginUrl);
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:40px 20px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
        <tr><td style="background:#1e40af;padding:24px 32px;">
          <h1 style="margin:0;color:#fff;font-size:20px;font-weight:600;">Umbra</h1>
          <p style="margin:4px 0 0;color:#93c5fd;font-size:13px;">AI-Powered Document Redaction Platform</p>
        </td></tr>
        <tr><td style="padding:32px;">
          <h2 style="margin:0 0 16px;color:#1f2937;font-size:18px;">Welcome to Umbra</h2>
          <p style="margin:0 0 12px;color:#4b5563;font-size:14px;line-height:1.6;">
            Hi ${escapeHtml(recipientName)},
          </p>
          <p style="margin:0 0 24px;color:#4b5563;font-size:14px;line-height:1.6;">
            Your account on <strong>${escapeHtml(orgName)}</strong>'s Umbra instance is ready.
            Complete your profile to get started with document review.
          </p>
          <table cellpadding="0" cellspacing="0" width="100%"><tr><td align="center">
            <a href="${escapeHtml(loginUrl)}" style="display:inline-block;background:#1e40af;color:#fff;text-decoration:none;padding:12px 32px;border-radius:6px;font-size:14px;font-weight:600;">
              Go to Umbra
            </a>
          </td></tr></table>
        </td></tr>
        <tr><td style="padding:16px 32px;background:#f9fafb;border-top:1px solid #e5e7eb;">
          <p style="margin:0;color:#9ca3af;font-size:11px;text-align:center;">
            Umbra &mdash; DataSing
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export function welcomeEmailText(params: WelcomeEmailParams): string {
  const { recipientName, orgName, loginUrl: rawLoginUrl } = params;
  const loginUrl = sanitizeUrl(rawLoginUrl);
  return [
    `Hi ${recipientName},`,
    "",
    `Your account on ${orgName}'s Umbra instance is ready.`,
    `Complete your profile to get started with document review.`,
    "",
    loginUrl,
    "",
    "Umbra - DataSing",
  ].join("\n");
}

// -- Demo Request Notification --

interface DemoRequestEmailParams {
  name: string;
  email: string;
  organisation: string;
  message: string;
}

export function demoRequestEmailHtml(params: DemoRequestEmailParams): string {
  const { name, email, organisation, message } = params;
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:40px 20px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
        <tr><td style="background:#3e13af;padding:24px 32px;">
          <h1 style="margin:0;color:#fff;font-size:20px;font-weight:600;">Umbra</h1>
          <p style="margin:4px 0 0;color:#c4b5fd;font-size:13px;">New Demo Request</p>
        </td></tr>
        <tr><td style="padding:32px;">
          <h2 style="margin:0 0 20px;color:#1f2937;font-size:18px;">Demo Request Received</h2>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
            <tr>
              <td style="padding:8px 0;color:#6b7280;font-size:13px;font-weight:600;width:110px;vertical-align:top;">Name</td>
              <td style="padding:8px 0;color:#1f2937;font-size:14px;">${escapeHtml(name)}</td>
            </tr>
            <tr>
              <td style="padding:8px 0;color:#6b7280;font-size:13px;font-weight:600;width:110px;vertical-align:top;">Email</td>
              <td style="padding:8px 0;color:#1f2937;font-size:14px;">
                <a href="mailto:${escapeHtml(email)}" style="color:#3e13af;text-decoration:none;">${escapeHtml(email)}</a>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 0;color:#6b7280;font-size:13px;font-weight:600;width:110px;vertical-align:top;">Organisation</td>
              <td style="padding:8px 0;color:#1f2937;font-size:14px;">${escapeHtml(organisation)}</td>
            </tr>
            ${message ? `<tr>
              <td style="padding:8px 0;color:#6b7280;font-size:13px;font-weight:600;width:110px;vertical-align:top;">Message</td>
              <td style="padding:8px 0;color:#1f2937;font-size:14px;line-height:1.5;">${escapeHtml(message)}</td>
            </tr>` : ""}
          </table>
          <p style="margin:0;color:#9ca3af;font-size:12px;line-height:1.5;">
            This demo request was submitted via the Umbra landing page.
          </p>
        </td></tr>
        <tr><td style="padding:16px 32px;background:#f9fafb;border-top:1px solid #e5e7eb;">
          <p style="margin:0;color:#9ca3af;font-size:11px;text-align:center;">
            Umbra &mdash; DataSing
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export function demoRequestEmailText(params: DemoRequestEmailParams): string {
  const { name, email, organisation, message } = params;
  return [
    "NEW DEMO REQUEST",
    "================",
    "",
    `Name: ${name}`,
    `Email: ${email}`,
    `Organisation: ${organisation}`,
    ...(message ? ["", `Message: ${message}`] : []),
    "",
    "---",
    "Submitted via the Umbra landing page.",
    "",
    "Umbra - DataSing",
  ].join("\n");
}

// -- Helpers --

/**
 * Validates that a URL uses http: or https: scheme to prevent
 * javascript: or data: URI injection in email href attributes.
 */
function sanitizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return url;
    }
  } catch {
    // invalid URL
  }
  return "#";
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatRole(role: string): string {
  return role
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
