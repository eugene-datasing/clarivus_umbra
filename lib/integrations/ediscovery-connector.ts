/**
 * eDiscovery Platform Integration Connector
 *
 * Provides connectivity to eDiscovery platforms such as Relativity, Nuix,
 * Clearwell, or generic REST-based systems. Enables export of documents
 * and metadata to eDiscovery matters and import of custodian information.
 *
 * Requires EDISCOVERY_PROVIDER, EDISCOVERY_ENDPOINT, and EDISCOVERY_API_KEY
 * environment variables to be configured. When not configured, functions
 * gracefully degrade and return appropriate status information.
 */

import { logger } from "@/lib/logger";

const log = logger.child({ module: "ediscovery-connector" });

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface EDiscoveryConfig {
  provider: "relativity" | "nuix" | "clearwell" | "generic";
  endpoint: string;
  apiKey: string;
  caseMapping?: string;
}

export interface EDiscoveryMatter {
  matterId: string;
  matterName: string;
  status: string;
  createdAt: string;
  documentCount: number;
}

export interface EDiscoveryStatus {
  configured: boolean;
  provider: string | null;
  connected: boolean;
  matterCount: number;
  error?: string;
}

export interface CreateMatterResult {
  success: boolean;
  matterId?: string;
  error?: string;
}

export interface ExportToMatterResult {
  success: boolean;
  exported: number;
  errors: string[];
}

export interface Custodian {
  name: string;
  email: string;
  role: string;
}

export interface ImportCustodianResult {
  custodians: Custodian[];
  error?: string;
}

/* ------------------------------------------------------------------ */
/*  Environment variable checks                                        */
/* ------------------------------------------------------------------ */

const REQUIRED_ENV_VARS = [
  "EDISCOVERY_PROVIDER",
  "EDISCOVERY_ENDPOINT",
  "EDISCOVERY_API_KEY",
] as const;

/**
 * Check whether eDiscovery environment variables are configured.
 */
export function isEDiscoveryConfigured(): boolean {
  return REQUIRED_ENV_VARS.every(
    (key) => typeof process.env[key] === "string" && process.env[key]!.length > 0,
  );
}

/**
 * Return a list of missing eDiscovery environment variable names.
 */
export function getMissingEDiscoveryVars(): string[] {
  return REQUIRED_ENV_VARS.filter(
    (key) => !process.env[key] || process.env[key]!.length === 0,
  );
}

/**
 * Build the EDiscoveryConfig from environment variables.
 * Throws if not fully configured.
 */
function getConfig(): EDiscoveryConfig {
  if (!isEDiscoveryConfigured()) {
    throw new Error(
      "eDiscovery not configured. Set EDISCOVERY_PROVIDER, EDISCOVERY_ENDPOINT, and EDISCOVERY_API_KEY.",
    );
  }

  const provider = process.env.EDISCOVERY_PROVIDER as EDiscoveryConfig["provider"];
  const validProviders: EDiscoveryConfig["provider"][] = [
    "relativity",
    "nuix",
    "clearwell",
    "generic",
  ];

  if (!validProviders.includes(provider)) {
    throw new Error(
      `Invalid EDISCOVERY_PROVIDER "${provider}". Must be one of: ${validProviders.join(", ")}`,
    );
  }

  return {
    provider,
    endpoint: process.env.EDISCOVERY_ENDPOINT!,
    apiKey: process.env.EDISCOVERY_API_KEY!,
    caseMapping: process.env.EDISCOVERY_CASE_MAPPING,
  };
}

/* ------------------------------------------------------------------ */
/*  API helpers                                                        */
/* ------------------------------------------------------------------ */

async function apiGet<T>(path: string): Promise<T> {
  const config = getConfig();
  const res = await fetch(`${config.endpoint}${path}`, {
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "X-API-Key": config.apiKey,
    },
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`eDiscovery API error: ${res.status} - ${errText}`);
  }

  return res.json() as Promise<T>;
}

async function apiPost<T>(path: string, payload: unknown): Promise<T> {
  const config = getConfig();
  const res = await fetch(`${config.endpoint}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "X-API-Key": config.apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`eDiscovery API error: ${res.status} - ${errText}`);
  }

  return res.json() as Promise<T>;
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

/**
 * Get the current eDiscovery connection status.
 */
export async function getEDiscoveryStatus(): Promise<EDiscoveryStatus> {
  if (!isEDiscoveryConfigured()) {
    return {
      configured: false,
      provider: null,
      connected: false,
      matterCount: 0,
    };
  }

  try {
    const config = getConfig();

    // Verify connectivity and get matter count
    const matters = await apiGet<{ total: number }>("/api/v1/matters?count=true");

    log.info("eDiscovery connection verified", {
      provider: config.provider,
      matterCount: matters.total,
    });

    return {
      configured: true,
      provider: config.provider,
      connected: true,
      matterCount: matters.total,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    log.warn("eDiscovery connection failed", { error: errorMessage });

    return {
      configured: true,
      provider: process.env.EDISCOVERY_PROVIDER ?? null,
      connected: false,
      matterCount: 0,
      error: errorMessage,
    };
  }
}

/**
 * Create an eDiscovery matter from aUmbra case reference.
 */
export async function createMatter(
  caseReference: string,
  description: string,
): Promise<CreateMatterResult> {
  if (!isEDiscoveryConfigured()) {
    return {
      success: false,
      error: "eDiscovery platform is not configured.",
    };
  }

  try {
    const result = await apiPost<{ matterId: string }>("/api/v1/matters", {
      name: caseReference,
      description,
      source: "veil",
    });

    log.info("eDiscovery matter created", {
      caseReference,
      matterId: result.matterId,
    });

    return {
      success: true,
      matterId: result.matterId,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    log.error("Failed to create eDiscovery matter", {
      caseReference,
      error: errorMessage,
    });

    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Export documents from Umbra to an eDiscovery matter.
 */
export async function exportToMatter(
  matterId: string,
  documentIds: string[],
): Promise<ExportToMatterResult> {
  if (!isEDiscoveryConfigured()) {
    return {
      success: false,
      exported: 0,
      errors: ["eDiscovery platform is not configured."],
    };
  }

  try {
    const result = await apiPost<{ exported: number; errors: string[] }>(
      `/api/v1/matters/${encodeURIComponent(matterId)}/documents`,
      { documentIds, source: "veil" },
    );

    log.info("Documents exported to eDiscovery matter", {
      matterId,
      requested: documentIds.length,
      exported: result.exported,
      errorCount: result.errors.length,
    });

    return {
      success: result.errors.length === 0,
      exported: result.exported,
      errors: result.errors,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    log.error("Failed to export documents to eDiscovery", {
      matterId,
      error: errorMessage,
    });

    return {
      success: false,
      exported: 0,
      errors: [errorMessage],
    };
  }
}

/**
 * Import custodian information from an eDiscovery matter.
 */
export async function importCustodianList(
  matterId: string,
): Promise<ImportCustodianResult> {
  if (!isEDiscoveryConfigured()) {
    return {
      custodians: [],
      error: "eDiscovery platform is not configured.",
    };
  }

  try {
    const result = await apiGet<{ custodians: Custodian[] }>(
      `/api/v1/matters/${encodeURIComponent(matterId)}/custodians`,
    );

    log.info("Custodian list imported from eDiscovery", {
      matterId,
      custodianCount: result.custodians.length,
    });

    return {
      custodians: result.custodians,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    log.error("Failed to import custodian list", {
      matterId,
      error: errorMessage,
    });

    return {
      custodians: [],
      error: errorMessage,
    };
  }
}
