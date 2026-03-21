/**
 * Azure Communication Services email client.
 *
 * Provides a singleton EmailClient for sending transactional emails
 * (invitations, notifications). Returns null when the connection string
 * is not configured (e.g. local development).
 */

import { EmailClient } from "@azure/communication-email";

let client: EmailClient | null = null;

export function getEmailClient(): EmailClient | null {
  const connectionString = process.env.AZURE_COMMUNICATION_CONNECTION_STRING;
  if (!connectionString) return null;

  if (!client) {
    client = new EmailClient(connectionString);
  }
  return client;
}
