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
import { lgoimaGrounds, normaliseGroundToId } from "@/lib/lgoima-grounds";
import type { DocumentClassification } from "./doc-classify";

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
  "negotiation", "safety-concern", "law-enforcement",
  "council-commercial", "harassment-risk", "cultural-sensitivity",
  "health-safety",
];

/**
 * Maps each LGOIMA ground ID to the recommended AI detection type.
 * Used by buildGroundsReference() to group grounds by detection pathway
 * so the AI knows which type to assign for each ground.
 */
const GROUND_DETECTION_TYPE_MAP: Record<string, string> = {
  // PII grounds → dedicated PII types
  s7_2a: "personal-name / phone / email-addr / ird / address / bank-account / nz-passport / vehicle-reg",
  // Commercial/trade grounds → "commercial"
  s7_2bi: "commercial",
  s7_2bii: "commercial",
  // Dedicated contextual types
  s7_2h: "council-commercial",
  s7_2i: "negotiation",
  // Free and frank → "free-frank"
  s7_2fi: "free-frank",
  // Legal privilege → "legal-privilege"
  s7_2g: "legal-privilege",
  // Dedicated types for previously underserved grounds
  s6c: "law-enforcement",
  s6d: "safety-concern",
  s7_2ba: "cultural-sensitivity",
  s7_2d: "health-safety",
  s7_2fii: "harassment-risk",
  // Obligation of confidence → "confidential" (no dedicated type)
  s7_2ci: "confidential",
  s7_2cii: "confidential",
  // Rare grounds → "confidential" catch-all
  s6a: "confidential",
  s6b: "confidential",
  s7_2e: "confidential",
  s7_2j: "confidential",
};

/**
 * Build the LGOIMA grounds reference section for the AI prompt.
 * Generated dynamically from the canonical `lgoimaGrounds` array so
 * the prompt stays in sync with code changes.  Groups grounds by
 * detection pathway so the AI knows which type to use for each ground.
 */
