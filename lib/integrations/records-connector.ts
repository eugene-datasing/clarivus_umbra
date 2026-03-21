/**
 * Records Management System (EDRMS) Integration Connector
 *
 * Provides connectivity to Electronic Document and Records Management Systems
 * such as SharePoint Records, OpenText, HP Records Manager (HPRM), or any
 * CMIS-compliant system.
 *
 * Requires RECORDS_PROVIDER, RECORDS_ENDPOINT, RECORDS_CLIENT_ID, and
 * RECORDS_CLIENT_SECRET environment variables to be configured. When not
 * configured, functions gracefully degrade and return appropriate status
 * information.
 */

import { logger } from "@/lib/logger";

const log = logger.child({ module: "records-connector" });

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface RecordsConnectorConfig {
  provider: "sharepoint-records" | "opentext" | "hprm" | "generic-cmis";
  endpoint: string;
  credentials: {
    clientId: string;
    clientSecret: string;
    tenantId?: string;
  };
}

export interface RecordMetadata {
  recordId: string;
  title: string;
  classification: string;
  retentionSchedule: string;
  disposalAction: string;
  archiveStatus: string;
}

export interface RecordsStatus {
  configured: boolean;
  provider: string | null;
  connected: boolean;
  lastSync: string | null;
  error?: string;
}

export interface RegisterRecordResult {
  success: boolean;
  externalRecordId?: string;
  error?: string;
}

export interface SyncDisposalResult {
  synced: number;
  errors: string[];
}

/* ------------------------------------------------------------------ */
/*  Environment variable checks                                        */
/* ------------------------------------------------------------------ */

const REQUIRED_ENV_VARS = [
  "RECORDS_PROVIDER",
  "RECORDS_ENDPOINT",
  "RECORDS_CLIENT_ID",
  "RECORDS_CLIENT_SECRET",
] as const;

/**
 * Check whether Records Management environment variables are configured.
 */
export function isRecordsConfigured(): boolean {
  return REQUIRED_ENV_VARS.every(
    (key) => typeof process.env[key] === "string" && process.env[key]!.length > 0,
  );
}

/**
 * Return a list of missing Records Management environment variable names.
 */
export function getMissingRecordsVars(): string[] {
  return REQUIRED_ENV_VARS.filter(
    (key) => !process.env[key] || process.env[key]!.length === 0,
  );
}

/**
 * Build the RecordsConnectorConfig from environment variables.
 * Throws if not fully configured.
 */
function getConfig(): RecordsConnectorConfig {
  if (!isRecordsConfigured()) {
    throw new Error(
      "Records Management not configured. Set RECORDS_PROVIDER, RECORDS_ENDPOINT, RECORDS_CLIENT_ID, and RECORDS_CLIENT_SECRET.",
    );
  }

  const provider = process.env.RECORDS_PROVIDER as RecordsConnectorConfig["provider"];
  const validProviders: RecordsConnectorConfig["provider"][] = [
    "sharepoint-records",
    "opentext",
    "hprm",
    "generic-cmis",
  ];

  if (!validProviders.includes(provider)) {
    throw new Error(
      `Invalid RECORDS_PROVIDER "${provider}". Must be one of: ${validProviders.join(", ")}`,
    );
  }

  return {
    provider,
    endpoint: process.env.RECORDS_ENDPOINT!,
    credentials: {
      clientId: process.env.RECORDS_CLIENT_ID!,
      clientSecret: process.env.RECORDS_CLIENT_SECRET!,
      tenantId: process.env.RECORDS_TENANT_ID,
    },
  };
}

/* ------------------------------------------------------------------ */
/*  Token acquisition                                                  */
/* ------------------------------------------------------------------ */

interface TokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

let cachedToken: { token: string; expiresAt: number } | null = null;

/**
 * Acquire an access token using OAuth 2.0 client credentials.
 * Tokens are cached until expiry.
 */
