// Throwaway diagnostic: invoke buildRedactedPdf for a given document ID and
// write the output PDF to /tmp/veil-redacted.pdf. Read-only — does not mutate
// the DB, only reads the doc + its accepted detections and runs the Tier 1 /
// Tier 2 / Tier 3 pipeline. Safe to run against dev.
import { promises as fs } from "fs";
import { buildRedactedPdf } from "@/lib/pipeline/redact-pdf";

const DOC_ID = process.argv[2];
if (!DOC_ID) {
  console.error("usage: npx tsx scripts/redact-one-document.ts <documentId>");
  process.exit(1);
}

(async () => {
  const result = await buildRedactedPdf(DOC_ID);
  const out = "/tmp/veil-redacted.pdf";
  await fs.writeFile(out, result.pdfBytes);
  console.log(JSON.stringify({
    outputPath: out,
    bytes: result.pdfBytes.length,
    redactionCount: result.redactionCount,
    pageCount: result.pageCount,
  }, null, 2));
})().catch((err) => {
  console.error("Redaction failed:", err);
  process.exit(1);
});
