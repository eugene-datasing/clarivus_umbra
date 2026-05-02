/**
 * Typed environment variable configuration for the Umbra.
 *
 * Import `env` from this module instead of using `process.env` directly.
 * Validation runs on first import so the app fails fast if required
 * variables are missing.
 *
 * In development, Azure-specific variables are demoted to warnings so
 * local dev can run without them.
 */

import { validateEnv, type EnvVarSpec } from "./validate-env";

// ---------------------------------------------------------------------------
// Variable specifications
// ---------------------------------------------------------------------------

const specs: EnvVarSpec[] = [
  // --- Core (always required) ---
  {
    name: "DATABASE_URL",
    required: true,
    description: "PostgreSQL connection string",
  },
  {
    name: "AUTH_SECRET",
    required: true,
    description: "NextAuth secret for session signing",
  },

  // --- AI pipeline (required in production, warn in dev) ---
  {
    name: "AZURE_OPENAI_ENDPOINT",
    required: true,
    productionOnly: true,
    description: "Azure OpenAI endpoint URL for AI detection",
  },
  {
    name: "AZURE_OPENAI_KEY",
    required: true,
    productionOnly: true,
    description: "Azure OpenAI API key",
  },
  {
    name: "AZURE_OPENAI_DEPLOYMENT",
    required: true,
    productionOnly: true,
    description: "Azure OpenAI deployment name (e.g. gpt-4o)",
  },
  {
    name: "AZURE_OPENAI_DEPLOYMENT_DETECTION",
    required: false,
    description:
      "Optional override: deployment used by ai-detect; falls back to AZURE_OPENAI_DEPLOYMENT",
  },
  {
    name: "AZURE_OPENAI_DEPLOYMENT_CLASSIFICATION",
    required: false,
    description:
      "Optional override: deployment used by doc-classify; falls back to AZURE_OPENAI_DEPLOYMENT",
  },
  {
    name: "AI_DETECT_SINGLE_BATCH_MAX_PAGES",
    required: false,
    description:
      "Max prepared-pages count at which ai-detect uses a single chat completion call (default 6). Larger docs fall back to BATCH_SIZE=3.",
  },

  // --- OCR (required in production, warn in dev) ---
  {
    name: "AZURE_DI_ENDPOINT",
    required: true,
    productionOnly: true,
    description: "Azure Document Intelligence endpoint URL for OCR",
  },
  {
    name: "AZURE_DI_KEY",
    required: true,
    productionOnly: true,
    description: "Azure Document Intelligence API key",
  },

  // --- Optional: Azure AD SSO ---
  {
    name: "AZURE_AD_CLIENT_ID",
    required: false,
    description: "Azure AD application (client) ID for SSO",
  },
  {
    name: "AZURE_AD_CLIENT_SECRET",
    required: false,
    description: "Azure AD client secret for SSO",
  },
  {
    name: "AZURE_AD_TENANT_ID",
    required: false,
    description: "Azure AD tenant ID for SSO",
  },

  // --- Optional: SCIM ---
  {
    name: "SCIM_API_TOKEN",
    required: false,
    description: "Bearer token for SCIM user provisioning endpoint",
  },

  // --- Optional: Azure Blob Storage ---
  {
    name: "AZURE_STORAGE_CONNECTION_STRING",
    required: false,
    description: "Azure Blob Storage connection string",
  },
  {
    name: "AZURE_STORAGE_ACCOUNT_NAME",
    required: false,
    description: "Azure Blob Storage account name",
  },

  // --- Optional: Azure Communication Services (email) ---
  {
    name: "AZURE_COMMUNICATION_CONNECTION_STRING",
    required: false,
    description: "Azure Communication Services connection string for email",
  },

  // --- Optional: Telemetry ---
  {
    name: "APPLICATIONINSIGHTS_CONNECTION_STRING",
    required: false,
    description: "Azure Application Insights connection string for telemetry",
  },
];

// ---------------------------------------------------------------------------
// Validate on import (skip during Next.js production build — env vars are
// injected at runtime via Azure App Service / Key Vault, not at build time)
// ---------------------------------------------------------------------------

if (process.env.NEXT_PHASE !== "phase-production-build") {
  validateEnv(specs);
}

// ---------------------------------------------------------------------------
// Typed env object
// ---------------------------------------------------------------------------

function get(name: string): string {
  return process.env[name] ?? "";
}

function getOptional(name: string): string | undefined {
  const val = process.env[name];
  return val && val.trim() !== "" ? val : undefined;
}

/**
 * Typed, validated environment variables.
 *
 * Use this instead of `process.env` throughout the codebase.
 * Values are read lazily from `process.env` so runtime overrides
 * (e.g. in tests) are respected.
 */
export const env = {
  // Core
  get DATABASE_URL() { return get("DATABASE_URL"); },
  get AUTH_SECRET() { return get("AUTH_SECRET"); },
  get NODE_ENV() { return process.env.NODE_ENV ?? "development"; },

  // AI pipeline
  get AZURE_OPENAI_ENDPOINT() { return getOptional("AZURE_OPENAI_ENDPOINT"); },
  get AZURE_OPENAI_KEY() { return getOptional("AZURE_OPENAI_KEY"); },
  get AZURE_OPENAI_DEPLOYMENT() { return getOptional("AZURE_OPENAI_DEPLOYMENT"); },
  get AZURE_OPENAI_DEPLOYMENT_DETECTION() { return getOptional("AZURE_OPENAI_DEPLOYMENT_DETECTION"); },
  get AZURE_OPENAI_DEPLOYMENT_CLASSIFICATION() { return getOptional("AZURE_OPENAI_DEPLOYMENT_CLASSIFICATION"); },
  get AI_DETECT_SINGLE_BATCH_MAX_PAGES() { return getOptional("AI_DETECT_SINGLE_BATCH_MAX_PAGES"); },

  // OCR
  get AZURE_DI_ENDPOINT() { return getOptional("AZURE_DI_ENDPOINT"); },
  get AZURE_DI_KEY() { return getOptional("AZURE_DI_KEY"); },

  // Azure AD SSO
  get AZURE_AD_CLIENT_ID() { return getOptional("AZURE_AD_CLIENT_ID"); },
  get AZURE_AD_CLIENT_SECRET() { return getOptional("AZURE_AD_CLIENT_SECRET"); },
  get AZURE_AD_TENANT_ID() { return getOptional("AZURE_AD_TENANT_ID"); },

  // SCIM
  get SCIM_API_TOKEN() { return getOptional("SCIM_API_TOKEN"); },

  // Azure Blob Storage
  get AZURE_STORAGE_CONNECTION_STRING() { return getOptional("AZURE_STORAGE_CONNECTION_STRING"); },
  get AZURE_STORAGE_ACCOUNT_NAME() { return getOptional("AZURE_STORAGE_ACCOUNT_NAME"); },

  // Azure Communication Services
  get AZURE_COMMUNICATION_CONNECTION_STRING() { return getOptional("AZURE_COMMUNICATION_CONNECTION_STRING"); },

  // Telemetry
  get APPLICATIONINSIGHTS_CONNECTION_STRING() { return getOptional("APPLICATIONINSIGHTS_CONNECTION_STRING"); },
} as const;

export type Env = typeof env;
