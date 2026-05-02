/**
 * Document-level classification step for the Umbra pipeline.
 *
 * Runs a single, lightweight AI call to classify the document's nature before
 * the page-level detection batches.  The classification result is injected into
 * every subsequent detection batch so GPT-4o has document-level context even
 * though it only sees 3 pages at a time.
 */

import { AzureOpenAI } from "openai";
import type { ExtractedPage } from "./extract";
import {
  resilientOpenAICall,
  CircuitOpenError,
} from "@/lib/resilience/azure-services";
import { logger } from "@/lib/logger";

const log = logger.child({ module: "doc-classify" });

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DocumentClassification {
  documentType: string;
  likelyGrounds: string[];
  contextNotes: string;
  containsLegalAdvice: boolean;
  containsPersonnelInfo: boolean;
  containsCommercialInfo: boolean;
  containsCulturalContent: boolean;
  containsEnforcementInfo: boolean;
}

export const DEFAULT_CLASSIFICATION: DocumentClassification = {
  documentType: "other",
  likelyGrounds: [],
  contextNotes: "",
  containsLegalAdvice: false,
  containsPersonnelInfo: false,
  containsCommercialInfo: false,
  containsCulturalContent: false,
  containsEnforcementInfo: false,
};

const VALID_DOCUMENT_TYPES = new Set([
  "legal-opinion",
  "internal-memo",
  "external-correspondence",
  "complaint",
  "investigation-report",
  "resource-consent",
  "meeting-minutes",
  "policy-document",
  "financial-report",
  "contract",
  "email-chain",
  "technical-report",
  "media-communication",
  "personnel-record",
  "other",
]);

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

const CLASSIFY_SYSTEM_PROMPT = `You are a document classifier for a New Zealand local council LGOIMA disclosure workflow.

Given excerpts from a document, classify it and return a JSON object with:
{
  "documentType": string — one of: "legal-opinion", "internal-memo", "external-correspondence", "complaint", "investigation-report", "resource-consent", "meeting-minutes", "policy-document", "financial-report", "contract", "email-chain", "technical-report", "media-communication", "personnel-record", "other",
  "likelyGrounds": string[] — up to 4 LGOIMA ground references most likely to be relevant (e.g. ["s7(2)(a)", "s7(2)(g)"]),
  "contextNotes": string — 1-2 sentence summary of what the document appears to be about and any sensitivity indicators,
  "containsLegalAdvice": boolean,
  "containsPersonnelInfo": boolean,
  "containsCommercialInfo": boolean,
  "containsCulturalContent": boolean,
  "containsEnforcementInfo": boolean
}`;

// ---------------------------------------------------------------------------
// Azure OpenAI client (lazy singleton, shared with ai-detect)
// ---------------------------------------------------------------------------

let _client: AzureOpenAI | null = null;

/**
 * Resolve the Azure OpenAI deployment name for classification calls.
 * AZURE_OPENAI_DEPLOYMENT_CLASSIFICATION wins when set, falling back to
 * the shared AZURE_OPENAI_DEPLOYMENT, then to a hard-coded "gpt-4o"
 * literal. Split from detection so the two paths can run on different
 * deployments.
 */
function resolveClassificationDeployment(): string {
  return (
    process.env.AZURE_OPENAI_DEPLOYMENT_CLASSIFICATION ||
    process.env.AZURE_OPENAI_DEPLOYMENT ||
    "gpt-4o"
  );
}

function getClient(deployment: string): AzureOpenAI {
  if (_client) return _client;

  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const apiKey = process.env.AZURE_OPENAI_KEY;

  if (!endpoint || !apiKey || !deployment) {
    throw new Error(
      "Azure OpenAI credentials missing. Set AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_KEY, and AZURE_OPENAI_DEPLOYMENT (or AZURE_OPENAI_DEPLOYMENT_CLASSIFICATION).",
    );
  }

  _client = new AzureOpenAI({
    endpoint,
    apiKey,
    deployment,
    apiVersion: "2024-10-21",
  });

  return _client;
}

