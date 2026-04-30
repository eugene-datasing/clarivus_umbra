/**
 * Phase 1 verification 2: prompt-caching behaviour against Azure OpenAI.
 *
 * Sends 3 sequential chat-completion requests with the SAME system
 * prompt (≥1024 tokens; ours is ~3,800) and DIFFERENT user content
 * mimicking three AI-detect batches. Logs the response's usage
 * metadata including cached_tokens. If Azure caches the system prefix
 * across calls 2 and 3, we'll see cached_tokens > 0 on those calls.
 *
 * Cost: ~3 GPT-4o chat completions, total ≲ $0.05 NZD.
 *
 * Usage:
 *   npx tsx scripts/verify-prompt-caching.ts
 *
 * Reads AZURE_OPENAI_ENDPOINT / AZURE_OPENAI_KEY / AZURE_OPENAI_DEPLOYMENT
 * from .env. Doesn't touch the DB.
 */

import "dotenv/config";
import { AzureOpenAI } from "openai";
import { buildSystemPrompt } from "../lib/pipeline/ai-detect";

const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
const apiKey = process.env.AZURE_OPENAI_KEY;
const deployment =
  process.env.AZURE_OPENAI_DEPLOYMENT_DETECTION ||
  process.env.AZURE_OPENAI_DEPLOYMENT ||
  "gpt-4o";

if (!endpoint || !apiKey) {
  console.error("Missing AZURE_OPENAI_ENDPOINT or AZURE_OPENAI_KEY in .env");
  process.exit(1);
}

const client = new AzureOpenAI({
  endpoint,
  apiKey,
  deployment,
  apiVersion: "2024-10-21",
});

// Same shape ai-detect.ts builds — full prompt with grounds + worked
// examples + structural heuristics. classification stays undefined so
// we only get the stable prefix (matches the cache-friendly path).
const systemPrompt = buildSystemPrompt(undefined, undefined);

// Three short, distinct user payloads simulating three batches of a
// single document's processing run. Each looks like a real ai-detect
// batch (page-tag delimiters + minimal content).
const userPayloads = [
  `--- PAGE 1 ---\nMs Helen Ferguson, contact details: 021 456 7890. Witness statement.`,
  `--- PAGE 2 ---\nMr David Kellogg interviewed by HR on 12 March 2026 at 10:00.`,
  `--- PAGE 3 ---\nIn confidence: this report contains free and frank advice from senior staff.`,
];

interface UsageDetails {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  prompt_tokens_details?: { cached_tokens?: number; [k: string]: unknown };
  completion_tokens_details?: Record<string, unknown>;
  [k: string]: unknown;
}

async function callOnce(label: string, userContent: string): Promise<UsageDetails | undefined> {
  const t0 = Date.now();
  const res = await client.chat.completions.create({
    model: deployment,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent },
    ],
    temperature: 0.1,
    max_tokens: 256,
    response_format: { type: "json_object" },
  });
  const elapsed = Date.now() - t0;
  console.log(`\n=== ${label} (${elapsed}ms) ===`);
  console.log("usage:", JSON.stringify(res.usage, null, 2));
  return res.usage as UsageDetails | undefined;
}

async function main() {
  console.log(`Endpoint: ${endpoint}`);
  console.log(`Deployment: ${deployment}`);
  console.log(`System prompt length (chars): ${systemPrompt.length}`);
  console.log(
    `System prompt approx tokens (chars/4): ~${Math.round(systemPrompt.length / 4)}`,
  );
  console.log("");

  const usages: UsageDetails[] = [];
  for (let i = 0; i < userPayloads.length; i++) {
    const u = await callOnce(`Batch ${i + 1}/3`, userPayloads[i]);
    if (u) usages.push(u);
    // No artificial delay — we want to test the same-document
    // back-to-back call pattern. Cache TTL is 5 min in Azure OpenAI;
    // a few hundred ms between calls is well within window.
  }

  console.log("\n=== SUMMARY ===");
  for (let i = 0; i < usages.length; i++) {
    const u = usages[i];
    const cached = u.prompt_tokens_details?.cached_tokens ?? 0;
    const prompt = u.prompt_tokens ?? 0;
    const completion = u.completion_tokens ?? 0;
    const cachedPct = prompt > 0 ? Math.round((cached / prompt) * 100) : 0;
    console.log(
      `Batch ${i + 1}: prompt=${prompt}, cached=${cached} (${cachedPct}%), completion=${completion}`,
    );
  }

  const anyCached = usages.some(
    (u) => (u.prompt_tokens_details?.cached_tokens ?? 0) > 0,
  );
  console.log("");
  if (anyCached) {
    console.log(
      "✅ Prompt caching IS active. Subsequent batches reuse the cached system prefix.",
    );
  } else {
    console.log(
      "⚠ Prompt caching NOT detected. Either the deployment doesn't support it, the prompt prefix isn't matching across calls, or the cache TTL didn't apply.",
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
