/**
 * LGOIMA Compliance Summary Report PDF generator.
 *
 * Produces a formatted PDF documenting compliance metrics across all cases:
 * status distribution, statutory grounds usage, deadline adherence.
 */

import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { embedFonts } from "./pdf-fonts";
import { computeComplianceSummary, type ComplianceSummaryData } from "@/lib/data/compliance-summary";
import { getOrgBranding } from "@/lib/data/org-config";
import { getGroundById } from "@/lib/lgoima-grounds";

export interface ComplianceSummaryReportResult {
  pdfBytes: Uint8Array;
  data: ComplianceSummaryData;
}

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN = 50;

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
  options: { x?: number; size?: number; font?: PDFFont; color?: ReturnType<typeof rgb> } = {},
) {
  const x = options.x ?? MARGIN;
  const size = options.size ?? 9;
  const font = options.font ?? ctx.font;
  const color = options.color ?? rgb(0, 0, 0);
  const maxChars = Math.floor((PAGE_WIDTH - 2 * MARGIN) / (size * 0.5));
  const truncated = text.length > maxChars ? text.slice(0, maxChars - 3) + "..." : text;
  ctx.page.drawText(truncated, { x, y: ctx.yPos, size, font, color });
}

function drawTableHeader(ctx: DrawContext, columns: { label: string; x: number }[]) {
  for (const col of columns) {
    drawText(ctx, col.label, { x: col.x, size: 8, font: ctx.boldFont, color: rgb(0.3, 0.3, 0.3) });
  }
  ctx.yPos -= 4;
  ctx.page.drawLine({
    start: { x: MARGIN, y: ctx.yPos },
    end: { x: PAGE_WIDTH - MARGIN, y: ctx.yPos },
    thickness: 0.5,
    color: rgb(0.8, 0.8, 0.8),
  });
  ctx.yPos -= 10;
}

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  ingesting: "Ingesting",
  "in-review": "In Review",
  "senior-review": "Senior Review",
  "final-approval": "Final Approval",
  qa: "QA",
  "ready-export": "Ready to Export",
  released: "Released",
};

