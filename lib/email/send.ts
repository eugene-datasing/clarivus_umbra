/**
 * Email sending functions for Veil.
 *
 * Uses Azure Communication Services when configured.
 * Falls back to console.log in development when the connection string is not set.
 */

import { getEmailClient } from "./email-client";
import {
  invitationEmailHtml,
  invitationEmailText,
  welcomeEmailHtml,
  welcomeEmailText,
} from "./templates";

const SENDER_ADDRESS = process.env.AZURE_COMMUNICATION_SENDER_ADDRESS || "DoNotReply@veil.datasing.co.nz";

interface SendInvitationParams {
  recipientEmail: string;
  recipientName: string;
  orgName: string;
  inviterName: string;
  role: string;
  loginUrl: string;
}

export async function sendInvitationEmail(params: SendInvitationParams): Promise<boolean> {
  const { recipientEmail, recipientName, orgName, inviterName, role, loginUrl } = params;

  const subject = `You've been invited to Veil — ${orgName}`;
  const html = invitationEmailHtml({ recipientName, orgName, inviterName, role, loginUrl });
  const text = invitationEmailText({ recipientName, orgName, inviterName, role, loginUrl });

  return sendEmail(recipientEmail, recipientName, subject, html, text);
}

interface SendWelcomeParams {
  recipientEmail: string;
  recipientName: string;
  orgName: string;
  loginUrl: string;
}

export async function sendWelcomeEmail(params: SendWelcomeParams): Promise<boolean> {
  const { recipientEmail, recipientName, orgName, loginUrl } = params;

  const subject = `Welcome to Veil — ${orgName}`;
  const html = welcomeEmailHtml({ recipientName, orgName, loginUrl });
  const text = welcomeEmailText({ recipientName, orgName, loginUrl });

  return sendEmail(recipientEmail, recipientName, subject, html, text);
}

async function sendEmail(
  toEmail: string,
  toName: string,
  subject: string,
  htmlContent: string,
  plainTextContent: string,
): Promise<boolean> {
  const client = getEmailClient();

  if (!client) {
    // Dev mode fallback — log to console
    console.log("[email] Azure Communication Services not configured. Logging email:");
    console.log(`  To: ${toName} <${toEmail}>`);
    console.log(`  Subject: ${subject}`);
    console.log(`  Body (text): ${plainTextContent.slice(0, 200)}...`);
    return true; // Simulate success in dev
  }

  try {
    const poller = await client.beginSend({
      senderAddress: SENDER_ADDRESS,
      content: { subject, html: htmlContent, plainText: plainTextContent },
      recipients: {
        to: [{ address: toEmail, displayName: toName }],
      },
    });

    const result = await poller.pollUntilDone();

    if (result.status === "Succeeded") {
      console.log(`[email] Sent "${subject}" to ${toEmail}`);
      return true;
    } else {
      console.error(`[email] Failed to send to ${toEmail}: status=${result.status}`);
      return false;
    }
  } catch (err) {
    console.error(`[email] Error sending to ${toEmail}:`, err);
    return false;
  }
}
