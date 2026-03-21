/**
 * Microsoft 365 Integration Connector
 *
 * Provides SharePoint and OneDrive connectivity via Microsoft Graph API.
 * Requires M365_TENANT_ID, M365_CLIENT_ID, and M365_CLIENT_SECRET environment
 * variables to be configured. When not configured, functions gracefully degrade
 * and return appropriate status information.
 */

export interface M365Config {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  siteUrl?: string; // SharePoint site URL
}

export interface M365FileItem {
  id: string;
  name: string;
  path: string;
  size: number;
  lastModified: string;
  webUrl: string;
  mimeType: string;
}

export interface M365Connection {
  connected: boolean;
  provider: "sharepoint" | "onedrive";
  siteName?: string;
  tenantId?: string;
}

export interface M365Status {
  configured: boolean;
  connection: M365Connection | null;
  missingVars: string[];
}

/* ------------------------------------------------------------------ */
/*  Environment variable checks                                        */
/* ------------------------------------------------------------------ */

const REQUIRED_ENV_VARS = [
  "M365_TENANT_ID",
  "M365_CLIENT_ID",
  "M365_CLIENT_SECRET",
] as const;

/**
 * Check whether M365 environment variables are configured.
 */
export function isM365Configured(): boolean {
  return REQUIRED_ENV_VARS.every(
    (key) => typeof process.env[key] === "string" && process.env[key]!.length > 0,
  );
}

/**
 * Return a list of missing M365 environment variable names.
 */
export function getMissingM365Vars(): string[] {
  return REQUIRED_ENV_VARS.filter(
    (key) => !process.env[key] || process.env[key]!.length === 0,
  );
}

/**
 * Build the M365Config from environment variables.
 * Throws if not fully configured.
 */
function getConfig(): M365Config {
  if (!isM365Configured()) {
    throw new Error(
      "M365 not configured. Set M365_TENANT_ID, M365_CLIENT_ID, and M365_CLIENT_SECRET.",
    );
  }
  return {
    tenantId: process.env.M365_TENANT_ID!,
    clientId: process.env.M365_CLIENT_ID!,
    clientSecret: process.env.M365_CLIENT_SECRET!,
    siteUrl: process.env.M365_SITE_URL,
  };
}

/* ------------------------------------------------------------------ */
/*  Token acquisition (client credentials flow)                        */
/* ------------------------------------------------------------------ */

interface TokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

let cachedToken: { token: string; expiresAt: number } | null = null;

/**
 * Acquire an access token using the OAuth 2.0 client credentials flow.
 * Tokens are cached until expiry.
 */
async function acquireToken(): Promise<string> {
  const config = getConfig();

  // Return cached token if still valid (with 60s buffer)
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.token;
  }

  const tokenUrl = `https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials",
  });

  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Failed to acquire M365 token: ${res.status} — ${errText}`);
  }

  const data = (await res.json()) as TokenResponse;
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };

  return cachedToken.token;
}

/* ------------------------------------------------------------------ */
/*  Graph API helpers                                                  */
/* ------------------------------------------------------------------ */

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

async function graphGet<T>(path: string): Promise<T> {
  const token = await acquireToken();
  const res = await fetch(`${GRAPH_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Graph API error: ${res.status} — ${errText}`);
  }

  return res.json() as Promise<T>;
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

/**
 * Get the current M365 connection status.
 */
export async function getM365Status(): Promise<M365Status> {
  const missingVars = getMissingM365Vars();

  if (missingVars.length > 0) {
    return {
      configured: false,
      connection: null,
      missingVars,
    };
  }

  try {
    // Verify connectivity by fetching organisation info
    const orgInfo = await graphGet<{ value: { displayName: string }[] }>("/organization");
    const orgName = orgInfo.value?.[0]?.displayName ?? "Unknown";

    return {
      configured: true,
      connection: {
        connected: true,
        provider: "sharepoint",
        siteName: orgName,
        tenantId: process.env.M365_TENANT_ID,
      },
      missingVars: [],
    };
  } catch {
    return {
      configured: true,
      connection: {
        connected: false,
        provider: "sharepoint",
      },
      missingVars: [],
    };
  }
}

/**
 * List files in a SharePoint document library folder.
 */
export async function listSharePointFiles(
  folderPath: string,
): Promise<M365FileItem[]> {
  if (!isM365Configured()) {
    throw new Error(
      "M365 not configured. Set M365_TENANT_ID, M365_CLIENT_ID, and M365_CLIENT_SECRET.",
    );
  }

  const config = getConfig();
  const siteUrl = config.siteUrl;

  // Build the Graph API path based on whether we have a site URL
  let graphPath: string;
  if (siteUrl) {
    // Parse site URL to extract hostname and site path
    const url = new URL(siteUrl);
    const hostname = url.hostname;
    const sitePath = url.pathname;
    graphPath = `/sites/${hostname}:${sitePath}:/drive/root:/${encodeURIComponent(folderPath)}:/children`;
  } else {
    // Default: use the root site's default document library
    graphPath = `/sites/root/drive/root:/${encodeURIComponent(folderPath)}:/children`;
  }

  interface DriveItemResponse {
    value: {
      id: string;
      name: string;
      size: number;
      lastModifiedDateTime: string;
      webUrl: string;
      file?: { mimeType: string };
      parentReference?: { path: string };
    }[];
  }

  const data = await graphGet<DriveItemResponse>(graphPath);

  return data.value
    .filter((item) => item.file) // Only files, not folders
    .map((item) => ({
      id: item.id,
      name: item.name,
      path: item.parentReference?.path
        ? `${item.parentReference.path}/${item.name}`
        : `/${item.name}`,
      size: item.size,
      lastModified: item.lastModifiedDateTime,
      webUrl: item.webUrl,
      mimeType: item.file?.mimeType ?? "application/octet-stream",
    }));
}

/**
 * Download a file from SharePoint by its drive item ID.
 */
export async function downloadSharePointFile(
  fileId: string,
): Promise<Buffer> {
  if (!isM365Configured()) {
    throw new Error(
      "M365 not configured. Set M365_TENANT_ID, M365_CLIENT_ID, and M365_CLIENT_SECRET.",
    );
  }

  const token = await acquireToken();
  const config = getConfig();

  let downloadUrl: string;
  if (config.siteUrl) {
    const url = new URL(config.siteUrl);
    const hostname = url.hostname;
    const sitePath = url.pathname;
    downloadUrl = `${GRAPH_BASE}/sites/${hostname}:${sitePath}:/drive/items/${fileId}/content`;
  } else {
    downloadUrl = `${GRAPH_BASE}/sites/root/drive/items/${fileId}/content`;
  }

  const res = await fetch(downloadUrl, {
    headers: { Authorization: `Bearer ${token}` },
    redirect: "follow",
  });

  if (!res.ok) {
    throw new Error(`Failed to download file ${fileId}: ${res.status}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
