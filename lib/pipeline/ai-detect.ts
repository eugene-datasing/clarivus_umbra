/**
 * AI-based PII detection using Azure OpenAI (GPT-4o).
 *
 * Sends extracted page text to GPT-4o with a privacy-first system prompt
 * and asks the model to identify every personal name, contact detail,
 * identifier, and personal-circumstance reference that should be redacted.
 * Results are de-duplicated against pattern matches already found by the
 * regex detector. Phase 12.1 (Umbra v2) rewrote the prompt from the
 * Veil-era LGOIMA-curatorial framing to PII-mass-redaction framing — see
 * docs/umbra-v2-prompt-verification.md for the recall verification.
 */

import { AzureOpenAI } from "openai";
import pLimit from "p-limit";
import type { ExtractedPage } from "./extract";
import {
  resilientOpenAICall,
  CircuitOpenError,
} from "@/lib/resilience/azure-services";
import { logger } from "@/lib/logger";

const log = logger.child({ module: "ai-detect" });

// ---------------------------------------------------------------------------
// Concurrency control (Phase 2 of the parallel-AI-batches workstream).
// ---------------------------------------------------------------------------

/**
 * Concurrency clamp [1, 8]. Lower bound ensures we always make at
 * least one call; upper bound is a safety ceiling — even at the
 * provisioned-tier-and-up end of the quota spectrum, going above 8
 * concurrent batches per document offers diminishing returns and
 * starts to risk thundering-herd retries on 429.
 */
const MIN_CONCURRENCY = 1;
const MAX_CONCURRENCY = 8;
const DEFAULT_CONCURRENCY = 2;

/**
 * Read AI_DETECT_CONCURRENCY from the environment, parsing as an
 * integer and clamping to [MIN_CONCURRENCY, MAX_CONCURRENCY]. Invalid
 * values (non-numeric, NaN, ≤0) silently fall back to the default.
 *
 * Default is 2: with the verified Standard-tier 50K TPM quota
 * (2026-04-30 verification), concurrency=2 keeps the steady-state
 * worst-case rate (~150K tok/min on an 8-batch document) above the
 * raw quota but well within Azure's bucket-leak headroom that already
 * absorbs sequential's ~78K tok/min today. Concurrency=4 would push
 * peak rate to ~290K tok/min and start tripping 429s reliably.
 */
