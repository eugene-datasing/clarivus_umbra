/**
 * Email-to-PDF renderer — turns a .eml or .msg buffer into a PDF transcript
 * suitable for use as a canonical PDF. Parses the email with existing helpers,
 * builds a plain-text HTML transcript (From/To/Cc/Subject/Date + body +
 * attachments list — Decision (g) in the viewer-rework plan), writes the HTML
 * to a temp file, and invokes LibreOffice to convert to PDF.
 *
 * Phase 1 Step 4 placeholder — the real implementation lands in Phase 1 Step 5.
 * The stub exists so canonical-pdf.ts can import the symbol and its unit tests
 * can mock it at the module boundary without a circular "step 5 before step 4"
 * dependency.
 */

export async function renderEmailAsPdf(
  _buffer: Buffer,
  _fileType: string,
): Promise<Buffer> {
  throw new Error(
    "renderEmailAsPdf is not yet implemented — Phase 1 Step 5 will land the real body.",
  );
}