async function acquireToken(): Promise<string> {
  const config = getConfig();

  // Return cached token if still valid (with 60s buffer)
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.token;
  }

  const tokenUrl = `${config.endpoint}/auth/token`;
  const body = new URLSearchParams({
    client_id: config.credentials.clientId,
    client_secret: config.credentials.clientSecret,
    grant_type: "client_credentials",
  });

  if (config.credentials.tenantId) {
    body.set("tenant_id", config.credentials.tenantId);
  }

  log.debug("Acquiring records management token", { endpoint: config.endpoint });

  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Failed to acquire records token: ${res.status} - ${errText}`);
  }

  const data = (await res.json()) as TokenResponse;
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };

  return cachedToken.token;
}

/* ------------------------------------------------------------------ */
/*  API helpers                                                        */
/* ------------------------------------------------------------------ */

async function apiGet<T>(path: string): Promise<T> {
  const config = getConfig();
  const token = await acquireToken();
  const res = await fetch(`${config.endpoint}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Records API error: ${res.status} - ${errText}`);
  }

  return res.json() as Promise<T>;
}

async function apiPost<T>(path: string, payload: unknown): Promise<T> {
  const config = getConfig();
  const token = await acquireToken();
  const res = await fetch(`${config.endpoint}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Records API error: ${res.status} - ${errText}`);
  }

  return res.json() as Promise<T>;
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

/**
 * Get the current Records Management connection status.
 */
export async function getRecordsStatus(): Promise<RecordsStatus> {
  if (!isRecordsConfigured()) {
    return {
      configured: false,
      provider: null,
      connected: false,
      lastSync: null,
    };
  }

  try {
    const config = getConfig();

    // Verify connectivity by hitting a health / status endpoint
    await apiGet("/api/v1/health");

    log.info("Records management connection verified", { provider: config.provider });

    return {
      configured: true,
      provider: config.provider,
      connected: true,
      lastSync: new Date().toISOString(),
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    log.warn("Records management connection failed", { error: errorMessage });

    return {
      configured: true,
      provider: process.env.RECORDS_PROVIDER ?? null,
      connected: false,
      lastSync: null,
      error: errorMessage,
    };
  }
}

/**
 * Register a document as an official record in the records management system.
 */
export async function registerRecord(
  documentId: string,
  metadata: RecordMetadata,
): Promise<RegisterRecordResult> {
  if (!isRecordsConfigured()) {
    return {
      success: false,
      error: "Records management system is not configured.",
    };
  }

  try {
    const result = await apiPost<{ id: string }>("/api/v1/records", {
      sourceDocumentId: documentId,
      ...metadata,
    });

    log.info("Record registered successfully", {
      documentId,
      externalRecordId: result.id,
    });

    return {
      success: true,
      externalRecordId: result.id,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    log.error("Failed to register record", { documentId, error: errorMessage });

    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Retrieve record metadata from the records management system.
 */
export async function getRecordMetadata(
  externalRecordId: string,
): Promise<RecordMetadata | null> {
  if (!isRecordsConfigured()) {
    log.warn("Cannot fetch record metadata: records management not configured");
    return null;
  }

  try {
    const record = await apiGet<RecordMetadata>(
      `/api/v1/records/${encodeURIComponent(externalRecordId)}`,
    );

    return record;
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    log.error("Failed to fetch record metadata", {
      externalRecordId,
      error: errorMessage,
    });
    return null;
  }
}

/**
 * Sync disposal and retention schedules from the records management system
 * for all documents in a given case.
 */
export async function syncDisposalSchedule(
  caseId: string,
): Promise<SyncDisposalResult> {
  if (!isRecordsConfigured()) {
    return {
      synced: 0,
      errors: ["Records management system is not configured."],
    };
  }

  try {
    const result = await apiPost<{ synced: number; errors: string[] }>(
      "/api/v1/disposal/sync",
      { caseId },
    );

    log.info("Disposal schedule sync completed", {
      caseId,
      synced: result.synced,
      errorCount: result.errors.length,
    });

    return result;
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    log.error("Failed to sync disposal schedule", { caseId, error: errorMessage });

    return {
      synced: 0,
      errors: [errorMessage],
    };
  }
}