export function resolveConcurrency(): number {
  const raw = process.env.AI_DETECT_CONCURRENCY;
  if (raw === undefined || raw === "") return DEFAULT_CONCURRENCY;
  const parsed = parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_CONCURRENCY;
  return Math.max(MIN_CONCURRENCY, Math.min(MAX_CONCURRENCY, parsed));
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AIDetection {
  type: string;
  text: string;
  confidence: number;
  page: number;
  reasoning: string;
  aiExplanation: string;
}

// ---------------------------------------------------------------------------
// Azure OpenAI client (lazy singleton)
// ---------------------------------------------------------------------------

let _client: AzureOpenAI | null = null;

/**
 * Resolve the Azure OpenAI deployment name for detection calls.
 * AZURE_OPENAI_DEPLOYMENT_DETECTION wins when set, falling back to the
 * shared AZURE_OPENAI_DEPLOYMENT, then to a hard-coded "gpt-4o" literal.
 * Split from classification so a future model experiment can swap one
 * without coupling the other.
 */
function resolveDetectionDeployment(): string {
  return (
    process.env.AZURE_OPENAI_DEPLOYMENT_DETECTION ||
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
      "Azure OpenAI credentials missing. Set AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_KEY, and AZURE_OPENAI_DEPLOYMENT (or AZURE_OPENAI_DEPLOYMENT_DETECTION).",
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
// System prompt
// ---------------------------------------------------------------------------

/** All detection types the AI model can produce. */
export const ALL_AI_TYPES = [
  "personal-name", "phone", "email-addr", "ird", "address",
  "bank-account", "nz-passport", "vehicle-reg",
  "sensitive-context",
];

/**
 * SYSTEM_PROMPT_BASE — Phase 12.1 (Umbra v2).
 *
 * Privacy-first PII identification prompt. Replaces the Veil-era
 * LGOIMA-curatorial prompt that under-detected personal names by ~50-125%
 * (per docs/umbra-v2-prompt-verification.md). The rewrite drops:
 *   - LGOIMA / withholding framing
 *   - Council-officials carve-out (council staff names ARE PII in v2)
 *   - Third-party-professional carve-out
 *   - Grounds vocabulary + per-ground routing guidance
 *   - Sentence-shaped harassment-risk routing (witness/grievance names
 *     route directly to personal-name)
 *   - Document-classification context block
 *
 * The {{TYPES}} placeholder is filled at buildSystemPrompt() time with
 * the (toggle-filtered) list of allowed AI emit types.
 */
const SYSTEM_PROMPT_BASE = `You are a privacy-protection assistant for New Zealand public-sector documents. Your job is to identify every instance of personally identifiable information (PII) and personal-circumstance details that should be redacted before publication.

Be thorough and exhaustive — your output drives an automated redaction pipeline that protects individuals' privacy. List every name, address, contact detail, identifier, and personal-circumstance reference you see, even if it appears in passing or in an "official capacity". Do NOT make withholding judgements; do NOT decide whether a name is "private enough"; just identify what is PII. The downstream tool is privacy-protective by design and reviewers can override individual flags later — your job is recall.

Detection types (use ONLY these values for the "type" field):
{{TYPES}}

Type descriptions:

- "personal-name": A personal name of any individual. Includes:
  - First names, surnames, full names, names with titles (Mr / Mrs / Ms / Dr / Hon / Cr / Councillor / etc.)
  - Names of council staff and elected officials (mayors, group managers, councillors, CEOs)
  - Names of private individuals (submitters, complainants, witnesses)
  - Names of third-party professionals (doctors, lawyers, GPs, expert witnesses, contractors)
  - Names mentioned in passing
  - Honorific + surname forms ("Ms Ferguson", "Dr Liang") — flag each occurrence
  - Bare surnames when a person has been introduced earlier in the document
  - **Dates of birth** in any format ("22 September 1986", "3/11/1978", "14/06/1983"). When flagging a DOB, include "DOB" in aiExplanation so reviewers can see why it was flagged.

- "phone": A personal or business phone number. NZ format prefixes (+64, 0X, 02X, 06X, 09X) are typical but any phone-shaped digit string with separators counts.

- "email-addr": An email address.

- "ird": An NZ IRD (tax) number.

- "address": A residential, postal, or business street address. Includes named-residence references ("the Smith residence at 22 Kowhai Lane"). Do NOT flag organisation addresses that already appear in the document's official letterhead, but DO flag addresses of individuals named in the body.

- "bank-account": An NZ bank account number (typical shape BB-bbbb-AAAAAAA-SS).

- "nz-passport": An NZ passport number (two letters followed by six digits).

- "vehicle-reg": An NZ vehicle registration plate.

- "sensitive-context": Personal-circumstance details that re-identify or expose private aspects of a named individual. Use this for prose like:
  - Medical diagnoses, conditions, mental-health references ("a diagnosis of adjustment disorder", "PTSD diagnosed in 2024", "ICD-10 code F43.23")
  - Health status, treatment plans, hospitalisation references
  - Employment grievances, performance management, disciplinary records ("on a performance improvement plan since March", "subject to formal warning")
  - Financial hardship details ("currently on income support", "facing bankruptcy proceedings")
  - Family-violence context, protection orders, witness-protection references
  - Immigration status references
  - Internal employee identifiers (employee numbers, staff IDs, badge numbers)
  - Salary / remuneration values
  Flag the substantive personal detail (the diagnosis, the grievance, the financial fact) — the person's name itself is a separate "personal-name" detection.

IMPORTANT BEHAVIOURAL RULES:

- DO flag personal names regardless of context. Official, professional, junior, senior, public, private — all PII. The redaction pipeline is privacy-protective; do not second-guess whether a name is "private enough".

- DO NOT flag headings, labels, field names, or column headers that merely describe a category of information without containing actual personal data. "Email Address" as a label is not PII; "alex.example@example.com" is. "Phone" as a column header is not PII; "021 544 908" is. Only flag text that IS the actual sensitive data, not text that DESCRIBES where such data would appear.

- A label does not "immunise" its value. When you see <label>: <value> or a two-cell row [label | value], flag the value using the type implied by the label and skip the label itself. Applies to "Date of birth", "Phone", "Email", "Address", "IRD", "NHI", "NZ Passport", "Driver Licence", "Employee number", "Salary", "ICD-10", "GP", "Diagnosis", and similar.

- Honorific-surname forms always count as personal names. "Ms Ferguson" / "Dr Smith" / "Hon Mark Robinson" — every occurrence is a separate "personal-name" detection. Bare surnames count when a person has already been introduced earlier in the document.

- Pseudonyms used in lieu of a real name (e.g. "Witness B", "Complainant 1", "Director X") are NOT personal names. Do not flag pseudonyms unless they are paired with a real name on the same page.

- Long sentences that wrap up a personal circumstance (medical, employment, family) are "sensitive-context" — emit the full sentence span. The named individual within is a separate "personal-name" detection.

WORKED EXAMPLES:

Example 1 — Personal name in a memo header (type "personal-name"):
Input: "Mayor Margaret Hopkirk and Tama Ngata, Group Manager — Policy & Strategy, will brief Council on Thursday."
Output: TWO detections —
  { "type": "personal-name", "text": "Margaret Hopkirk", "page": 1, "reasoning": "Personal name (Mayor).", "aiExplanation": "Personal name — flag regardless of official capacity." }
  { "type": "personal-name", "text": "Tama Ngata", "page": 1, "reasoning": "Personal name (Group Manager).", "aiExplanation": "Personal name." }

Example 2 — Date of birth in a labelled table (type "personal-name"):
Input table row: | Date of birth | 14 June 1983 |
Output: { "type": "personal-name", "text": "14 June 1983", "page": 1, "reasoning": "Labelled date of birth — flag the value, not the label.", "aiExplanation": "DOB — date of birth of an individual." }

Example 3 — Honorific + surname in body (type "personal-name", multiple instances):
Input: "Ms Ferguson confirmed the timeline at the meeting; Mr Kellogg disagreed. Ferguson later withdrew."
Output: THREE detections —
  { "type": "personal-name", "text": "Ms Ferguson", "page": 2, ... }
  { "type": "personal-name", "text": "Mr Kellogg", "page": 2, ... }
  { "type": "personal-name", "text": "Ferguson", "page": 2, "reasoning": "Bare surname; person introduced earlier on the page.", ... }

Example 4 — Sensitive context (medical diagnosis) + companion name (types "sensitive-context" + "personal-name"):
Input: "Dr Sarah Liang's letter of 14 March 2026 records a diagnosis of adjustment disorder with mixed anxiety and depressed mood (ICD-10 F43.23) for the complainant."
Output: TWO detections —
  { "type": "personal-name", "text": "Dr Sarah Liang", "page": 3, "reasoning": "Third-party professional name.", "aiExplanation": "Personal name." }
  { "type": "sensitive-context", "text": "a diagnosis of adjustment disorder with mixed anxiety and depressed mood", "page": 3, "reasoning": "Medical diagnosis attributed to an identified complainant.", "aiExplanation": "Personal medical information." }

Example 5 — Address in prose (type "address"):
Input: "The submitter, who lives at 22 Mahoe Avenue in Awatere 4310, opposes the rezoning."
Output: { "type": "address", "text": "22 Mahoe Avenue in Awatere 4310", "page": 1, "reasoning": "Personal residential address.", "aiExplanation": "Personal address." }

Example 6 — Employment grievance context (type "sensitive-context"):
Input: "Ms Patel has been on a performance improvement plan since March 2026 following the complaint lodged by her direct report."
Output: TWO detections —
  { "type": "personal-name", "text": "Ms Patel", "page": 1, ... }
  { "type": "sensitive-context", "text": "has been on a performance improvement plan since March 2026 following the complaint lodged by her direct report", "page": 1, "reasoning": "Employment grievance / performance management detail attributed to a named individual.", "aiExplanation": "Personal employment circumstance." }

Example 7 — Pseudonym alone (do NOT flag):
Input: "Witness B has documented concerns about Ms Patel's management style."
Output: { "type": "personal-name", "text": "Ms Patel", "page": 2, ... }
(Note: "Witness B" is a pseudonym used to anonymise the witness; do NOT flag pseudonyms.)

OUTPUT FORMAT:

Respond with a JSON object containing a "detections" array. Each detection must have:
{
  "type": string (one of the allowed types listed above),
  "text": string (the exact text to redact, as it appears in the input),
  "confidence": number (0-100; deterministic-shape PII like passport numbers can be 95+; ambiguous names in context 70-90; speculative flags <50),
  "page": number (1-based page number from the input),
  "reasoning": string (short rationale for the reviewer),
  "aiExplanation": string (plain-language explanation; include "DOB" for dates of birth)
}

If there is nothing to detect, return {"detections": []}.`;

/**
 * Build the system prompt with the (toggle-filtered) detection types
 * substituted into the {{TYPES}} placeholder. Phase 12.1 simplified —
 * no document-classification context, no LGOIMA grounds reference,
 * no special-case for the dropped `confidential` catch-all.
 *
 * Phase 12.0/12.1 prompt-cache note: prompt is ~3,500 chars (~900
 * tokens) without classification, well above Azure's 1024-token
 * minimum for caching. Stable across calls within a deploy → ~99%
 * prefix-cache hit rate as observed on v1.
 */
export function buildSystemPrompt(enabledTypes?: Set<string>): string {
  const types = enabledTypes
    ? ALL_AI_TYPES.filter((t) => enabledTypes.has(t))
    : ALL_AI_TYPES;
  return SYSTEM_PROMPT_BASE.replace(
    "{{TYPES}}",
    types.map((t) => `"${t}"`).join(", "),
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Check whether two strings overlap enough to be considered duplicates. */
function textsOverlap(a: string, b: string): boolean {
  const normA = a.toLowerCase().trim();
  const normB = b.toLowerCase().trim();

  if (normA === normB) return true;
  if (normA.includes(normB) || normB.includes(normA)) return true;

  return false;
}

/**
 * Validate and sanitise a single detection object returned by the model.
 * Returns null if the object is invalid.
 */
function validateDetection(raw: unknown): AIDetection | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;

  const text = typeof obj.text === "string" ? obj.text.trim() : "";
  if (!text) return null;

  return {
    type: typeof obj.type === "string" ? obj.type : "sensitive-context",
    text,
    confidence:
      typeof obj.confidence === "number"
        ? Math.max(0, Math.min(100, Math.round(obj.confidence)))
        : 50,
    page: typeof obj.page === "number" ? obj.page : 1,
    reasoning:
      typeof obj.reasoning === "string" ? obj.reasoning : "AI-detected content",
    aiExplanation:
      typeof obj.aiExplanation === "string"
        ? obj.aiExplanation
        : "This text was identified by AI as potentially requiring redaction.",
  };
}

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

/**
 * Split a large page into chunks of approximately `maxChars` characters,
 * breaking at paragraph boundaries (\n\n).  Each chunk becomes a synthetic
 * page entry that preserves the original page number.
 */
function splitLargePage(
  page: ExtractedPage,
  maxChars: number = 10_000,
): ExtractedPage[] {
  const text = page.text || "";
  if (text.length <= maxChars) return [page];

  const paragraphs = text.split(/\n\n/);
  const chunks: ExtractedPage[] = [];
  let current = "";

  for (const para of paragraphs) {
    // If adding this paragraph would exceed the limit, flush the current chunk
    if (current.length > 0 && current.length + para.length + 2 > maxChars) {
      chunks.push({ ...page, text: current });
      current = para;
    } else {
      current = current ? current + "\n\n" + para : para;
    }
  }
  // Flush the remaining text
  if (current) {
    chunks.push({ ...page, text: current });
  }

  return chunks;
}

/**
 * Pre-process pages: split any page exceeding 12,000 characters into
 * smaller chunks at paragraph boundaries.  Each chunk retains the original
 * page number so detections map back correctly.
 */
export function preparePages(pages: ExtractedPage[]): ExtractedPage[] {
  const MAX_PAGE_CHARS = 12_000;
  const result: ExtractedPage[] = [];
  for (const page of pages) {
    if ((page.text || "").length > MAX_PAGE_CHARS) {
      result.push(...splitLargePage(page));
    } else {
      result.push(page);
    }
  }
  return result;
}

/**
 * Send extracted page text to Azure OpenAI for PII detection.
 *
 * Pages are processed in batches to stay within token limits.  Results are
 * filtered to remove detections that overlap with text already found by the
 * pattern detector.
 *
 * @param pages - Extracted page objects from the text extraction step.
 * @param existingPatternTexts - Array of text strings already found by the
 *   pattern detector (used for de-duplication).
 * @param feedbackPrompt - Optional feedback loop prompt section.
 * @param enabledTypes - Set of enabled detection type keys.
 * @returns Array of AI detections.
 */
export async function detectWithAI(
  pages: ExtractedPage[],
  existingPatternTexts: string[],
  feedbackPrompt?: string,
  enabledTypes?: Set<string>,
): Promise<AIDetection[]> {
  const detectionDeployment = resolveDetectionDeployment();
  const client = getClient(detectionDeployment);
  const allDetections: AIDetection[] = [];

  // Pre-process: split oversized pages (e.g. large DOCX single-page docs)
  const preparedPages = preparePages(pages);

  // Batch size: for small documents (<= AI_DETECT_SINGLE_BATCH_MAX_PAGES,
  // default 6), send all prepared pages in one chat completion call so the
  // model sees the full document context in a single shot (entity
  // continuity across pages). Larger documents fall back to the original
  // BATCH_SIZE=3 to stay within token limits. Phase 1 item 4 of
  // docs/detection-coverage-plan-2026-04.md.
  const maxSingleBatchPages = parseInt(
    process.env.AI_DETECT_SINGLE_BATCH_MAX_PAGES ?? "6",
    10,
  );
  const BATCH_SIZE =
    preparedPages.length <= maxSingleBatchPages ? preparedPages.length : 3;

  // Build the list of (i, batch) pairs first so we can dispatch them
  // through a concurrency limiter. Each batch is independent — the
  // system prompt is identical across batches within a single call
  // (Verification 2 of the Phase 1 investigation confirmed prompt
  // caching is active, ~99% prefix hit rate on sequential calls;
  // parallel calls may see lower hit rate but the system prompt is
  // still stable per-batch by construction). No batch consumes
  // another's output.
  interface PreparedBatch {
    index: number;
    pages: ExtractedPage[];
    userContent: string;
  }
  const preparedBatches: PreparedBatch[] = [];
  for (let i = 0; i < preparedPages.length; i += BATCH_SIZE) {
    const batch = preparedPages.slice(i, i + BATCH_SIZE);
    const userContent = batch
      .map((p) => `--- PAGE ${p.pageNumber} ---\n${p.text || "(empty page)"}`)
      .join("\n\n");

    // Skip batches that are essentially empty.
    if (userContent.replace(/--- PAGE \d+ ---\n\(empty page\)/g, "").trim().length < 20) {
      continue;
    }
    preparedBatches.push({ index: i, pages: batch, userContent });
  }

  // p-limit caps in-flight promise count without blocking dispatch —
  // batch-3 waits in the queue until batch-1 or batch-2 settles.
  // CircuitOpenError early-break (sequential pre-fix) is intentionally
  // dropped: with concurrent batches each call has its own circuit-
  // breaker check (the breaker is a singleton in azure-services.ts),
  // so once the breaker opens the still-queued batches will fail-fast
  // organically. No need to short-circuit the iteration.
  const concurrency = resolveConcurrency();
  const limit = pLimit(concurrency);
  const startedAt = Date.now();
  log.info("Dispatching AI detection batches", {
    batches: preparedBatches.length,
    concurrency,
    pages: preparedPages.length,
  });

  const results = await Promise.allSettled(
    preparedBatches.map((pb) =>
      limit(async () => {
        const batchStart = Date.now();
        try {
          const systemPrompt = buildSystemPrompt(enabledTypes);
          const systemContent = feedbackPrompt
            ? systemPrompt + feedbackPrompt
            : systemPrompt;

          const response = await resilientOpenAICall(() =>
            client.chat.completions.create({
              model: detectionDeployment,
              messages: [
                { role: "system", content: systemContent },
                { role: "user", content: pb.userContent },
              ],
              temperature: 0.1,
              max_tokens: 4096,
              response_format: { type: "json_object" },
            }),
          );

          const content = response.choices?.[0]?.message?.content;
          if (!content) {
            return { detections: [] as AIDetection[], skipped: "empty-response" };
          }

          let parsed: unknown;
          try {
            parsed = JSON.parse(content);
          } catch {
            log.warn("Failed to parse AI response as JSON", {
              preview: content.slice(0, 200),
              pages: pb.pages.map((p) => p.pageNumber),
            });
            return { detections: [] as AIDetection[], skipped: "invalid-json" };
          }

          const detectionsArray =
            Array.isArray(parsed)
              ? parsed
              : Array.isArray((parsed as Record<string, unknown>).detections)
                ? (parsed as Record<string, unknown>).detections
                : [];

          const dets: AIDetection[] = [];
          for (const rawDet of detectionsArray as unknown[]) {
            const det = validateDetection(rawDet);
            if (det) dets.push(det);
          }
          log.info("AI batch complete", {
            pages: pb.pages.map((p) => p.pageNumber),
            detections: dets.length,
            elapsedMs: Date.now() - batchStart,
          });
          return { detections: dets };
        } catch (error) {
          if (error instanceof CircuitOpenError) {
            log.warn("Circuit breaker OPEN for Azure OpenAI; this batch dropped", {
              pages: pb.pages.map((p) => p.pageNumber),
            });
            // Re-throw so Promise.allSettled records the rejection;
            // concurrent / queued batches still proceed and either hit
            // the breaker themselves (also rejecting) or run cleanly
            // if the breaker closes mid-flight. Net behaviour matches
            // sequential pre-fix's "skip remaining on breaker open"
            // because the breaker is a process-wide singleton.
            throw error;
          }
          log.error("Error processing AI detection batch", {
            pages: pb.pages.map((p) => p.pageNumber),
            error: error instanceof Error ? error.message : String(error),
          });
          // Match sequential pre-fix's silent-continue on per-batch
          // errors: return empty detections instead of rejecting so
          // Promise.allSettled doesn't report this as a rejection.
          return { detections: [] as AIDetection[], skipped: "error" };
        }
      }),
    ),
  );

  for (const r of results) {
    if (r.status === "fulfilled") {
      allDetections.push(...r.value.detections);
    }
    // r.status === "rejected" → already logged above (CircuitOpenError);
    // detections are simply dropped from this batch.
  }

  log.info("AI detection batch dispatch complete", {
    totalDetections: allDetections.length,
    totalElapsedMs: Date.now() - startedAt,
    batches: preparedBatches.length,
    concurrency,
  });

  // Filter out detections that overlap with existing pattern matches.
  const filtered = allDetections.filter((det) => {
    for (const existingText of existingPatternTexts) {
      if (textsOverlap(det.text, existingText)) {
        return false;
      }
    }
    return true;
  });

  return filtered;
}