// ---------------------------------------------------------------------------
// Summary builder
// ---------------------------------------------------------------------------

/**
 * Build a compact text summary from the document pages for classification.
 *
 * Takes:
 * - First 500 chars from page 1
 * - First 200 chars from the last page (if different from page 1)
 * - First 200 chars from the middle page (if > 6 pages)
 */
export function buildClassificationSummary(pages: ExtractedPage[]): string {
  if (pages.length === 0) return "";

  const parts: string[] = [];

  // First page — 500 chars
  const firstText = (pages[0].text || "").slice(0, 500);
  parts.push(`[Page 1 excerpt]\n${firstText}`);

  // Middle page — only if > 6 pages
  if (pages.length > 6) {
    const midIdx = Math.floor(pages.length / 2);
    const midText = (pages[midIdx].text || "").slice(0, 200);
    parts.push(`[Page ${pages[midIdx].pageNumber} excerpt (middle)]\n${midText}`);
  }

  // Last page — 200 chars (skip if same as first)
  if (pages.length > 1) {
    const lastPage = pages[pages.length - 1];
    const lastText = (lastPage.text || "").slice(0, 200);
    parts.push(`[Page ${lastPage.pageNumber} excerpt (last)]\n${lastText}`);
  }

  return parts.join("\n\n");
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validateClassification(raw: unknown): DocumentClassification {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_CLASSIFICATION };
  const obj = raw as Record<string, unknown>;

  const documentType =
    typeof obj.documentType === "string" && VALID_DOCUMENT_TYPES.has(obj.documentType)
      ? obj.documentType
      : "other";

  const likelyGrounds = Array.isArray(obj.likelyGrounds)
    ? (obj.likelyGrounds as unknown[])
        .filter((g): g is string => typeof g === "string")
        .slice(0, 4)
    : [];

  return {
    documentType,
    likelyGrounds,
    contextNotes:
      typeof obj.contextNotes === "string" ? obj.contextNotes : "",
    containsLegalAdvice: obj.containsLegalAdvice === true,
    containsPersonnelInfo: obj.containsPersonnelInfo === true,
    containsCommercialInfo: obj.containsCommercialInfo === true,
    containsCulturalContent: obj.containsCulturalContent === true,
    containsEnforcementInfo: obj.containsEnforcementInfo === true,
  };
}

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

/**
 * Classify a document by sending a compact summary to GPT-4o.
 *
 * Returns a {@link DocumentClassification} with the document type,
 * likely LGOIMA grounds, and content flags.  On failure, returns
 * {@link DEFAULT_CLASSIFICATION} so the pipeline can continue.
 */
export async function classifyDocument(
  pages: ExtractedPage[],
): Promise<DocumentClassification> {
  if (pages.length === 0) return { ...DEFAULT_CLASSIFICATION };

  const summary = buildClassificationSummary(pages);
  if (summary.trim().length < 20) return { ...DEFAULT_CLASSIFICATION };

  try {
    const classificationDeployment = resolveClassificationDeployment();
    const client = getClient(classificationDeployment);

    const response = await resilientOpenAICall(() =>
      client.chat.completions.create({
        model: classificationDeployment,
        messages: [
          { role: "system", content: CLASSIFY_SYSTEM_PROMPT },
          { role: "user", content: summary },
        ],
        temperature: 0.0,
        max_tokens: 512,
        response_format: { type: "json_object" },
      }),
    );

    const content = response.choices?.[0]?.message?.content;
    if (!content) {
      log.warn("Empty classification response");
      return { ...DEFAULT_CLASSIFICATION };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      log.warn("Failed to parse classification response as JSON", {
        preview: content.slice(0, 200),
      });
      return { ...DEFAULT_CLASSIFICATION };
    }

    return validateClassification(parsed);
  } catch (error) {
    if (error instanceof CircuitOpenError) {
      log.warn("Circuit breaker OPEN for Azure OpenAI, skipping classification");
    } else {
      log.error("Document classification failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return { ...DEFAULT_CLASSIFICATION };
  }
}
