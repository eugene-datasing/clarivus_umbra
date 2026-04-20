/**
 * Model-choice spike — B1 comparison against GPT-4o baseline.
 *
 * Runs the existing production system prompt against two model deployments,
 * three times each, and emits raw detection JSON per run plus a markdown
 * comparison report. No pipeline code modified; uses the same buildSystemPrompt
 * and preparePages helpers as lib/pipeline/ai-detect.ts.
 *
 * Prereqs:
 *   - B1 fixture at test-fixtures/dummy-lgoima-pack/B1_HR_Investigation_Report_Kellogg_Ferguson.docx
 *   - Docker Postgres NOT required (no DB touch).
 *   - .env populated with:
 *       AZURE_DI_ENDPOINT, AZURE_DI_KEY                      (for DI extraction)
 *       AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_KEY, AZURE_OPENAI_DEPLOYMENT  (baseline)
 *       AZURE_OPENAI_ENDPOINT_SPIKE, AZURE_OPENAI_KEY_SPIKE,
 *       AZURE_OPENAI_DEPLOYMENT_SPIKE                        (spike deployment)
 *       AZURE_OPENAI_APIVERSION_SPIKE (optional, defaults to 2025-01-01-preview)
 *   - LibreOffice available on PATH (DOCX → PDF for DI extraction).
 *
 * Usage:
 *   npx tsx -r dotenv/config scripts/spike-o4-mini.ts
 *
 * Emits to docs/spike-model-comparison-2026-04-20/:
 *   - b1-extracted-pages.json       (DI cache — reused on subsequent runs)
 *   - gpt-4o-baseline-run{1,2,3}.json
 *   - o4-mini-run{1,2,3}.json
 *   - comparison.md
 */
import fs from "fs";
import path from "path";
import { AzureOpenAI } from "openai";
import { extractText, type ExtractedPage } from "../lib/pipeline/extract";
import {
  buildSystemPrompt,
  preparePages,
  type AIDetection,
} from "../lib/pipeline/ai-detect";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const B1_PATH =
  "test-fixtures/dummy-lgoima-pack/B1_HR_Investigation_Report_Kellogg_Ferguson.docx";
const OUTPUT_DIR = "docs/spike-model-comparison-2026-04-20";
const CACHE_FILE = path.join(OUTPUT_DIR, "b1-extracted-pages.json");
const RUNS_PER_CONDITION = 3;
const BATCH_SIZE = 3;

