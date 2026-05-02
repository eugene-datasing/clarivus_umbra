/**
 * AI Detection Accuracy Report PDF generator.
 *
 * Produces a formatted PDF documenting AI model performance metrics:
 * overall precision, entity breakdown, and confidence distributions.
 */

import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { embedFonts } from "./pdf-fonts";
import { computeAccuracyMetrics, type AIMetrics } from "@/lib/data/ai-metrics";
import { getOrgBranding } from "@/lib/data/org-config";

export interface AIAccuracyReportResult {
  pdfBytes: Uint8Array;
  metrics: AIMetrics;
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

export async function buildAIAccuracyReport(): Promise<AIAccuracyReportResult> {
  const [metrics, orgBranding] = await Promise.all([
    computeAccuracyMetrics(),
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
  drawText(ctx, "AI DETECTION ACCURACY REPORT", { size: 20, font: boldFont });
  ctx.yPos -= 28;
  drawText(ctx, `Date Generated: ${new Date().toLocaleDateString("en-NZ", { day: "numeric", month: "long", year: "numeric" })}`, { size: 10, color: rgb(0.3, 0.3, 0.3) });
  ctx.yPos -= 16;
  drawText(ctx, `Model: Azure OpenAI GPT-4o`, { size: 10, color: rgb(0.3, 0.3, 0.3) });
  ctx.yPos -= 16;
  drawText(ctx, `Total AI Detections: ${metrics.aiDetections}`, { size: 10, color: rgb(0.3, 0.3, 0.3) });
  ctx.yPos -= 16;
  drawText(ctx, `Total Reviewed: ${metrics.totalReviewed}`, { size: 10, color: rgb(0.3, 0.3, 0.3) });

  // Divider
  ctx.yPos -= 20;
  ctx.page.drawLine({
    start: { x: MARGIN, y: ctx.yPos },
    end: { x: PAGE_WIDTH - MARGIN, y: ctx.yPos },
    thickness: 1,
    color: rgb(0.7, 0.7, 0.7),
  });
  ctx.yPos -= 25;

  // Overall metrics
  drawText(ctx, "OVERALL PERFORMANCE", { size: 14, font: boldFont });
  ctx.yPos -= 22;

  const precisionPct = (metrics.precision * 100).toFixed(1);
  const fpRate = metrics.totalReviewed > 0 ? ((metrics.fp / metrics.totalReviewed) * 100).toFixed(1) : "0.0";

  const overallStats = [
    { label: "Precision", value: `${precisionPct}%` },
    { label: "True Positives", value: `${metrics.tp}` },
    { label: "False Positives", value: `${metrics.fp}` },
    { label: "False Positive Rate", value: `${fpRate}%` },
  ];

  for (const stat of overallStats) {
    drawText(ctx, stat.label, { size: 10, font: boldFont, color: rgb(0.3, 0.3, 0.3) });
    drawText(ctx, stat.value, { x: MARGIN + 200, size: 10, font: monoFont });
    ctx.yPos -= 16;
  }

  if (!metrics.hasSufficientData) {
    ctx.yPos -= 6;
    drawText(ctx, "Note: Insufficient sample size (<10 reviews). Metrics will stabilise as more detections are reviewed.", {
      size: 8, color: rgb(0.6, 0.3, 0.1),
    });
    ctx.yPos -= 12;
  }

  // Entity breakdown
  ctx.yPos -= 20;
  ensureSpace(ctx, 80);
  drawText(ctx, "ENTITY BREAKDOWN", { size: 14, font: boldFont });
  ctx.yPos -= 18;

  if (metrics.entityBreakdown.length > 0) {
    drawTableHeader(ctx, [
      { label: "Entity Type", x: MARGIN },
      { label: "Total", x: MARGIN + 180 },
      { label: "TP", x: MARGIN + 230 },
      { label: "FP", x: MARGIN + 270 },
      { label: "Precision", x: MARGIN + 320 },
      { label: "Sample", x: MARGIN + 400 },
    ]);

    for (const entity of metrics.entityBreakdown) {
      ensureSpace(ctx, 16);
      drawText(ctx, entity.entity, { size: 8 });
      drawText(ctx, `${entity.total}`, { x: MARGIN + 180, size: 8, font: monoFont });
      drawText(ctx, `${entity.tp}`, { x: MARGIN + 230, size: 8, font: monoFont });
      drawText(ctx, `${entity.fp}`, { x: MARGIN + 270, size: 8, font: monoFont });
      drawText(ctx, `${(entity.precision * 100).toFixed(1)}%`, { x: MARGIN + 320, size: 8, font: monoFont });
      drawText(ctx, `${entity.sampleSize}`, { x: MARGIN + 400, size: 8, font: monoFont });
      ctx.yPos -= 14;
    }
  } else {
    drawText(ctx, "No entity-level data available yet.", { size: 9, color: rgb(0.5, 0.5, 0.5) });
    ctx.yPos -= 14;
  }

  // Confidence distribution
  ctx.yPos -= 20;
  ensureSpace(ctx, 80);
  drawText(ctx, "CONFIDENCE DISTRIBUTION", { size: 14, font: boldFont });
  ctx.yPos -= 18;

  drawTableHeader(ctx, [
    { label: "Band", x: MARGIN },
    { label: "Count", x: MARGIN + 180 },
    { label: "Percentage", x: MARGIN + 280 },
  ]);

  for (const band of metrics.confidenceDistribution) {
    ensureSpace(ctx, 16);
    drawText(ctx, band.label, { size: 9 });
    drawText(ctx, `${band.count}`, { x: MARGIN + 180, size: 9, font: monoFont });
    drawText(ctx, `${band.percentage}%`, { x: MARGIN + 280, size: 9, font: monoFont });
    ctx.yPos -= 14;
  }

  // Methodology
  ctx.yPos -= 25;
  ensureSpace(ctx, 100);
  drawText(ctx, "METHODOLOGY", { size: 14, font: boldFont });
  ctx.yPos -= 18;

  const methodologyLines = [
    "This report measures AI detection accuracy using reviewer decisions as ground truth.",
    "True Positive (TP): AI detection accepted by reviewer.",
    "False Positive (FP): AI detection rejected by reviewer.",
    "Precision = TP / (TP + FP). Higher precision = fewer false alarms.",
    "False negatives (items AI missed) are approximated but not fully measurable without",
    "independent ground truth annotation.",
    "Confidence scores reflect the AI model's self-assessed certainty for each detection.",
  ];

  for (const line of methodologyLines) {
    ensureSpace(ctx, 14);
    drawText(ctx, line, { size: 8, color: rgb(0.4, 0.4, 0.4) });
    ctx.yPos -= 12;
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
  const footerText = orgBranding.footerText || "Generated by Umbra";
  drawText(ctx, footerText, { size: 7, color: rgb(0.6, 0.6, 0.6) });

  pdfDoc.setTitle("AI Detection Accuracy Report");
  pdfDoc.setCreator("Umbra");
  pdfDoc.setProducer(orgBranding.footerText || "Umbra");

  const pdfBytes = await pdfDoc.save();
  return { pdfBytes, metrics };
}
