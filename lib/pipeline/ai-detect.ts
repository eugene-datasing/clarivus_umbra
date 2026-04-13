/**
 * AI-based detection using Azure OpenAI (GPT-4o).
 *
 * Sends extracted page text to GPT-4o with a LGOIMA-aware system prompt and
 * asks the model to identify text that may need to be withheld.  Results are
 * de-duplicated against pattern matches that were already found by the regex
 * detector.
 */

import { AzureOpenAI } from "openai";
import type { ExtractedPage } from "./extract";
import {
  resilientOpenAICall,
  CircuitOpenError,
} from "@/lib/resilience/azure-services";
import { logger } from "@/lib/logger";
import { lgoimaGrounds } from "@/lib/lgoima-grounds";

const log = logger.child({ module: "ai-detect" });

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AIDetection {
  type: string;
  text: string;
  confidence: number;
  page: number;
  suggestedGround: string;
  reasoning: string;
  piConsideration: string;
  aiExplanation: string;
}

// ---------------------------------------------------------------------------
// Azure OpenAI client (lazy singleton)
// ---------------------------------------------------------------------------

let _client: AzureOpenAI | null = null;

function getClient(): AzureOpenAI {
  if (_client) return _client;

  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const apiKey = process.env.AZURE_OPENAI_KEY;
  const deployment = process.env.AZURE_OPENAI_DEPLOYMENT;

  if (!endpoint || !apiKey || !deployment) {
    throw new Error(
      "Azure OpenAI credentials missing. Set AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_KEY, and AZURE_OPENAI_DEPLOYMENT.",
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
const ALL_AI_TYPES = [
  "personal-name", "phone", "email-addr", "ird", "address",
  "bank-account", "nz-passport", "vehicle-reg",
  "commercial", "free-frank", "legal-privilege", "confidential",
];

/**
 * Build the LGOIMA grounds reference section for the AI prompt.
 * Generated dynamically from the canonical `lgoimaGrounds` array so
 * the prompt stays in sync with code changes.
 */
function buildGroundsReference(): string {
  const lines: string[] = ["Available LGOIMA withholding grounds:"];
  for (const g of lgoimaGrounds) {
    const piNote = g.requiresPI ? " [requires public interest test]" : " [conclusive — no PI override]";
    lines.push(`- ${g.reference}: ${g.label} — ${g.description}${piNote}`);
  }
  return lines.join("\n");
}

const SYSTEM_PROMPT_BASE = `You are an expert LGOIMA (Local Government Official Information and Meetings Act 1987) document reviewer for a New Zealand local council.

Analyze the following document pages and identify text that may need to be withheld under LGOIMA. For each detection:

1. Classify the type using ONLY these values: {{TYPES}}
2. Assign a confidence score (0-100)
3. Suggest the appropriate LGOIMA withholding ground from the reference table below
4. Provide reasoning for the reviewer
5. Note any public interest considerations

{{GROUNDS_REFERENCE}}

Ground selection guidance:
- Section 6 grounds are CONCLUSIVE — there is no public interest override. Use them only when the threshold is clearly met.
- Section 7 grounds require a public interest balancing test. State what the competing interest is.
- If content relates to an active investigation or prosecution, suggest s6(c) (maintenance of the law) rather than defaulting to s7(2)(a).
- If releasing an address could endanger a person's safety (e.g. family violence, threatened witness, stalking context), suggest s6(d) (safety of any person) rather than s7(2)(a).
- For free and frank opinions by council staff or elected officials, use s7(2)(f)(i). For protection from harassment/pressure, use s7(2)(f)(ii).
- For obligation of confidence, distinguish between s7(2)(c)(i) (prejudice to supply of similar information) and s7(2)(c)(ii) (damage to public interest).
- For tikanga Māori or wāhi tapu locations in resource consent contexts, use s7(2)(ba).
- s7(2)(j) is about improper gain or advantage (NOT incomplete negotiations — that is s7(2)(i)).
- Do NOT suggest section 17 grounds — those are request-level refusal reasons, not content-level withholding grounds.

Important context:
- Public officials acting in their official capacity have lower privacy expectations
- Published contact information is generally public
- Information already in the public domain should not be flagged
- Consider both individual privacy and the public interest in disclosure
- Names of elected officials, chief executives, and senior managers acting in their official capacity should NOT be flagged
- Focus on identifying personal names of private individuals, submitters, complainants, and junior staff
- Do NOT flag headings, labels, field names, or column headers that merely describe a category of information without containing actual personal data (e.g. "Registered Office Address", "Email Address", "Phone Number", "Contact Details")
- Only flag text that IS the actual sensitive data, not text that DESCRIBES or LABELS where such data would appear

Respond with a JSON object containing a "detections" array. Each detection must have:
{
  "type": string,
  "text": string (the exact text to withhold),
  "confidence": number (0-100),
  "page": number (1-based page number from the input),
  "suggestedGround": string (e.g. "s7(2)(a)"),
  "reasoning": string,
  "piConsideration": string (public interest consideration),
  "aiExplanation": string (plain-language explanation for reviewer)
}

If there is nothing to detect, return {"detections": []}.`;

/**
 * Build the system prompt with only the enabled detection types listed.
 * The "confidential" type is always included as a catch-all.
 */
function buildSystemPrompt(enabledTypes?: Set<string>): string {
  const types = enabledTypes
    ? ALL_AI_TYPES.filter((t) => t === "confidential" || enabledTypes.has(t))
    : ALL_AI_TYPES;
  return SYSTEM_PROMPT_BASE
    .replace("{{TYPES}}", types.map((t) => `"${t}"`).join(", "))
    .replace("{{GROUNDS_REFERENCE}}", buildGroundsReference());
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
    type: typeof obj.type === "string" ? obj.type : "confidential",
    text,
    confidence:
      typeof obj.confidence === "number"
        ? Math.max(0, Math.min(100, Math.round(obj.confidence)))
        : 50,
    page: typeof obj.page === "number" ? obj.page : 1,
    suggestedGround:
      typeof obj.suggestedGround === "string"
        ? obj.suggestedGround
        : "",
    reasoning:
      typeof obj.reasoning === "string" ? obj.reasoning : "AI-detected content",
    piConsideration:
      typeof obj.piConsideration === "string" ? obj.piConsideration : "",
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
 * Send extracted page text to Azure OpenAI for LGOIMA-aware detection.
 *
 * Pages are processed in batches to stay within token limits.  Results are
 * filtered to remove detections that overlap with text already found by the
 * pattern detector.
 *
 * @param pages - Extracted page objects from the text extraction step.
 * @param existingPatternTexts - Array of text strings already found by the
 *   pattern detector (used for de-duplication).
 * @returns Array of AI detections.
 */
export async function detectWithAI(
  pages: ExtractedPage[],
  existingPatternTexts: string[],
  feedbackPrompt?: string,
  enabledTypes?: Set<string>,
): Promise<AIDetection[]> {
  const client = getClient();
  const allDetections: AIDetection[] = [];

  // Process pages in batches of 3 to stay within token limits
  const BATCH_SIZE = 3;

  for (let i = 0; i < pages.length; i += BATCH_SIZE) {
    const batch = pages.slice(i, i + BATCH_SIZE);

    // Build user message with page text
    const userContent = batch
      .map(
        (p) =>
          `--- PAGE ${p.pageNumber} ---\n${p.text || "(empty page)"}`,
      )
      .join("\n\n");

    // Skip batches that are essentially empty
    if (userContent.replace(/--- PAGE \d+ ---\n\(empty page\)/g, "").trim().length < 20) {
      continue;
    }

    try {
      const systemPrompt = buildSystemPrompt(enabledTypes);
      const systemContent = feedbackPrompt
        ? systemPrompt + feedbackPrompt
        : systemPrompt;

      const response = await resilientOpenAICall(() =>
        client.chat.completions.create({
          model: process.env.AZURE_OPENAI_DEPLOYMENT || "gpt-4o",
          messages: [
            { role: "system", content: systemContent },
            { role: "user", content: userContent },
          ],
          temperature: 0.1,
          max_tokens: 4096,
          response_format: { type: "json_object" },
        }),
      );

      const content = response.choices?.[0]?.message?.content;
      if (!content) continue;

      let parsed: unknown;
      try {
        parsed = JSON.parse(content);
      } catch {
        log.warn("Failed to parse AI response as JSON", { preview: content.slice(0, 200) });
        continue;
      }

      // Extract the detections array from the response
      const detectionsArray =
        Array.isArray(parsed)
          ? parsed
          : Array.isArray((parsed as Record<string, unknown>).detections)
            ? (parsed as Record<string, unknown>).detections
            : [];

      for (const rawDet of detectionsArray as unknown[]) {
        const det = validateDetection(rawDet);
        if (det) {
          allDetections.push(det);
        }
      }
    } catch (error) {
      if (error instanceof CircuitOpenError) {
        log.warn("Circuit breaker OPEN for Azure OpenAI, skipping remaining batches", {
          pages: batch.map((p) => p.pageNumber),
        });
        // Return what we have so far (partial processing / graceful degradation)
        break;
      }
      log.error("Error processing AI detection batch", {
        pages: batch.map((p) => p.pageNumber),
        error: error instanceof Error ? error.message : String(error),
      });
      // Continue with remaining batches
    }
  }

  // Filter out detections that overlap with existing pattern matches
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