function buildGroundsReference(): string {
  const s6s7 = lgoimaGrounds.filter((g) => g.section !== "s17");
  const s17 = lgoimaGrounds.filter((g) => g.section === "s17");

  // Partition s6/s7 grounds into "has dedicated type" vs "use catch-all"
  const dedicatedTypeIds = new Set([
    "s7_2a", "s7_2bi", "s7_2bii", "s7_2fi", "s7_2g",  // original dedicated types
    "s6c", "s6d", "s7_2h", "s7_2i", "s7_2ba", "s7_2d", "s7_2fii",  // new dedicated types
  ]);
  const dedicated = s6s7.filter((g) => dedicatedTypeIds.has(g.id));
  const catchAll = s6s7.filter((g) => !dedicatedTypeIds.has(g.id));

  const lines: string[] = ["Available LGOIMA withholding grounds:"];

  lines.push("");
  lines.push("GROUNDS WITH DEDICATED DETECTION TYPES:");
  for (const g of dedicated) {
    const typeHint = GROUND_DETECTION_TYPE_MAP[g.id] || "confidential";
    const piNote = g.requiresPI ? " [requires public interest test]" : " [conclusive — no PI override]";
    lines.push(`- ${g.reference}: ${g.label} — use type "${typeHint}"${piNote}`);
  }

  lines.push("");
  lines.push("GROUNDS WITHOUT DEDICATED TYPES (use \"confidential\"):");
  for (const g of catchAll) {
    const typeHint = GROUND_DETECTION_TYPE_MAP[g.id] || "confidential";
    const piNote = g.requiresPI ? " [requires public interest test]" : " [conclusive — no PI override]";
    lines.push(`- ${g.reference}: ${g.label} — use type "${typeHint}"${piNote}`);
  }

  lines.push("");
  lines.push("SECTION 17 — REQUEST-LEVEL REFUSAL REASONS (do NOT suggest these for content-level detections):");
  for (const g of s17) {
    lines.push(`- ${g.reference}: ${g.label} — ${g.description}`);
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

Type descriptions:
- "personal-name": A personal name of a private individual, submitter, complainant, or junior staff member. Also includes dates of birth in any format, including those with month names spelled out (e.g. "22 September 1986", "3 November 1978", "14/06/1983"). When flagging a date of birth, include "DOB" in the aiExplanation so reviewers can see why it was flagged.
- "phone": A personal phone number
- "email-addr": A personal email address
- "ird": An NZ IRD number
- "address": A personal residential or postal address
- "bank-account": An NZ bank account number
- "nz-passport": An NZ passport number
- "vehicle-reg": An NZ vehicle registration plate
- "commercial": Trade secrets or third-party commercial position content. Use for trade secrets (s7(2)(b)(i)) and content that could prejudice a third party's competitive standing (s7(2)(b)(ii)).
- "free-frank": Free and frank internal opinions, advice, or recommendations by council staff or elected officials
- "legal-privilege": Content protected by legal professional privilege (solicitor-client communications, legal advice, litigation strategy)
- "negotiation": Council negotiation positions, strategy documents, settlement terms, BATNA analysis, commercial or industrial negotiation content. Use with ground s7(2)(i).
- "safety-concern": Content where release could endanger a specific person — protection orders, hidden addresses for threatened persons, family violence details, witness protection information, threats, stalking records. Use with ground s6(d).
- "law-enforcement": Investigation material, prosecution details, enforcement actions, witness statements in legal proceedings, search warrants, evidence summaries. Use with ground s6(c).
- "council-commercial": Council's own commercial activities — investment portfolios, pricing strategy for services in competitive markets, joint venture terms, commercial property management strategy. Use with ground s7(2)(h). Distinguish from "commercial" which protects third-party positions.
- "harassment-risk": Content that could expose people to improper pressure, harassment, threats, or retaliation — complainant identities, disciplinary details, staff opinions on controversial matters with identifying information. Use with ground s7(2)(f)(ii). Distinguish from "free-frank" which protects candour of advice.
- "cultural-sensitivity": Tikanga Māori references, wāhi tapu locations, kōiwi tangata, iwi consultation records, cultural impact assessments in RMA/resource consent contexts. Use with ground s7(2)(ba).
- "health-safety": Public health or safety measures — emergency response plans, water treatment procedures, infrastructure vulnerability assessments, pandemic protocols, building safety reports. Use with ground s7(2)(d). This protects the measures themselves, not individual safety (which is s6(d) / "safety-concern").
- "confidential": Catch-all type for sensitive content that does not fit any other detection type. Use for: obligation of confidence (s7(2)(c)(i), s7(2)(c)(ii)), material loss prevention measures (s7(2)(e)), content enabling improper gain or advantage (s7(2)(j)), and rare grounds like national security (s6(a)) or foreign government information (s6(b)). Always pair "confidential" with the most specific LGOIMA ground.

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

DETECTION GUIDANCE BY GROUND:

When you encounter the following content patterns, use the specified detection type and suggest the indicated ground:

- Law enforcement / investigation material (witness statements, prosecution details, enforcement actions, investigation notes, search warrants, evidence summaries): Use type "law-enforcement", suggest s6(c). This is a CONCLUSIVE ground — no public interest override.

- Content where release could endanger a specific person (hidden addresses for threatened persons, family violence details, witness protection information, threats, stalking records): Use type "safety-concern", suggest s6(d). This is a CONCLUSIVE ground — no public interest override. Prefer s6(d) over s7(2)(a) when there is a genuine safety risk, not merely a privacy concern.

- National security, defence, or international relations material: Use type "confidential", suggest s6(a). Extremely rare in local council documents.

- Information entrusted by another government or international organisation on a confidential basis: Use type "confidential", suggest s6(b). Extremely rare in local council documents.

- Tikanga Māori references, wāhi tapu locations, or culturally sensitive sites in resource consent / RMA contexts: Use type "cultural-sensitivity", suggest s7(2)(ba). Look for: iwi consultation records, cultural impact assessments, references to urupā, marae, or sacred sites, archaeological authority applications.

- Information received under an obligation of confidence where release would prejudice future supply of similar information: Use type "confidential", suggest s7(2)(c)(i). Look for: third-party submissions marked confidential, commercially sensitive information shared voluntarily, information from informants or whistleblowers.

- Information received under an obligation of confidence where release would damage the public interest: Use type "confidential", suggest s7(2)(c)(ii). Distinguish from s7(2)(c)(i) — this limb is about broader public interest harm, not just prejudice to future supply.

- Council negotiation positions, strategy documents, BATNA analysis, settlement offers, commercial or industrial negotiation terms: Use type "negotiation", suggest s7(2)(i). Distinguish from "commercial" — "negotiation" is about the process and council's position, "commercial" is about prejudice to a third party's competitive standing.

- Content enabling improper gain or advantage from official information (e.g. advance notice of zoning changes, undisclosed tender evaluation criteria, insider knowledge of council investment decisions): Use type "confidential", suggest s7(2)(j). Distinguish from "negotiation" — improper gain is about misuse of information, not about protecting negotiation positions.

- Council commercial activity details (investment portfolios, commercial property management strategy, pricing for council services in competitive markets, joint venture terms): Use type "council-commercial", suggest s7(2)(h). Distinguish from "commercial" — "council-commercial" protects the council's own commercial activities, "commercial" protects third-party commercial positions.

- Content where release could expose staff or elected members to improper pressure, harassment, threats, doxxing, or retaliation (complaint details identifying complainants, disciplinary records, personal opinions about controversial decisions with identifying details): Use type "harassment-risk", suggest s7(2)(f)(ii). Distinguish from "free-frank" — free and frank is about protecting candour of advice; harassment-risk is about protecting people from harm.

- Public health or safety measures (emergency response plans, water treatment procedures, infrastructure vulnerability assessments, pandemic response protocols, building safety reports): Use type "health-safety", suggest s7(2)(d). This is about protecting the measures themselves, not individual safety (which is s6(d) / "safety-concern").

- Material loss prevention measures (fraud prevention procedures, insurance claim processes, financial controls documentation, asset protection protocols): Use type "confidential", suggest s7(2)(e). Rare — only use when the content describes protective measures whose disclosure would undermine them.

WORKED EXAMPLES of non-PII detections:

Example 1 — Negotiation position (type "negotiation", ground s7(2)(i)):
Input text: "Council's fallback position is to accept $2.1M if the developer rejects the initial $2.8M offer"
Output: { "type": "negotiation", "text": "Council's fallback position is to accept $2.1M if the developer rejects the initial $2.8M offer", "confidence": 85, "page": 1, "suggestedGround": "s7(2)(i)", "reasoning": "Reveals council's negotiation strategy and fallback position for a commercial negotiation", "piConsideration": "Releasing negotiation positions would prejudice council's ability to achieve best outcome for ratepayers", "aiExplanation": "This text reveals the council's fallback price in an active negotiation — releasing it would undermine their bargaining position." }

Example 2 — Safety concern (type "safety-concern", ground s6(d)):
Input text: "Ms Tūhoe has been relocated to 14 Kowhai Lane following the protection order granted on 14 March"
Output: { "type": "safety-concern", "text": "Ms Tūhoe has been relocated to 14 Kowhai Lane following the protection order granted on 14 March", "confidence": 95, "page": 1, "suggestedGround": "s6(d)", "reasoning": "Reveals the new location of a person subject to a protection order — release could endanger their safety", "piConsideration": "Section 6 ground — conclusive, no public interest override applies", "aiExplanation": "This text reveals a protected person's new address alongside the reason for their relocation, creating a serious safety risk." }

Example 3 — Free and frank internal opinion (type "free-frank", ground s7(2)(f)(i)):
Input text: "Frankly, I think the proposed bylaw is unenforceable and we should advise the committee to abandon it"
Output: { "type": "free-frank", "text": "Frankly, I think the proposed bylaw is unenforceable and we should advise the committee to abandon it", "confidence": 80, "page": 1, "suggestedGround": "s7(2)(f)(i)", "reasoning": "Internal staff opinion expressing candid professional view on policy matter", "piConsideration": "Withholding must be balanced against public interest in transparency of council decision-making", "aiExplanation": "This is a candid internal opinion from a staff member advising against a policy — releasing it could inhibit future free and frank advice." }

Example 4 — Tikanga Māori / wāhi tapu (type "cultural-sensitivity", ground s7(2)(ba)):
Input text: "The archaeological assessment identified kōiwi tangata at grid ref NZTM 1758432E 5673291N, adjacent to the proposed subdivision"
Output: { "type": "cultural-sensitivity", "text": "The archaeological assessment identified kōiwi tangata at grid ref NZTM 1758432E 5673291N, adjacent to the proposed subdivision", "confidence": 90, "page": 1, "suggestedGround": "s7(2)(ba)", "reasoning": "Discloses the location of human remains (kōiwi tangata) — a wāhi tapu site in an RMA/resource consent context", "piConsideration": "Disclosure would cause serious offence to tikanga Māori and reveal a wāhi tapu location", "aiExplanation": "This text identifies the precise location of kōiwi tangata (ancestral human remains), which is a wāhi tapu. Disclosing this in a resource consent context would cause serious cultural offence." }

Example 5 — Law enforcement material (type "law-enforcement", ground s6(c)):
Input text: "The inspector's notes confirm that Unit 4B was entered under warrant on 22 February and samples were seized for testing under the Food Act 2014"
Output: { "type": "law-enforcement", "text": "The inspector's notes confirm that Unit 4B was entered under warrant on 22 February and samples were seized for testing under the Food Act 2014", "confidence": 90, "page": 1, "suggestedGround": "s6(c)", "reasoning": "Details of a regulatory investigation including warrant execution and evidence seizure — release could prejudice the investigation and right to fair trial", "piConsideration": "Section 6 ground — conclusive, no public interest override applies", "aiExplanation": "This text describes an active enforcement action with warrant details and evidence collection. Releasing it could compromise the investigation or prejudice legal proceedings." }

Example 6 — Council commercial activity (type "council-commercial", ground s7(2)(h)):
Input text: "The forestry portfolio is projected to return 6.2% p.a. over the harvest cycle; management recommends deferring Block 7 sales until Q3 to capture the anticipated price uplift"
Output: { "type": "council-commercial", "text": "The forestry portfolio is projected to return 6.2% p.a. over the harvest cycle; management recommends deferring Block 7 sales until Q3 to capture the anticipated price uplift", "confidence": 85, "page": 1, "suggestedGround": "s7(2)(h)", "reasoning": "Reveals council's commercial forestry strategy including timing and pricing expectations — release would disadvantage council in timber markets", "piConsideration": "Withholding must be balanced against public interest in transparency of council asset management", "aiExplanation": "This text reveals the council's internal commercial strategy for its forestry assets, including projected returns and planned sale timing. Releasing it would disadvantage the council in competitive timber markets." }

Example 7 — Harassment risk (type "harassment-risk", ground s7(2)(f)(ii)):
Input text: "The complaint was lodged by Mrs Rātima of 8 Tui Street regarding Councillor Hughes's conduct at the 12 March hearing"
Output: { "type": "harassment-risk", "text": "The complaint was lodged by Mrs Rātima of 8 Tui Street regarding Councillor Hughes's conduct at the 12 March hearing", "confidence": 85, "page": 1, "suggestedGround": "s7(2)(f)(ii)", "reasoning": "Identifies the complainant by name and address in a complaint about an elected member — release could expose the complainant to pressure or retaliation", "piConsideration": "Withholding must be balanced against public interest in accountability of elected officials, but complainant identity is distinct from the substance of the complaint", "aiExplanation": "This text identifies who made a complaint against a councillor, including their home address. Releasing this could expose the complainant to improper pressure or harassment from supporters of the named councillor." }

Example 8 — Date of birth (type "personal-name", ground s7(2)(a)):
Input text: "Date of birth: 22 September 1986"
Output: { "type": "personal-name", "text": "22 September 1986", "confidence": 90, "page": 1, "suggestedGround": "s7(2)(a)", "reasoning": "Date of birth of a private individual", "piConsideration": "Date of birth is a sensitive personal identifier frequently used for identity verification; public interest in disclosure is generally low", "aiExplanation": "DOB — date of birth of a private individual, flagged as personal information under s7(2)(a). Note the month-name long-date format." }

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
 * Build the document context block from the pre-classification result.
 * Returns an empty string if no classification is available.
 */
function buildClassificationContext(classification?: DocumentClassification): string {
  if (!classification || classification.documentType === "other" && classification.likelyGrounds.length === 0 && !classification.contextNotes) {
    return "";
  }
  const lines = [
    "DOCUMENT CONTEXT (from pre-classification):",
    `Document type: ${classification.documentType}`,
    `Likely relevant grounds: ${classification.likelyGrounds.length > 0 ? classification.likelyGrounds.join(", ") : "none identified"}`,
    `Context: ${classification.contextNotes || "none"}`,
    `Contains legal advice: ${classification.containsLegalAdvice}`,
    `Contains personnel information: ${classification.containsPersonnelInfo}`,
    `Contains commercial information: ${classification.containsCommercialInfo}`,
    `Contains cultural content: ${classification.containsCulturalContent}`,
    `Contains enforcement information: ${classification.containsEnforcementInfo}`,
    "",
    "Use this context to inform your detection decisions. For example, if this is a legal opinion, be alert for legal professional privilege (s7(2)(g)). If it contains enforcement information, consider s6(c) for relevant content.",
    "",
  ];
  return lines.join("\n");
}

/**
 * Build the system prompt with only the enabled detection types listed.
 * The "confidential" type is always included as a catch-all.
 * Optionally prepends document classification context.
 */
function buildSystemPrompt(enabledTypes?: Set<string>, classification?: DocumentClassification): string {
  const types = enabledTypes
    ? ALL_AI_TYPES.filter((t) => t === "confidential" || enabledTypes.has(t))
    : ALL_AI_TYPES;
  const classificationBlock = buildClassificationContext(classification);
  const basePrompt = SYSTEM_PROMPT_BASE
    .replace("{{TYPES}}", types.map((t) => `"${t}"`).join(", "))
    .replace("{{GROUNDS_REFERENCE}}", buildGroundsReference());
  return classificationBlock ? classificationBlock + basePrompt : basePrompt;
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
        ? normaliseGroundToId(obj.suggestedGround)
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
function preparePages(pages: ExtractedPage[]): ExtractedPage[] {
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
 * Send extracted page text to Azure OpenAI for LGOIMA-aware detection.
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
 * @param classification - Optional document-level classification result.
 * @returns Array of AI detections.
 */
export async function detectWithAI(
  pages: ExtractedPage[],
  existingPatternTexts: string[],
  feedbackPrompt?: string,
  enabledTypes?: Set<string>,
  classification?: DocumentClassification,
): Promise<AIDetection[]> {
  const client = getClient();
  const allDetections: AIDetection[] = [];

  // Pre-process: split oversized pages (e.g. large DOCX single-page docs)
  const preparedPages = preparePages(pages);

  // Process pages in batches of 3 to stay within token limits
  const BATCH_SIZE = 3;

  for (let i = 0; i < preparedPages.length; i += BATCH_SIZE) {
    const batch = preparedPages.slice(i, i + BATCH_SIZE);

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
      const systemPrompt = buildSystemPrompt(enabledTypes, classification);
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
