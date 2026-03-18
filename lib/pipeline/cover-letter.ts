/**
 * Cover letter PDF generator for LGOIMA responses.
 */

import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { prisma } from "@/lib/db/prisma";

export async function buildCoverLetterPdf(
  caseId: string,
  options: { includeRightOfReview?: boolean } = {},
): Promise<Uint8Array> {
  const { includeRightOfReview = true } = options;

  const caseData = await prisma.case.findUniqueOrThrow({
    where: { id: caseId },
  });

  const acceptedCount = await prisma.detection.count({
    where: { document: { caseId }, status: "accepted" },
  });

  const documentCount = await prisma.document.count({
    where: { caseId, status: { in: ["ready", "in-review", "submitted", "complete"] } },
  });

  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const pageWidth = 595;
  const pageHeight = 842;
  const margin = 60;

  const page = pdfDoc.addPage([pageWidth, pageHeight]);
  let yPos = pageHeight - margin;

  // Council header
  page.drawText("NEW PLYMOUTH DISTRICT COUNCIL", {
    x: margin,
    y: yPos,
    size: 14,
    font: boldFont,
    color: rgb(0.2, 0.2, 0.4),
  });
  yPos -= 16;
  page.drawText("Te Kaunihera-a-Rohe o Ngamotu", {
    x: margin,
    y: yPos,
    size: 9,
    font,
    color: rgb(0.4, 0.4, 0.4),
  });

  yPos -= 40;

  // Date
  const today = new Date().toLocaleDateString("en-NZ", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  page.drawText(today, { x: margin, y: yPos, size: 10, font, color: rgb(0, 0, 0) });
  yPos -= 30;

  // Addressee
  page.drawText(caseData.requesterName, {
    x: margin,
    y: yPos,
    size: 10,
    font,
    color: rgb(0, 0, 0),
  });
  yPos -= 30;

  // Subject
  page.drawText(`Re: Request for Official Information — ${caseData.reference}`, {
    x: margin,
    y: yPos,
    size: 11,
    font: boldFont,
    color: rgb(0, 0, 0),
  });
  yPos -= 24;

  // Body paragraphs
  const paragraphs = [
    `Dear ${caseData.requesterName},`,
    "",
    "Thank you for your request under the Local Government Official Information and Meetings Act 1987 (LGOIMA).",
    "",
    `We have processed your request (reference: ${caseData.reference}) and are releasing the following documents to you:`,
    "",
    `• ${documentCount} document(s) have been reviewed`,
    `• ${acceptedCount} withholding(s) have been applied under the grounds specified in the attached withholding schedule`,
    "",
    "The attached withholding schedule details each withholding and the statutory ground under which information has been withheld.",
    "",
    "Please find the following documents enclosed:",
    "  1. Redacted documents",
    "  2. Withholding schedule",
  ];

  if (includeRightOfReview) {
    paragraphs.push(
      "",
      "Right of Review",
      "",
      "If you are not satisfied with this response, you have the right to make a complaint to the Ombudsman under section 27(3) of LGOIMA. You can contact the Ombudsman at:",
      "",
      "  Office of the Ombudsman",
      "  PO Box 10152",
      "  Wellington 6143",
      "  Phone: 0800 802 602",
      "  Email: info@ombudsman.parliament.nz",
    );
  }

  paragraphs.push(
    "",
    "Yours sincerely,",
    "",
    "",
    "________________________________________",
    "Information and Privacy Officer",
    "New Plymouth District Council",
  );

  for (const para of paragraphs) {
    if (yPos < margin + 20) {
      break; // Should not happen for a cover letter
    }
    page.drawText(para, {
      x: margin,
      y: yPos,
      size: 10,
      font: para === `Dear ${caseData.requesterName},` || para === "Right of Review" ? boldFont : font,
      color: rgb(0, 0, 0),
    });
    yPos -= para === "" ? 8 : 14;
  }

  pdfDoc.setTitle(`Cover Letter — ${caseData.reference}`);
  pdfDoc.setCreator("Veil LGOIMA Disclosure Platform");
  pdfDoc.setProducer("Veil by DataSing");

  return pdfDoc.save();
}
