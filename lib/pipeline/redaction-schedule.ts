/**
 * Redaction schedule PDF generator.
 *
 * Lists every accepted detection in a batch grouped by detection
 * type. Each row identifies the document, the page, and the
 * detection type (no redacted text — see "Leakage rule" below).
 * Reviewer notes (free-form `note` field) are surfaced when
 * `includeReasoning` is set; the underlying redacted strings are
 * never written to this artefact.
 *
 * Leakage rule (Phase 7 / Amendment A4): the redaction schedule is a
 * circulated document. Including the redacted values — even masked —
 * defeats the purpose of redaction by leaking the underlying
 * information through the schedule itself. This generator MUST NOT
 * write `Detection.text` (the matched payload) to the PDF. Type +
 * page + count + optional reviewer note are sufficient for downstream
 * reviewers to map a redaction back to its source.
 */

import { PDFDocument, rgb } from "pdf-lib";
import { embedFonts } from "./pdf-fonts";
import { prisma } from "@/lib/db/prisma";
import { getOrgBranding } from "@/lib/data/org-config";
import { embedOrgLogo } from "./logo-helper";

export interface RedactionScheduleResult {
  pdfBytes: Uint8Array;
  itemCount: number;
}

interface ScheduleRow {
  documentName: string;
  page: number;
  type: string;
  note: string | null;
}

/**
 * Build a redaction schedule PDF. Detections are grouped by type, and
 * within each type by document → page. Per row: document name, page
 * number, optional reviewer note. The redacted text itself is never
 * emitted.
 */
