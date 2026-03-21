/**
 * Cost Recovery Report PDF generator.
 *
 * Produces a formatted PDF documenting processing costs for a LGOIMA case,
 * including automated processing time, human review estimates, senior review
 * time, and per-document breakdowns.
 *
 * Follows the same PDF generation pattern as chain-of-custody.ts.
 */

import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";
import { getCostRecoveryData, COST_RATES, type CostRecoveryData } from "@/lib/data/cost-recovery";
import { getOrgBranding } from "@/lib/data/org-config";

export interface CostRecoveryReportResult {
  pdfBytes: Uint8Array;
  data: CostRecoveryData;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN = 50;
const MAX_TEXT_WIDTH = PAGE_WIDTH - 2 * MARGIN;

// ---------------------------------------------------------------------------
// Drawing helpers (mirrors chain-of-custody.ts)
// ---------------------------------------------------------------------------

interface DrawContext {
  pdfDoc: PDFDocument;
  font: PDFFont;
  boldFont: PDFFont;
  monoFont: PDFFont;
  page: PDFPage;
  yPos: number;
}

function ensureSpace(ctx: DrawContext, needed: number): DrawContext {
  if (ctx.yPos < MARGIN + needed) {
    ctx.page = ctx.pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    ctx.yPos = PAGE_HEIGHT - MARGIN;
  }
  return ctx;
}

function drawText(
  ctx: DrawContext,
  text: string,
  options: {
    x?: number;
    size?: number;
    font?: PDFFont;
    color?: ReturnType<typeof rgb>;
  } = {},
) {
  const x = options.x ?? MARGIN;
  const size = options.size ?? 9;
  const font = options.font ?? ctx.font;
  const color = options.color ?? rgb(0, 0, 0);

  const maxChars = Math.floor(MAX_TEXT_WIDTH / (size * 0.5));
  const truncated = text.length > maxChars ? text.slice(0, maxChars - 3) + "..." : text;

  ctx.page.drawText(truncated, { x, y: ctx.yPos, size, font, color });
}

function drawHorizontalLine(ctx: DrawContext, thickness = 0.5, color = rgb(0.7, 0.7, 0.7)) {
  ctx.page.drawLine({
    start: { x: MARGIN, y: ctx.yPos },
    end: { x: PAGE_WIDTH - MARGIN, y: ctx.yPos },
    thickness,
    color,
  });
}

function formatNZD(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

function formatHours(hours: number): string {
  if (hours < 0.01) return "< 0.01 hrs";
  return `${hours.toFixed(2)} hrs`;
}

function formatMs(ms: number | null): string {
  if (ms === null) return "N/A";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

// ---------------------------------------------------------------------------
// Table drawing helpers
// ---------------------------------------------------------------------------

interface TableColumn {
  label: string;
  x: number;
  width: number;
  align?: "left" | "right";
}

function drawTableHeader(ctx: DrawContext, columns: TableColumn[]) {
  ensureSpace(ctx, 30);

  // Header background
  ctx.page.drawRectangle({
    x: MARGIN,
    y: ctx.yPos - 4,
    width: MAX_TEXT_WIDTH,
    height: 16,
    color: rgb(0.93, 0.93, 0.93),
  });

  for (const col of columns) {
    drawText(ctx, col.label, {
      x: col.x,
      size: 7,
      font: ctx.boldFont,
      color: rgb(0.2, 0.2, 0.2),
    });
  }
  ctx.yPos -= 18;
}

function drawTableRow(ctx: DrawContext, columns: TableColumn[], values: string[], bold = false) {
  ensureSpace(ctx, 16);
  for (let i = 0; i < columns.length; i++) {
    const col = columns[i];
    const value = values[i] ?? "";
    drawText(ctx, value, {
      x: col.x,
      size: 8,
      font: bold ? ctx.boldFont : ctx.font,
      color: bold ? rgb(0, 0, 0) : rgb(0.2, 0.2, 0.2),
    });
  }
  ctx.yPos -= 13;
}

// ---------------------------------------------------------------------------
// Main builder
// ---------------------------------------------------------------------------

export async function buildCostRecoveryReport(
  caseId: string,
): Promise<CostRecoveryReportResult> {
  const [data, orgBranding] = await Promise.all([
    getCostRecoveryData(caseId),
    getOrgBranding(),
  ]);

  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const monoFont = await pdfDoc.embedFont(StandardFonts.Courier);

  const ctx: DrawContext = {
    pdfDoc,
    font,
    boldFont,
    monoFont,
    page: pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]),
    yPos: PAGE_HEIGHT - MARGIN,
  };

  // -----------------------------------------------------------------------
  // Title
  // -----------------------------------------------------------------------

  ctx.yPos -= 20;
  drawText(ctx, "COST RECOVERY REPORT", {
    size: 20,
    font: boldFont,
    color: rgb(0, 0, 0),
  });

  // -----------------------------------------------------------------------
  // Case details
  // -----------------------------------------------------------------------

  ctx.yPos -= 28;
  drawText(ctx, `Case Reference: ${data.caseReference}`, {
    size: 12,
    font: boldFont,
    color: rgb(0.2, 0.2, 0.2),
  });

  ctx.yPos -= 18;
  drawText(ctx, `Requester: ${data.requesterName}`, {
    size: 10,
    color: rgb(0.3, 0.3, 0.3),
  });

  ctx.yPos -= 16;
  drawText(ctx, `Date Received: ${data.dateReceived}`, {
    size: 10,
    color: rgb(0.3, 0.3, 0.3),
  });

  ctx.yPos -= 16;
  drawText(ctx, `Generation Date: ${new Date().toLocaleDateString("en-NZ", { day: "numeric", month: "long", year: "numeric" })}`, {
    size: 10,
    color: rgb(0.3, 0.3, 0.3),
  });

  ctx.yPos -= 16;
  drawText(ctx, `Documents: ${data.documentCount}  |  Total Pages: ${data.pageCount}`, {
    size: 10,
    color: rgb(0.3, 0.3, 0.3),
  });

  // Divider
  ctx.yPos -= 20;
  drawHorizontalLine(ctx, 1, rgb(0.7, 0.7, 0.7));
  ctx.yPos -= 20;

  // -----------------------------------------------------------------------
  // Summary table: time allocation
  // -----------------------------------------------------------------------

  drawText(ctx, "TIME ALLOCATION SUMMARY", {
    size: 11,
    font: boldFont,
    color: rgb(0.1, 0.1, 0.1),
  });
  ctx.yPos -= 20;

  const summaryColumns: TableColumn[] = [
    { label: "Activity", x: MARGIN, width: 200 },
    { label: "Hours", x: MARGIN + 250, width: 80, align: "right" },
  ];

  drawTableHeader(ctx, summaryColumns);

  drawTableRow(ctx, summaryColumns, [
    "Automated AI Processing",
    formatHours(data.automatedProcessingHours),
  ]);
  drawTableRow(ctx, summaryColumns, [
    "Human Review (est.)",
    formatHours(data.humanReviewHours),
  ]);
  drawTableRow(ctx, summaryColumns, [
    "Senior / Legal Review (est.)",
    formatHours(data.seniorReviewHours),
  ]);

  // Separator before total
  ctx.page.drawLine({
    start: { x: MARGIN, y: ctx.yPos + 2 },
    end: { x: MARGIN + 350, y: ctx.yPos + 2 },
    thickness: 0.5,
    color: rgb(0.6, 0.6, 0.6),
  });
  ctx.yPos -= 4;

  drawTableRow(ctx, summaryColumns, [
    "TOTAL",
    formatHours(data.totalHours),
  ], true);

  ctx.yPos -= 15;

  // -----------------------------------------------------------------------
  // Cost breakdown table
  // -----------------------------------------------------------------------

  drawText(ctx, "COST BREAKDOWN", {
    size: 11,
    font: boldFont,
    color: rgb(0.1, 0.1, 0.1),
  });
  ctx.yPos -= 20;

  const costColumns: TableColumn[] = [
    { label: "Cost Line", x: MARGIN, width: 180 },
    { label: "Rate (NZD/hr)", x: MARGIN + 200, width: 80 },
    { label: "Hours", x: MARGIN + 300, width: 60 },
    { label: "Total (NZD)", x: MARGIN + 380, width: 80, align: "right" },
  ];

  drawTableHeader(ctx, costColumns);

  drawTableRow(ctx, costColumns, [
    "Automated Processing",
    formatNZD(COST_RATES.AUTOMATED_PROCESSING_RATE),
    formatHours(data.automatedProcessingHours),
    formatNZD(data.automatedCostNZD),
  ]);
  drawTableRow(ctx, costColumns, [
    "Human Review",
    formatNZD(COST_RATES.HUMAN_REVIEW_RATE),
    formatHours(data.humanReviewHours),
    formatNZD(data.reviewCostNZD),
  ]);
  drawTableRow(ctx, costColumns, [
    "Senior / Legal Review",
    formatNZD(COST_RATES.SENIOR_REVIEW_RATE),
    formatHours(data.seniorReviewHours),
    formatNZD(data.seniorReviewCostNZD),
  ]);

  // Separator before total
  ctx.page.drawLine({
    start: { x: MARGIN, y: ctx.yPos + 2 },
    end: { x: MARGIN + 470, y: ctx.yPos + 2 },
    thickness: 0.5,
    color: rgb(0.6, 0.6, 0.6),
  });
  ctx.yPos -= 4;

  drawTableRow(ctx, costColumns, [
    "GRAND TOTAL",
    "",
    formatHours(data.totalHours),
    formatNZD(data.totalCostNZD),
  ], true);

  ctx.yPos -= 25;

  // -----------------------------------------------------------------------
  // Per-document breakdown table
  // -----------------------------------------------------------------------

  drawText(ctx, "PER-DOCUMENT BREAKDOWN", {
    size: 11,
    font: boldFont,
    color: rgb(0.1, 0.1, 0.1),
  });
  ctx.yPos -= 20;

  const docColumns: TableColumn[] = [
    { label: "Document Name", x: MARGIN, width: 200 },
    { label: "Pages", x: MARGIN + 220, width: 40 },
    { label: "Processing Time", x: MARGIN + 280, width: 80 },
    { label: "Est. Review (min)", x: MARGIN + 380, width: 80, align: "right" },
  ];

  drawTableHeader(ctx, docColumns);

  for (const doc of data.documents) {
    ensureSpace(ctx, 16);
    drawTableRow(ctx, docColumns, [
      doc.name,
      String(doc.pages),
      formatMs(doc.processingMs),
      String(doc.estimatedReviewMinutes),
    ]);
  }

  if (data.documents.length === 0) {
    drawText(ctx, "No documents in this case.", {
      size: 8,
      color: rgb(0.5, 0.5, 0.5),
    });
    ctx.yPos -= 14;
  }

  ctx.yPos -= 20;

  // -----------------------------------------------------------------------
  // Notes
  // -----------------------------------------------------------------------

  ensureSpace(ctx, 80);

  drawText(ctx, "NOTES", {
    size: 9,
    font: boldFont,
    color: rgb(0.2, 0.2, 0.2),
  });
  ctx.yPos -= 14;

  const notes = [
    `Automated processing rate: ${formatNZD(COST_RATES.AUTOMATED_PROCESSING_RATE)}/hr`,
    `Human review estimate: ${COST_RATES.MINUTES_PER_DETECTION} minutes per detection at ${formatNZD(COST_RATES.HUMAN_REVIEW_RATE)}/hr`,
    `Senior review: ${(COST_RATES.SENIOR_REVIEW_RATIO * 100).toFixed(0)}% of human review time at ${formatNZD(COST_RATES.SENIOR_REVIEW_RATE)}/hr`,
    "All costs are in NZD, exclusive of GST.",
    "Review times are estimates based on detection counts and may vary.",
  ];

  for (const note of notes) {
    ensureSpace(ctx, 14);
    drawText(ctx, `  - ${note}`, {
      size: 7,
      color: rgb(0.4, 0.4, 0.4),
    });
    ctx.yPos -= 11;
  }

  // -----------------------------------------------------------------------
  // Footer
  // -----------------------------------------------------------------------

  ctx.yPos -= 15;
  ensureSpace(ctx, 40);

  drawHorizontalLine(ctx, 0.5, rgb(0.8, 0.8, 0.8));
  ctx.yPos -= 14;

  const footerText = orgBranding.footerText || "Generated by Veil LGOIMA Disclosure Platform";
  drawText(ctx, footerText, {
    size: 7,
    color: rgb(0.6, 0.6, 0.6),
  });

  // PDF metadata
  pdfDoc.setTitle(`Cost Recovery Report — ${data.caseReference}`);
  pdfDoc.setCreator("Veil LGOIMA Disclosure Platform");
  pdfDoc.setProducer(orgBranding.footerText || "Veil LGOIMA Disclosure Platform");
  pdfDoc.setSubject(`Cost Recovery Report for case ${data.caseReference}`);

  const pdfBytes = await pdfDoc.save();

  return {
    pdfBytes,
    data,
  };
}