export async function buildComplianceSummaryReport(): Promise<ComplianceSummaryReportResult> {
  const [data, orgBranding] = await Promise.all([
    computeComplianceSummary(),
    getOrgBranding(),
  ]);

  const pdfDoc = await PDFDocument.create();
  const { regular: font, bold: boldFont, mono: monoFont } = await embedFonts(pdfDoc);

  const ctx: DrawContext = {
    pdfDoc, font, boldFont, monoFont,
    page: pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]),
    yPos: PAGE_HEIGHT - MARGIN,
  };

  // Title
  ctx.yPos -= 20;
  drawText(ctx, "LGOIMA COMPLIANCE SUMMARY", { size: 20, font: boldFont });
  ctx.yPos -= 28;
  drawText(ctx, `Date Generated: ${new Date().toLocaleDateString("en-NZ", { day: "numeric", month: "long", year: "numeric" })}`, { size: 10, color: rgb(0.3, 0.3, 0.3) });

  // Divider
  ctx.yPos -= 20;
  ctx.page.drawLine({
    start: { x: MARGIN, y: ctx.yPos },
    end: { x: PAGE_WIDTH - MARGIN, y: ctx.yPos },
    thickness: 1,
    color: rgb(0.7, 0.7, 0.7),
  });
  ctx.yPos -= 25;

  // Summary statistics
  drawText(ctx, "SUMMARY STATISTICS", { size: 14, font: boldFont });
  ctx.yPos -= 22;

  const summaryStats = [
    { label: "Total Cases", value: `${data.totalCases}` },
    { label: "Total Documents", value: `${data.totalDocuments}` },
    { label: "Total Detections", value: `${data.totalDetections}` },
    { label: "Accepted Detections", value: `${data.totalAccepted}` },
    { label: "Rejected Detections", value: `${data.totalRejected}` },
    { label: "Deadline Adherence", value: `${data.deadlineAdherence.percentage}% (${data.deadlineAdherence.met}/${data.deadlineAdherence.total})` },
  ];

  for (const stat of summaryStats) {
    drawText(ctx, stat.label, { size: 10, font: boldFont, color: rgb(0.3, 0.3, 0.3) });
    drawText(ctx, stat.value, { x: MARGIN + 200, size: 10, font: monoFont });
    ctx.yPos -= 16;
  }

  // Cases by status
  ctx.yPos -= 20;
  ensureSpace(ctx, 80);
  drawText(ctx, "CASES BY STATUS", { size: 14, font: boldFont });
  ctx.yPos -= 18;

  for (const [status, count] of Object.entries(data.casesByStatus)) {
    ensureSpace(ctx, 16);
    const label = STATUS_LABELS[status] || status;
    drawText(ctx, label, { size: 9, color: rgb(0.3, 0.3, 0.3) });
    drawText(ctx, `${count}`, { x: MARGIN + 200, size: 9, font: monoFont });
    ctx.yPos -= 14;
  }

  // Statutory grounds usage
  ctx.yPos -= 20;
  ensureSpace(ctx, 80);
  drawText(ctx, "STATUTORY GROUNDS USAGE", { size: 14, font: boldFont });
  ctx.yPos -= 18;

  if (data.groundFrequency.length > 0) {
    drawTableHeader(ctx, [
      { label: "Ground", x: MARGIN },
      { label: "Description", x: MARGIN + 120 },
      { label: "Count", x: MARGIN + 400 },
    ]);

    for (const gf of data.groundFrequency) {
      ensureSpace(ctx, 16);
      const ground = getGroundById(gf.ground);
      const ref = ground ? ground.reference : gf.ground;
      const label = ground ? ground.label : "";
      const displayLabel = label.length > 45 ? label.slice(0, 45) + "..." : label;
      drawText(ctx, ref, { size: 8, font: monoFont });
      drawText(ctx, displayLabel, { x: MARGIN + 120, size: 8, color: rgb(0.3, 0.3, 0.3) });
      drawText(ctx, `${gf.count}`, { x: MARGIN + 400, size: 8, font: monoFont });
      ctx.yPos -= 14;
    }
  } else {
    drawText(ctx, "No statutory grounds applied yet.", { size: 9, color: rgb(0.5, 0.5, 0.5) });
    ctx.yPos -= 14;
  }

  // Cases table
  ctx.yPos -= 20;
  ensureSpace(ctx, 80);
  drawText(ctx, "CASE DETAILS", { size: 14, font: boldFont });
  ctx.yPos -= 18;

  drawTableHeader(ctx, [
    { label: "Reference", x: MARGIN },
    { label: "Status", x: MARGIN + 110 },
    { label: "Docs", x: MARGIN + 200 },
    { label: "Detections", x: MARGIN + 240 },
    { label: "Accepted", x: MARGIN + 310 },
    { label: "Deadline", x: MARGIN + 380 },
    { label: "On Time", x: MARGIN + 445 },
  ]);

  for (const c of data.cases) {
    ensureSpace(ctx, 16);
    drawText(ctx, c.reference, { size: 7, font: monoFont });
    drawText(ctx, STATUS_LABELS[c.status] || c.status, { x: MARGIN + 110, size: 7 });
    drawText(ctx, `${c.documentCount}`, { x: MARGIN + 200, size: 7, font: monoFont });
    drawText(ctx, `${c.detectionCount}`, { x: MARGIN + 240, size: 7, font: monoFont });
    drawText(ctx, `${c.acceptedCount}`, { x: MARGIN + 310, size: 7, font: monoFont });
    drawText(ctx, c.deadline, { x: MARGIN + 380, size: 7, font: monoFont });
    drawText(ctx, c.withinDeadline ? "Yes" : "No", {
      x: MARGIN + 445,
      size: 7,
      font: boldFont,
      color: c.withinDeadline ? rgb(0.1, 0.6, 0.3) : rgb(0.8, 0.2, 0.2),
    });
    ctx.yPos -= 13;
  }

  // Footer
  ctx.yPos -= 15;
  ensureSpace(ctx, 30);
  ctx.page.drawLine({
    start: { x: MARGIN, y: ctx.yPos },
    end: { x: PAGE_WIDTH - MARGIN, y: ctx.yPos },
    thickness: 0.5,
    color: rgb(0.8, 0.8, 0.8),
  });
  ctx.yPos -= 14;
  const footerText = orgBranding.footerText || "Generated by Veil LGOIMA Disclosure Platform";
  drawText(ctx, footerText, { size: 7, color: rgb(0.6, 0.6, 0.6) });

  pdfDoc.setTitle("LGOIMA Compliance Summary");
  pdfDoc.setCreator("Veil LGOIMA Disclosure Platform");
  pdfDoc.setProducer(orgBranding.footerText || "Veil LGOIMA Disclosure Platform");

  const pdfBytes = await pdfDoc.save();
  return { pdfBytes, data };
}
