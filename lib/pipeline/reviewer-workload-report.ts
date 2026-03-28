/**
 * Reviewer Workload Analysis Report PDF generator.
 *
 * Produces a formatted PDF documenting reviewer activity: actions per
 * reviewer, documents reviewed, detections handled, and daily trends.
 */

import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";
import { computeReviewerWorkload, type ReviewerWorkloadData } from "@/lib/data/reviewer-workload";
import { getOrgBranding } from "@/lib/data/org-config";

export interface ReviewerWorkloadReportResult {
  pdfBytes: Uint8Array;
  data: ReviewerWorkloadData;
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

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  reviewer: "Reviewer",
  "senior-reviewer": "Senior Reviewer",
  "final-approver": "Final Approver",
  "request-manager": "Request Manager",
  viewer: "Viewer",
};

export async function buildReviewerWorkloadReport(): Promise<ReviewerWorkloadReportResult> {
  const [data, orgBranding] = await Promise.all([
    computeReviewerWorkload(),
    getOrgBranding(),
  ]);

  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const monoFont = await pdfDoc.embedFont(StandardFonts.Courier);

  const ctx: DrawContext = {
    pdfDoc, font, boldFont, monoFont,
    page: pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]),
    yPos: PAGE_HEIGHT - MARGIN,
  };

  // Title
  ctx.yPos -= 20;
  drawText(ctx, "REVIEWER WORKLOAD ANALYSIS", { size: 20, font: boldFont });
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

  // Summary
  drawText(ctx, "SUMMARY", { size: 14, font: boldFont });
  ctx.yPos -= 22;

  const summaryStats = [
    { label: "Active Reviewers", value: `${data.totalReviewers}` },
    { label: "Total Review Actions", value: `${data.totalActions}` },
    { label: "Avg Actions per Reviewer", value: `${data.avgActionsPerReviewer}` },
  ];

  for (const stat of summaryStats) {
    drawText(ctx, stat.label, { size: 10, font: boldFont, color: rgb(0.3, 0.3, 0.3) });
    drawText(ctx, stat.value, { x: MARGIN + 200, size: 10, font: monoFont });
    ctx.yPos -= 16;
  }

  // Reviewer table
  ctx.yPos -= 20;
  ensureSpace(ctx, 80);
  drawText(ctx, "REVIEWER BREAKDOWN", { size: 14, font: boldFont });
  ctx.yPos -= 18;

  if (data.reviewers.length > 0) {
    drawTableHeader(ctx, [
      { label: "Reviewer", x: MARGIN },
      { label: "Role", x: MARGIN + 120 },
      { label: "Docs", x: MARGIN + 215 },
      { label: "Accepted", x: MARGIN + 260 },
      { label: "Rejected", x: MARGIN + 320 },
      { label: "Actions", x: MARGIN + 380 },
      { label: "Last Active", x: MARGIN + 430 },
    ]);

    for (const rev of data.reviewers) {
      ensureSpace(ctx, 16);
      const name = rev.userName.length > 18 ? rev.userName.slice(0, 18) + "..." : rev.userName;
      const role = ROLE_LABELS[rev.userRole] || rev.userRole;
      drawText(ctx, name, { size: 8 });
      drawText(ctx, role, { x: MARGIN + 120, size: 7, color: rgb(0.4, 0.4, 0.4) });
      drawText(ctx, `${rev.documentsReviewed}`, { x: MARGIN + 215, size: 8, font: monoFont });
      drawText(ctx, `${rev.detectionsAccepted}`, { x: MARGIN + 260, size: 8, font: monoFont });
      drawText(ctx, `${rev.detectionsRejected}`, { x: MARGIN + 320, size: 8, font: monoFont });
      drawText(ctx, `${rev.totalActions}`, { x: MARGIN + 380, size: 8, font: monoFont });
      drawText(ctx, rev.lastAction, { x: MARGIN + 430, size: 7, font: monoFont, color: rgb(0.4, 0.4, 0.4) });
      ctx.yPos -= 14;
    }
  } else {
    drawText(ctx, "No review activity recorded yet.", { size: 9, color: rgb(0.5, 0.5, 0.5) });
    ctx.yPos -= 14;
  }

  // Daily activity
  ctx.yPos -= 20;
  ensureSpace(ctx, 80);
  drawText(ctx, "DAILY ACTIVITY", { size: 14, font: boldFont });
  ctx.yPos -= 18;

  if (data.dailyActivity.length > 0) {
    drawTableHeader(ctx, [
      { label: "Date", x: MARGIN },
      { label: "Actions", x: MARGIN + 150 },
    ]);

    // Show last 30 days max
    const recentDays = data.dailyActivity.slice(-30);
    for (const day of recentDays) {
      ensureSpace(ctx, 14);
      drawText(ctx, day.date, { size: 8, font: monoFont });
      drawText(ctx, `${day.count}`, { x: MARGIN + 150, size: 8, font: monoFont });
      ctx.yPos -= 13;
    }

    if (data.dailyActivity.length > 30) {
      ctx.yPos -= 4;
      drawText(ctx, `Showing most recent 30 of ${data.dailyActivity.length} active days.`, {
        size: 7, color: rgb(0.5, 0.5, 0.5),
      });
      ctx.yPos -= 12;
    }
  } else {
    drawText(ctx, "No daily activity data available.", { size: 9, color: rgb(0.5, 0.5, 0.5) });
    ctx.yPos -= 14;
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

  pdfDoc.setTitle("Reviewer Workload Analysis");
  pdfDoc.setCreator("Veil LGOIMA Disclosure Platform");
  pdfDoc.setProducer(orgBranding.footerText || "Veil LGOIMA Disclosure Platform");

  const pdfBytes = await pdfDoc.save();
  return { pdfBytes, data };
}