interface Condition {
  label: string;
  endpoint: string;
  apiKey: string;
  deployment: string;
  apiVersion: string;
  isReasoning: boolean;
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function readConditions(): Condition[] {
  return [
    {
      label: "gpt-4o-baseline",
      endpoint: requireEnv("AZURE_OPENAI_ENDPOINT"),
      apiKey: requireEnv("AZURE_OPENAI_KEY"),
      deployment: requireEnv("AZURE_OPENAI_DEPLOYMENT"),
      apiVersion: "2024-10-21",
      isReasoning: false,
    },
    {
      label: "o4-mini",
      endpoint: requireEnv("AZURE_OPENAI_ENDPOINT_SPIKE"),
      apiKey: requireEnv("AZURE_OPENAI_KEY_SPIKE"),
      deployment: requireEnv("AZURE_OPENAI_DEPLOYMENT_SPIKE"),
      apiVersion:
        process.env.AZURE_OPENAI_APIVERSION_SPIKE || "2025-01-01-preview",
      isReasoning: true,
    },
  ];
}

// ---------------------------------------------------------------------------
// Extraction cache
// ---------------------------------------------------------------------------

async function ensurePages(): Promise<ExtractedPage[]> {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  if (fs.existsSync(CACHE_FILE)) {
    console.log(`[cache] using ${CACHE_FILE}`);
    return JSON.parse(fs.readFileSync(CACHE_FILE, "utf-8"));
  }

  if (!fs.existsSync(B1_PATH)) {
    throw new Error(
      `B1 fixture not found at ${B1_PATH}. Stage it before running the spike.`,
    );
  }

  console.log(`[extract] B1 → Azure DI (one-time, ~15-30s)`);
  const buf = fs.readFileSync(B1_PATH);
  const ext = path.extname(B1_PATH).slice(1).toUpperCase();
  const result = await extractText(buf, ext);
  fs.writeFileSync(CACHE_FILE, JSON.stringify(result.pages, null, 2));
  console.log(
    `[cache] wrote ${result.pages.length} pages (${result.pages.reduce(
      (n, p) => n + (p.text?.length ?? 0),
      0,
    )} chars) to ${CACHE_FILE}`,
  );
  return result.pages;
}

// ---------------------------------------------------------------------------
// One run against one condition
// ---------------------------------------------------------------------------

async function runOne(
  condition: Condition,
  pages: ExtractedPage[],
  systemPrompt: string,
): Promise<{
  detections: AIDetection[];
  wallMs: number;
  errors: string[];
  batchCount: number;
}> {
  const client = new AzureOpenAI({
    endpoint: condition.endpoint,
    apiKey: condition.apiKey,
    deployment: condition.deployment,
    apiVersion: condition.apiVersion,
  });

  const preparedPages = preparePages(pages);
  const allDetections: AIDetection[] = [];
  const errors: string[] = [];
  let batchCount = 0;
  const startedAt = Date.now();

  for (let i = 0; i < preparedPages.length; i += BATCH_SIZE) {
    const batch = preparedPages.slice(i, i + BATCH_SIZE);
    const userContent = batch
      .map((p) => `--- PAGE ${p.pageNumber} ---\n${p.text || "(empty page)"}`)
      .join("\n\n");

    if (
      userContent
        .replace(/--- PAGE \d+ ---\n\(empty page\)/g, "")
        .trim().length < 20
    ) {
      continue;
    }

    batchCount += 1;
    const batchLabel = `batch ${batchCount}`;

    // Assemble the request body. Reasoning models (o-series) reject
    // `temperature` and `max_tokens`; they use `max_completion_tokens` and
    // default temperature. Non-reasoning models use the standard params.
    const requestBody: Record<string, unknown> = {
      model: condition.deployment,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
      response_format: { type: "json_object" },
    };

    if (condition.isReasoning) {
      requestBody.max_completion_tokens = 8192;
      // Not setting reasoning_effort — defaults to "medium".
    } else {
      requestBody.temperature = 0.1;
      requestBody.max_tokens = 4096;
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await (client.chat.completions.create as any)(
        requestBody,
      );
      const content = response?.choices?.[0]?.message?.content;
      if (!content) {
        errors.push(`${batchLabel}: empty response`);
        continue;
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(content);
      } catch {
        errors.push(
          `${batchLabel}: non-JSON response (preview: ${String(content).slice(0, 120)})`,
        );
        continue;
      }

      const detectionsArray = Array.isArray(parsed)
        ? parsed
        : Array.isArray((parsed as Record<string, unknown>).detections)
          ? ((parsed as Record<string, unknown>).detections as unknown[])
          : [];

      for (const raw of detectionsArray) {
        if (!raw || typeof raw !== "object") continue;
        const det = raw as Record<string, unknown>;
        const text =
          typeof det.text === "string" ? det.text.trim() : "";
        if (!text) continue;
        allDetections.push({
          type:
            typeof det.type === "string" ? det.type : "confidential",
          text,
          confidence:
            typeof det.confidence === "number" ? det.confidence : 50,
          page: typeof det.page === "number" ? det.page : 1,
          suggestedGround:
            typeof det.suggestedGround === "string"
              ? det.suggestedGround
              : "",
          reasoning:
            typeof det.reasoning === "string" ? det.reasoning : "",
          piConsideration:
            typeof det.piConsideration === "string"
              ? det.piConsideration
              : "",
          aiExplanation:
            typeof det.aiExplanation === "string"
              ? det.aiExplanation
              : "",
        });
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : String(err);
      errors.push(`${batchLabel}: ${message}`);
    }
  }

  return {
    detections: allDetections,
    wallMs: Date.now() - startedAt,
    errors,
    batchCount,
  };
}

// ---------------------------------------------------------------------------
// Summarisation
// ---------------------------------------------------------------------------

interface Summary {
  total: number;
  byType: Record<string, number>;
  byPage: Record<string, number>;
}

function summarise(detections: AIDetection[]): Summary {
  const byType: Record<string, number> = {};
  const byPage: Record<string, number> = {};
  for (const d of detections) {
    byType[d.type] = (byType[d.type] || 0) + 1;
    byPage[String(d.page)] = (byPage[String(d.page)] || 0) + 1;
  }
  return { total: detections.length, byType, byPage };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

interface RunResult {
  condition: string;
  run: number;
  deployment: string;
  wallMs: number;
  batchCount: number;
  errors: string[];
  summary: Summary;
  detections: AIDetection[];
}

async function main(): Promise<void> {
  const conditions = readConditions();
  const pages = await ensurePages();
  // buildSystemPrompt(undefined, undefined) → all types enabled, no classification
  // context. Matches production behaviour when detection_toggles row is absent.
  const systemPrompt = buildSystemPrompt(undefined, undefined);

  console.log(
    `[prompt] system prompt = ${systemPrompt.length} chars; ${pages.length} pages in corpus`,
  );

  const results: RunResult[] = [];

  for (const condition of conditions) {
    for (let run = 1; run <= RUNS_PER_CONDITION; run++) {
      console.log(
        `\n[run] ${condition.label} #${run} → ${condition.deployment} on ${condition.apiVersion}`,
      );
      const { detections, wallMs, errors, batchCount } = await runOne(
        condition,
        pages,
        systemPrompt,
      );
      const summary = summarise(detections);
      const result: RunResult = {
        condition: condition.label,
        run,
        deployment: condition.deployment,
        wallMs,
        batchCount,
        errors,
        summary,
        detections,
      };
      results.push(result);

      const outPath = path.join(
        OUTPUT_DIR,
        `${condition.label}-run${run}.json`,
      );
      fs.writeFileSync(outPath, JSON.stringify(result, null, 2));
      console.log(
        `  → ${detections.length} detections, ${batchCount} batches, ${(wallMs / 1000).toFixed(1)}s, ${errors.length} errors`,
      );
      if (errors.length > 0) {
        for (const e of errors) console.log(`     ! ${e}`);
      }
    }
  }

  // ---------- comparison.md ----------
  const md: string[] = [
    "# Model-choice spike — B1 comparison",
    "",
    `**Date:** 2026-04-20`,
    `**Fixture:** \`${B1_PATH}\``,
    `**Runs per condition:** ${RUNS_PER_CONDITION}`,
    "",
    "## Per-run summary",
    "",
    "| Condition | Run | Deployment | Wall (s) | Batches | Detections | Errors |",
    "|---|---|---|---|---|---|---|",
  ];
  for (const r of results) {
    md.push(
      `| ${r.condition} | ${r.run} | \`${r.deployment}\` | ${(r.wallMs / 1000).toFixed(1)} | ${r.batchCount} | ${r.summary.total} | ${r.errors.length} |`,
    );
  }

  md.push("", "## Detection counts by type");
  md.push("");
  const allTypes = new Set<string>();
  for (const r of results) {
    Object.keys(r.summary.byType).forEach((t) => allTypes.add(t));
  }
  const typeList = Array.from(allTypes).sort();
  md.push(`| Condition / Run | ${typeList.join(" | ")} |`);
  md.push(`|${"---|".repeat(typeList.length + 1)}`);
  for (const r of results) {
    const row = [`${r.condition} #${r.run}`];
    for (const t of typeList) row.push(String(r.summary.byType[t] || 0));
    md.push(`| ${row.join(" | ")} |`);
  }

  md.push("", "## Detection counts by page");
  md.push("");
  md.push("| Condition / Run | Page 1 | Page 2 | Page 3 | Page 4 |");
  md.push("|---|---|---|---|---|");
  for (const r of results) {
    md.push(
      `| ${r.condition} #${r.run} | ${r.summary.byPage["1"] || 0} | ${r.summary.byPage["2"] || 0} | ${r.summary.byPage["3"] || 0} | ${r.summary.byPage["4"] || 0} |`,
    );
  }

  md.push(
    "",
    "## Target-detection checklist",
    "",
    "For each condition, open the raw JSON and tick off whether the following B1 targets were caught (by any run). High-signal targets are listed first.",
    "",
    "### Governance pathway (highest signal)",
    "- [ ] Free-and-frank section sentences (page 3) — any of: 'exhausting', 'abrasive', 'credibility issues', 'my honest read', 'not a clear-cut case'",
    "- [ ] Legal-privileged settlement range `$55,000 — $110,000`",
    "- [ ] Ben Mahuika (external counsel named)",
    "- [ ] Sarah Mitchell (investigator — flag of the candid author)",
    "",
    "### Entity propagation across pages",
    "- [ ] In-prose 'Ms Ferguson' and/or 'Ferguson' on page 2 or 3 (should appear many times)",
    "- [ ] In-prose 'Mr Kellogg' and/or 'Kellogg' on page 2 or 3",
    "- [ ] Witness names: Angela Torres, Jonathan Briggs, Priya Sharma, Mere Rauhihi",
    "",
    "### Labelled-field PII",
    "- [ ] Labelled DOB `14 June 1983`",
    "- [ ] Labelled DOB `3 November 1978`",
    "- [ ] Passport `LA429183`",
    "- [ ] Driver licence `EA123456`",
    "- [ ] Employee numbers `ADC-2284`, `ADC-0917`",
    "",
    "### Third-party PII in prose",
    "- [ ] Dr Sarah Liang (GP name)",
    "- [ ] Phone `(06) 759 2217` (likely regex-missed; AI catch would be a bonus)",
    "- [ ] ICD-10 code `F43.23`",
    "- [ ] Benestar session reference `BEN-48291`",
    "",
    "## Errors",
    "",
  );
  for (const r of results) {
    if (r.errors.length > 0) {
      md.push(`**${r.condition} #${r.run}:**`);
      for (const e of r.errors) md.push(`- ${e}`);
      md.push("");
    }
  }
  if (results.every((r) => r.errors.length === 0)) {
    md.push("No errors across any run.");
  }

  md.push("", "## Raw detection files");
  md.push("");
  md.push(`- \`b1-extracted-pages.json\` — cached DI extraction (reusable for follow-up spikes)`);
  for (const r of results) {
    md.push(
      `- \`${r.condition}-run${r.run}.json\` — ${r.summary.total} detections, ${(r.wallMs / 1000).toFixed(1)}s wall time`,
    );
  }

  md.push("", "## Next steps", "");
  md.push(
    "1. Eyeball the target-detection checklist above across the 3 o4-mini runs vs the 3 gpt-4o runs. Tick boxes per condition.",
  );
  md.push(
    "2. If o4-mini catches the governance-pathway targets that gpt-4o misses, Phase 3's prompt-rework scope in `docs/detection-coverage-plan-2026-04.md` shrinks and Phase 4 entity-propagation may become unnecessary.",
  );
  md.push(
    "3. If both models miss the same targets, prompt + architecture is the dominant factor; plan stands as drafted.",
  );
  md.push(
    "4. If o4-mini is materially slower per batch (compare wall times above), factor that into the final model-choice decision — reasoning models trade latency for accuracy.",
  );

  const mdPath = path.join(OUTPUT_DIR, "comparison.md");
  fs.writeFileSync(mdPath, md.join("\n"));
  console.log(`\n[done] comparison → ${mdPath}`);
}

main().catch((err) => {
  console.error("[fatal]", err);
  process.exit(1);
});
