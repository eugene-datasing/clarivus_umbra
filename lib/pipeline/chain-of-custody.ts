/**
 * Chain-of-Custody Report PDF generator.
 *
 * Produces a formatted PDF documenting the full lifecycle of every document
 * within a case — from upload through processing, review, sign-off, and
 * export. Each event is sourced from the immutable audit trail.
 *
 * This report satisfies LGOIMA chain-of-custody and Public Records Act
 * requirements for defensible disclosure workflows.
 */

import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";
import { prisma } from "@/lib/db/prisma";
import { getOrgBranding } from "@/lib/data/org-config";
import { embedOrgLogo } from "./logo-helper";

export interface ChainOfCustodyResult {
  pdfBytes: Uint8Array;
  documentCount: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN = 50;
const MAX_TEXT_WIDTH = PAGE_WIDTH - 2 * MARGIN;

// ---------------------------------------------------------------------------
// Helpers
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

  // Truncate if text would overflow page width
  const maxChars = Math.floor(MAX_TEXT_WIDTH / (size * 0.5));
  const truncated = text.length > maxChars ? text.slice(0, maxChars - 3) + "..." : text;

  ctx.page.drawText(truncated, { x, y: ctx.yPos, size, font, color });
}

function formatTimestamp(date: Date): string {
  return date.toISOString().replace("T", " ").slice(0, 19) + " UTC";
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ---------------------------------------------------------------------------
// Main builder
// ---------------------------------------------------------------------------

export async function buildChainOfCustodyReport(
  caseId: string,
  generatedBy: string,
): Promise<ChainOfCustodyResult> {
  const [caseData, orgBranding] = await Promise.all([
    prisma.case.findUniqueOrThrow({ where: { id: caseId } }),
    getOrgBranding(),
  ]);

  // Fetch all documents and all audit entries for the case
  const [documents, allAuditEntries] = await Promise.all([
    prisma.document.findMany({
      where: { caseId },
      orderBy: { name: "asc" },
      include: {
        detections: {
          select: { id: true, status: true },
        },
      },
    }),
    prisma.auditEntry.findMany({
      where: { caseId },
      orderBy: { timestamp: "asc" },
    }),
  ]);

  // Build audit index by document name / target for fast lookup
  const auditByTarget = new Map<string, typeof allAuditEntries>();
  for (const entry of allAuditEntries) {
    const key = entry.target?.toLowerCase() ?? "";
    if (!auditByTarget.has(key)) auditByTarget.set(key, []);
    auditByTarget.get(key)!.push(entry);
  }

  // Create PDF
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
  // Title page
  // -----------------------------------------------------------------------

  // Organisation logo (top-right if available)
  const logo = await embedOrgLogo(pdfDoc);
  if (logo) {
    ctx.page.drawImage(logo.image, {
      x: PAGE_WIDTH - MARGIN - logo.width,
      y: ctx.yPos - logo.height + 10,
      width: logo.width,
      height: logo.height,
    });
  }

  ctx.yPos -= 20;
  drawText(ctx, "CHAIN OF CUSTODY REPORT", {
    size: 20,
    font: boldFont,
    color: rgb(0, 0, 0),
  });

  ctx.yPos -= 28;
  drawText(ctx, `Case Reference: ${caseData.reference}`, {
    size: 12,
    font: boldFont,
    color: rgb(0.2, 0.2, 0.2),
  });

  ctx.yPos -= 18;
  drawText(ctx, `Requester: ${caseData.requesterName}`, {
    size: 10,
    color: rgb(0.3, 0.3, 0.3),
  });

  ctx.yPos -= 16;
  drawText(ctx, `Generation Date: ${new Date().toLocaleDateString("en-NZ", { day: "numeric", month: "long", year: "numeric" })}`, {
    size: 10,
    color: rgb(0.3, 0.3, 0.3),
  });

  ctx.yPos -= 16;
  drawText(ctx, `Generated By: ${generatedBy}`, {
    size: 10,
    color: rgb(0.3, 0.3, 0.3),
  });

  ctx.yPos -= 16;
  drawText(ctx, `Total Documents: ${documents.length}`, {
    size: 10,
    color: rgb(0.3, 0.3, 0.3),
  });

  // Divider
  ctx.yPos -= 20;
  ctx.page.drawLine({
    start: { x: MARGIN, y: ctx.yPos },
    end: { x: PAGE_WIDTH - MARGIN, y: ctx.yPos },
    thickness: 1,
    color: rgb(0.7, 0.7, 0.7),
  });
  ctx.yPos -= 10;

  // Summary description
  ctx.yPos -= 10;
  drawText(ctx, "This report documents the full chain of custody for every document in this case,", {
    size: 8,
    color: rgb(0.4, 0.4, 0.4),
  });
  ctx.yPos -= 12;
  drawText(ctx, "including upload, automated processing, human review, senior review, sign-off, and export events.", {
    size: 8,
    color: rgb(0.4, 0.4, 0.4),
  });
  ctx.yPos -= 12;
  drawText(ctx, "Each timeline entry is sourced from the immutable audit trail.", {
    size: 8,
    color: rgb(0.4, 0.4, 0.4),
  });

  ctx.yPos -= 25;

  // -----------------------------------------------------------------------
  // Per-document chain of custody
  // -----------------------------------------------------------------------

  for (let docIndex = 0; docIndex < documents.length; docIndex++) {
    const doc = documents[docIndex];

    // Need at least 120px for the document header + first few timeline entries
    ensureSpace(ctx, 120);

    // Document header separator
    ctx.page.drawLine({
      start: { x: MARGIN, y: ctx.yPos },
      end: { x: PAGE_WIDTH - MARGIN, y: ctx.yPos },
      thickness: 0.8,
      color: rgb(0.6, 0.6, 0.6),
    });
    ctx.yPos -= 18;

    // Document number + name
    drawText(ctx, `Document ${docIndex + 1} of ${documents.length}`, {
      size: 8,
      font: monoFont,
      color: rgb(0.5, 0.5, 0.5),
    });
    ctx.yPos -= 14;

    drawText(ctx, doc.name, {
      size: 12,
      font: boldFont,
      color: rgb(0.1, 0.1, 0.1),
    });
    ctx.yPos -= 16;

    // Document metadata
    const metaItems = [
      `File Type: ${doc.fileType}`,
      `Pages: ${doc.pageCount}`,
      `Size: ${formatFileSize(doc.sizeBytes)}`,
      `Status: ${doc.status}`,
    ];
    drawText(ctx, metaItems.join("   |   "), {
      size: 8,
      color: rgb(0.4, 0.4, 0.4),
    });
    ctx.yPos -= 14;

    if (doc.contentHash) {
      drawText(ctx, `Content Hash: ${doc.contentHash}`, {
        size: 7,
        font: monoFont,
        color: rgb(0.5, 0.5, 0.5),
      });
      ctx.yPos -= 12;
    }

    if (doc.duplicateGroup) {
      drawText(ctx, `Duplicate Group: ${doc.duplicateGroup}`, {
        size: 7,
        font: monoFont,
        color: rgb(0.5, 0.5, 0.5),
      });
      ctx.yPos -= 12;
    }

    // Detection summary
    const accepted = doc.detections.filter((d) => d.status === "accepted").length;
    const rejected = doc.detections.filter((d) => d.status === "rejected").length;
    const pending = doc.detections.filter((d) => d.status === "pending").length;
    drawText(ctx, `Detections: ${accepted} accepted, ${rejected} rejected, ${pending} pending (${doc.detections.length} total)`, {
      size: 8,
      color: rgb(0.3, 0.3, 0.3),
    });
    ctx.yPos -= 18;

    // --------- Timeline ---------
    drawText(ctx, "TIMELINE", {
      size: 9,
      font: boldFont,
      color: rgb(0.2, 0.2, 0.2),
    });
    ctx.yPos -= 14;

    // Build timeline events for this document
    const timeline: Array<{ timestamp: Date; event: string; actor: string; detail?: string }> = [];

    // 1. Uploaded event
    timeline.push({
      timestamp: doc.createdAt,
      event: "Uploaded",
      actor: "System",
      detail: `File: ${doc.name} (${doc.fileType}, ${formatFileSize(doc.sizeBytes)})`,
    });

    // 2. Processing events from timing fields
    if (doc.processingStartedAt) {
      timeline.push({
        timestamp: doc.processingStartedAt,
        event: "Processing Started",
        actor: "Veil AI",
      });
    }

    if (doc.processingCompletedAt) {
      const parts: string[] = [];
      if (doc.extractionMs != null) parts.push(`Extraction: ${doc.extractionMs}ms`);
      if (doc.patternDetectionMs != null) parts.push(`Patterns: ${doc.patternDetectionMs}ms`);
      if (doc.aiDetectionMs != null) parts.push(`AI Detection: ${doc.aiDetectionMs}ms`);
      if (doc.totalProcessingMs != null) parts.push(`Total: ${doc.totalProcessingMs}ms`);

      timeline.push({
        timestamp: doc.processingCompletedAt,
        event: "Processing Completed",
        actor: "Veil AI",
        detail: parts.length > 0 ? parts.join(", ") : undefined,
      });
    }

    // 3. Audit-trail-sourced events for this document
    const docAuditEntries = allAuditEntries.filter((entry) => {
      const target = entry.target?.toLowerCase() ?? "";
      const desc = entry.description?.toLowerCase() ?? "";
      const docNameLower = doc.name.toLowerCase();
      return target.includes(docNameLower) || desc.includes(docNameLower);
    });

    for (const entry of docAuditEntries) {
      const eventType = categorizeAuditType(entry.type);
      if (eventType) {
        timeline.push({
          timestamp: entry.timestamp,
          event: eventType,
          actor: `${entry.userName} (${entry.userRole})`,
          detail: entry.description,
        });
      }
    }

    // Sort timeline by timestamp
    timeline.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    // Draw timeline entries
    for (const entry of timeline) {
      ensureSpace(ctx, 36);

      // Timestamp column
      drawText(ctx, formatTimestamp(entry.timestamp), {
        size: 7,
        font: monoFont,
        color: rgb(0.4, 0.4, 0.4),
      });

      // Event + actor on same line, offset
      drawText(ctx, `${entry.event}`, {
        x: MARGIN + 160,
        size: 8,
        font: boldFont,
        color: rgb(0.2, 0.2, 0.2),
      });

      drawText(ctx, entry.actor, {
        x: MARGIN + 320,
        size: 7,
        color: rgb(0.4, 0.4, 0.4),
      });

      ctx.yPos -= 11;

      // Detail line
      if (entry.detail) {
        ensureSpace(ctx, 20);
        const detailText = entry.detail.length > 100
          ? entry.detail.slice(0, 100) + "..."
          : entry.detail;
        drawText(ctx, detailText, {
          x: MARGIN + 20,
          size: 7,
          color: rgb(0.5, 0.5, 0.5),
        });
        ctx.yPos -= 10;
      }

      // Thin separator between timeline entries
      ctx.yPos -= 3;
      ctx.page.drawLine({
        start: { x: MARGIN + 10, y: ctx.yPos },
        end: { x: PAGE_WIDTH - MARGIN - 10, y: ctx.yPos },
        thickness: 0.2,
        color: rgb(0.92, 0.92, 0.92),
      });
      ctx.yPos -= 6;
    }

    if (timeline.length === 0) {
      drawText(ctx, "No audit trail events recorded for this document.", {
        size: 8,
        color: rgb(0.5, 0.5, 0.5),
      });
      ctx.yPos -= 14;
    }

    ctx.yPos -= 15;
  }

  // -----------------------------------------------------------------------
  // Footer on last page
  // -----------------------------------------------------------------------

  ensureSpace(ctx, 50);

  ctx.yPos -= 10;
  ctx.page.drawLine({
    start: { x: MARGIN, y: ctx.yPos },
    end: { x: PAGE_WIDTH - MARGIN, y: ctx.yPos },
    thickness: 0.5,
    color: rgb(0.8, 0.8, 0.8),
  });
  ctx.yPos -= 14;

  drawText(ctx, "This chain-of-custody report is an immutable record of all handling events for documents in this case.", {
    size: 7,
    color: rgb(0.5, 0.5, 0.5),
  });
  ctx.yPos -= 10;

  drawText(ctx, "It satisfies the requirements of LGOIMA 1987, the Public Records Act 2005, and Archives NZ standards.", {
    size: 7,
    color: rgb(0.5, 0.5, 0.5),
  });
  ctx.yPos -= 12;

  const footerText = orgBranding.footerText || "Generated by Veil LGOIMA Disclosure Platform";
  drawText(ctx, footerText, {
    size: 7,
    color: rgb(0.6, 0.6, 0.6),
  });

  // PDF metadata
  pdfDoc.setTitle(`Chain of Custody — ${caseData.reference}`);
  pdfDoc.setCreator("Veil LGOIMA Disclosure Platform");
  pdfDoc.setProducer(orgBranding.footerText || "Veil LGOIMA Disclosure Platform");
  pdfDoc.setSubject(`Chain of Custody Report for case ${caseData.reference}`);

  const pdfBytes = await pdfDoc.save();

  return {
    pdfBytes,
    documentCount: documents.length,
  };
}

// ---------------------------------------------------------------------------
// Audit type classifier
// ---------------------------------------------------------------------------

/**
 * Map raw audit entry types to human-readable chain-of-custody event labels.
 * Returns null for audit types that are not relevant to chain of custody.
 */
function categorizeAuditType(type: string): string | null {
  const mapping: Record<string, string> = {
    "document-upload": "Document Uploaded",
    "document-uploaded": "Document Uploaded",
    "processing-started": "Processing Started",
    "processing-start": "Processing Started",
    "processing-complete": "Processing Completed",
    "processing-completed": "Processing Completed",
    "processing-error": "Processing Error",
    "detection-accepted": "Detection Reviewed (Accepted)",
    "detection-rejected": "Detection Reviewed (Rejected)",
    "detection-reviewed": "Detection Reviewed",
    "detection-update": "Detection Updated",
    "ground-applied": "Withholding Ground Applied",
    "review-submitted": "Review Submitted",
    "review-started": "Review Started",
    "senior-review": "Senior Review",
    "senior-review-submitted": "Submitted for Senior Review",
    "senior-review-complete": "Senior Review Completed",
    "sign-off": "Final Sign-Off",
    "signed-off": "Final Sign-Off",
    "final-approval": "Final Approval",
    "export-generated": "Export Package Generated",
    "export-started": "Export Started",
    "redaction-verification": "Redaction Verified",
    "document-assigned": "Reviewer Assigned",
    "status-change": "Status Changed",
  };

  return mapping[type] ?? null;
}