export async function buildRedactionSchedule(
  batchId: string,
  options: { includeReasoning?: boolean; documentIds?: string[] } = {},
): Promise<RedactionScheduleResult> {
  const { includeReasoning = false, documentIds } = options;

  const [batchData, orgBranding] = await Promise.all([
    prisma.batch.findUniqueOrThrow({ where: { id: batchId } }),
    getOrgBranding(),
  ]);

  const documentFilter = documentIds
    ? { documentId: { in: documentIds }, status: "accepted" as const }
    : { document: { batchId }, status: "accepted" as const };

  const acceptedDetections = await prisma.detection.findMany({
    where: documentFilter,
    select: {
      type: true,
      page: true,
      note: true,
      document: { select: { name: true } },
    },
    orderBy: [{ type: "asc" }, { document: { name: "asc" } }, { page: "asc" }],
  });

  // Group by type. Within each type, rows are already ordered by
  // (document name, page) thanks to the orderBy above.
  const byType = new Map<string, ScheduleRow[]>();
  for (const det of acceptedDetections) {
    const row: ScheduleRow = {
      documentName: det.document.name,
      page: det.page,
      type: det.type,
      note: det.note ?? null,
    };
    const list = byType.get(det.type);
    if (list) list.push(row);
    else byType.set(det.type, [row]);
  }

  const pdfDoc = await PDFDocument.create();
  const { regular: font, bold: boldFont } = await embedFonts(pdfDoc);
  const pageWidth = 595;
  const pageHeight = 842;
  const margin = 50;

  let page = pdfDoc.addPage([pageWidth, pageHeight]);
  let yPos = pageHeight - margin;

  const logo = await embedOrgLogo(pdfDoc);
  if (logo) {
    page.drawImage(logo.image, {
      x: pageWidth - margin - logo.width,
      y: yPos - logo.height + 10,
      width: logo.width,
      height: logo.height,
    });
  }

  // ----- Title block -----
  yPos -= 60;
  page.drawText("REDACTION SCHEDULE", {
    x: margin,
    y: yPos,
    size: 20,
    font: boldFont,
    color: rgb(0, 0, 0),
  });
  yPos -= 30;
  page.drawText(`Batch: ${batchData.reference}`, {
    x: margin,
    y: yPos,
    size: 12,
    font,
    color: rgb(0.3, 0.3, 0.3),
  });
  yPos -= 18;
  page.drawText(
    `Date Generated: ${new Date().toLocaleDateString("en-NZ", { day: "numeric", month: "long", year: "numeric" })}`,
    { x: margin, y: yPos, size: 10, font, color: rgb(0.3, 0.3, 0.3) },
  );
  yPos -= 16;
  page.drawText(`Total Redactions: ${acceptedDetections.length}`, {
    x: margin,
    y: yPos,
    size: 10,
    font,
    color: rgb(0.3, 0.3, 0.3),
  });

  yPos -= 20;
  page.drawLine({
    start: { x: margin, y: yPos },
    end: { x: pageWidth - margin, y: yPos },
    thickness: 1,
    color: rgb(0.8, 0.8, 0.8),
  });
  yPos -= 20;

  // ----- Summary by type -----
  page.drawText("Summary by Detection Type", {
    x: margin,
    y: yPos,
    size: 12,
    font: boldFont,
    color: rgb(0, 0, 0),
  });
  yPos -= 20;

  for (const [type, rows] of byType) {
    if (yPos < margin + 40) {
      page = pdfDoc.addPage([pageWidth, pageHeight]);
      yPos = pageHeight - margin;
    }

    page.drawText(`${type}: ${rows.length} item(s)`, {
      x: margin + 10,
      y: yPos,
      size: 10,
      font: boldFont,
      color: rgb(0.2, 0.2, 0.2),
    });
    yPos -= 16;
  }

  yPos -= 20;

  // ----- Detail by type -----
  for (const [type, rows] of byType) {
    if (yPos < margin + 60) {
      page = pdfDoc.addPage([pageWidth, pageHeight]);
      yPos = pageHeight - margin;
    }

    page.drawLine({
      start: { x: margin, y: yPos },
      end: { x: pageWidth - margin, y: yPos },
      thickness: 0.5,
      color: rgb(0.7, 0.7, 0.7),
    });
    yPos -= 18;

    page.drawText(type, {
      x: margin,
      y: yPos,
      size: 13,
      font: boldFont,
      color: rgb(0.1, 0.1, 0.1),
    });
    yPos -= 18;

    // Table header — note: NO "withheld text" column. The schedule
    // never carries the underlying value.
    page.drawText("Document", {
      x: margin,
      y: yPos,
      size: 8,
      font: boldFont,
      color: rgb(0.3, 0.3, 0.3),
    });
    page.drawText("Page", {
      x: margin + 320,
      y: yPos,
      size: 8,
      font: boldFont,
      color: rgb(0.3, 0.3, 0.3),
    });
    page.drawText("Note", {
      x: margin + 380,
      y: yPos,
      size: 8,
      font: boldFont,
      color: rgb(0.3, 0.3, 0.3),
    });
    yPos -= 14;

    for (const row of rows) {
      if (yPos < margin + 30) {
        page = pdfDoc.addPage([pageWidth, pageHeight]);
        yPos = pageHeight - margin;
      }

      const docName =
        row.documentName.length > 50
          ? row.documentName.slice(0, 50) + "..."
          : row.documentName;
      page.drawText(docName, { x: margin, y: yPos, size: 8, font, color: rgb(0, 0, 0) });
      page.drawText(`p.${row.page}`, {
        x: margin + 320,
        y: yPos,
        size: 8,
        font,
        color: rgb(0.4, 0.4, 0.4),
      });

      if (includeReasoning && row.note) {
        const truncated =
          row.note.length > 60 ? row.note.slice(0, 60) + "..." : row.note;
        page.drawText(truncated, {
          x: margin + 380,
          y: yPos,
          size: 8,
          font,
          color: rgb(0.3, 0.3, 0.3),
        });
      }
      yPos -= 12;
    }

    yPos -= 10;
  }

  // ----- Footer -----
  if (yPos < margin + 30) {
    page = pdfDoc.addPage([pageWidth, pageHeight]);
    yPos = pageHeight - margin;
  }
  yPos -= 20;
  page.drawLine({
    start: { x: margin, y: yPos },
    end: { x: pageWidth - margin, y: yPos },
    thickness: 0.5,
    color: rgb(0.8, 0.8, 0.8),
  });
  yPos -= 14;
  const footer = orgBranding.footerText || "Generated by Umbra";
  page.drawText(footer, {
    x: margin,
    y: yPos,
    size: 7,
    font,
    color: rgb(0.6, 0.6, 0.6),
  });

  pdfDoc.setTitle(`Redaction Schedule — ${batchData.reference}`);
  pdfDoc.setCreator("Umbra");
  pdfDoc.setProducer(orgBranding.footerText || "Umbra");

  const pdfBytes = await pdfDoc.save();

  return {
    pdfBytes,
    itemCount: acceptedDetections.length,
  };
}
