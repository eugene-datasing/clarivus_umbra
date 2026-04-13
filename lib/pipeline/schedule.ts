/**
 * Withholding schedule PDF generator.
 *
 * Produces a formatted PDF listing all accepted detections grouped by
 * document and withholding ground, suitable for inclusion in LGOIMA
 * response packages.
 */

import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { prisma } from "@/lib/db/prisma";
import { getGroundById } from "@/lib/lgoima-grounds";
import { getOrgBranding } from "@/lib/data/org-config";
import { embedOrgLogo } from "./logo-helper";

export interface ScheduleResult {
  pdfBytes: Uint8Array;
  itemCount: number;
}

/**
 * Generate a withholding schedule PDF for a case.
 * Groups accepted detections by ground, then by document.
 */
export async function buildWithholdingSchedule(
  caseId: string,
  options: { includeReasoning?: boolean; documentIds?: string[] } = {},
): Promise<ScheduleResult> {
  const { includeReasoning = false, documentIds } = options;

  const [caseData, orgBranding] = await Promise.all([
    prisma.case.findUniqueOrThrow({ where: { id: caseId } }),
    getOrgBranding(),
  ]);

  // Scope detections to selected documents if provided
  const documentFilter = documentIds
    ? { documentId: { in: documentIds }, status: "accepted" as const }
    : { document: { caseId }, status: "accepted" as const };

  const acceptedDetections = await prisma.detection.findMany({
    where: documentFilter,
    include: { document: { select: { name: true } } },
    orderBy: [{ appliedGround: "asc" }, { document: { name: "asc" } }, { page: "asc" }],
  });

  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const pageWidth = 595;
  const pageHeight = 842;
  const margin = 50;
  const maxWidth = pageWidth - 2 * margin;

  let page = pdfDoc.addPage([pageWidth, pageHeight]);
  let yPos = pageHeight - margin;

  // Organisation logo (top-right if available)
  const logo = await embedOrgLogo(pdfDoc);
  if (logo) {
    page.drawImage(logo.image, {
      x: pageWidth - margin - logo.width,
      y: yPos - logo.height + 10,
      width: logo.width,
      height: logo.height,
    });
  }

  // ----- Title page -----
  yPos -= 60;
  page.drawText("WITHHOLDING SCHEDULE", {
    x: margin,
    y: yPos,
    size: 20,
    font: boldFont,
    color: rgb(0, 0, 0),
  });
  yPos -= 30;
  page.drawText(`Case: ${caseData.reference}`, {
    x: margin,
    y: yPos,
    size: 12,
    font,
    color: rgb(0.3, 0.3, 0.3),
  });
  yPos -= 18;
  page.drawText(`Requester: ${caseData.requesterName}`, {
    x: margin,
    y: yPos,
    size: 10,
    font,
    color: rgb(0.3, 0.3, 0.3),
  });
  yPos -= 16;
  page.drawText(`Date Generated: ${new Date().toLocaleDateString("en-NZ", { day: "numeric", month: "long", year: "numeric" })}`, {
    x: margin,
    y: yPos,
    size: 10,
    font,
    color: rgb(0.3, 0.3, 0.3),
  });
  yPos -= 16;
  page.drawText(`Total Withholdings: ${acceptedDetections.length}`, {
    x: margin,
    y: yPos,
    size: 10,
    font,
    color: rgb(0.3, 0.3, 0.3),
  });

  // Divider
  yPos -= 20;
  page.drawLine({
    start: { x: margin, y: yPos },
    end: { x: pageWidth - margin, y: yPos },
    thickness: 1,
    color: rgb(0.8, 0.8, 0.8),
  });
  yPos -= 10;

  // Summary by ground
  yPos -= 10;
  page.drawText("Summary by Withholding Ground", {
    x: margin,
    y: yPos,
    size: 12,
    font: boldFont,
    color: rgb(0, 0, 0),
  });
  yPos -= 20;

  // Group detections by ground
  const byGround = new Map<string, typeof acceptedDetections>();
  for (const det of acceptedDetections) {
    const groundId = det.appliedGround || det.suggestedGround || "unspecified";
    if (!byGround.has(groundId)) byGround.set(groundId, []);
    byGround.get(groundId)!.push(det);
  }

  for (const [groundId, dets] of byGround) {
    if (yPos < margin + 40) {
      page = pdfDoc.addPage([pageWidth, pageHeight]);
      yPos = pageHeight - margin;
    }

    const ground = getGroundById(groundId);
    const ref = ground ? ground.reference : groundId;
    const label = ground ? ground.label : "Unspecified";

    page.drawText(`${ref} — ${label}: ${dets.length} item(s)`, {
      x: margin + 10,
      y: yPos,
      size: 10,
      font: boldFont,
      color: rgb(0.2, 0.2, 0.2),
    });
    yPos -= 16;
  }

  // ----- Detail pages -----
  yPos -= 20;

  for (const [groundId, dets] of byGround) {
    // Section header
    if (yPos < margin + 60) {
      page = pdfDoc.addPage([pageWidth, pageHeight]);
      yPos = pageHeight - margin;
    }

    const ground = getGroundById(groundId);
    const ref = ground ? ground.reference : groundId;
    const label = ground ? ground.label : "Unspecified";

    page.drawLine({
      start: { x: margin, y: yPos },
      end: { x: pageWidth - margin, y: yPos },
      thickness: 0.5,
      color: rgb(0.7, 0.7, 0.7),
    });
    yPos -= 18;

    page.drawText(`${ref} — ${label}`, {
      x: margin,
      y: yPos,
      size: 13,
      font: boldFont,
      color: rgb(0.1, 0.1, 0.1),
    });
    yPos -= 12;

    if (ground?.description) {
      page.drawText(ground.description, {
        x: margin,
        y: yPos,
        size: 9,
        font,
        color: rgb(0.4, 0.4, 0.4),
      });
      yPos -= 18;
    } else {
      yPos -= 6;
    }

    // Table header
    page.drawText("Document", { x: margin, y: yPos, size: 8, font: boldFont, color: rgb(0.3, 0.3, 0.3) });
    page.drawText("Page", { x: margin + 250, y: yPos, size: 8, font: boldFont, color: rgb(0.3, 0.3, 0.3) });
    page.drawText("Type", { x: margin + 290, y: yPos, size: 8, font: boldFont, color: rgb(0.3, 0.3, 0.3) });
    page.drawText("Withheld Text", { x: margin + 360, y: yPos, size: 8, font: boldFont, color: rgb(0.3, 0.3, 0.3) });
    yPos -= 14;

    for (const det of dets) {
      if (yPos < margin + 30) {
        page = pdfDoc.addPage([pageWidth, pageHeight]);
        yPos = pageHeight - margin;
      }

      const docName = det.document.name.length > 35
        ? det.document.name.slice(0, 35) + "..."
        : det.document.name;
      const text = det.text.length > 30
        ? det.text.slice(0, 30) + "..."
        : det.text;

      page.drawText(docName, { x: margin, y: yPos, size: 8, font, color: rgb(0, 0, 0) });
      page.drawText(`p.${det.page}`, { x: margin + 250, y: yPos, size: 8, font, color: rgb(0.4, 0.4, 0.4) });
      page.drawText(det.type, { x: margin + 290, y: yPos, size: 8, font, color: rgb(0.4, 0.4, 0.4) });
      page.drawText(text, { x: margin + 360, y: yPos, size: 8, font, color: rgb(0.3, 0.3, 0.3) });
      yPos -= 12;

      if (includeReasoning && det.reasoning) {
        if (yPos < margin + 20) {
          page = pdfDoc.addPage([pageWidth, pageHeight]);
          yPos = pageHeight - margin;
        }
        const reasoningText = `Reasoning: ${det.reasoning.length > 100 ? det.reasoning.slice(0, 100) + "..." : det.reasoning}`;
        page.drawText(reasoningText, {
          x: margin + 10,
          y: yPos,
          size: 7,
          font,
          color: rgb(0.5, 0.5, 0.5),
        });
        yPos -= 12;
      }
    }

    yPos -= 10;
  }

  // Footer on last page
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
  const scheduleFooter = orgBranding.footerText || "Generated by Veil LGOIMA Disclosure Platform";
  page.drawText(scheduleFooter, {
    x: margin,
    y: yPos,
    size: 7,
    font,
    color: rgb(0.6, 0.6, 0.6),
  });

  pdfDoc.setTitle(`Withholding Schedule — ${caseData.reference}`);
  pdfDoc.setCreator("Veil LGOIMA Disclosure Platform");
  pdfDoc.setProducer(orgBranding.footerText || "Veil LGOIMA Disclosure Platform");

  const pdfBytes = await pdfDoc.save();

  return {
    pdfBytes,
    itemCount: acceptedDetections.length,
  };
}
