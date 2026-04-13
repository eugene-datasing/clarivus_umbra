/**
 * Cover letter PDF generator for LGOIMA responses.
 */

import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { prisma } from "@/lib/db/prisma";
import { getOrgIdentity, getOrgSignatory, getOrgOmbudsman } from "@/lib/data/org-config";
import { embedOrgLogo } from "./logo-helper";

export async function buildCoverLetterPdf(
  caseId: string,
  options: { includeRightOfReview?: boolean; documentIds?: string[] } = {},
): Promise<Uint8Array> {
  const { includeRightOfReview = true, documentIds } = options;

  const caseData = await prisma.case.findUniqueOrThrow({
    where: { id: caseId },
  });

  // Scope counts to selected documents if provided
  const detectionFilter = documentIds
    ? { documentId: { in: documentIds }, status: "accepted" as const }
    : { document: { caseId }, status: "accepted" as const };
  const documentFilter = documentIds
    ? { id: { in: documentIds } }
    : { caseId, status: { in: ["signed-off", "reviewed"] } };

  const acceptedCount = await prisma.detection.count({
    where: detectionFilter,
  });

  const documentCount = await prisma.document.count({
    where: documentFilter,
  });

  // Fetch org config
  const [orgIdentity, orgSignatory, orgOmbudsman] = await Promise.all([
    getOrgIdentity(),
    getOrgSignatory(),
    getOrgOmbudsman(),
  ]);

  const orgName = orgIdentity.name || "NEW PLYMOUTH DISTRICT COUNCIL";
  const orgMaoriName = orgIdentity.maoriName || "Te Kaunihera-a-Rohe o Ngamotu";

  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const pageWidth = 595;
  const pageHeight = 842;
  const margin = 60;

  const page = pdfDoc.addPage([pageWidth, pageHeight]);
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

  // Council header
  page.drawText(orgName.toUpperCase(), {
    x: margin,
    y: yPos,
    size: 14,
    font: boldFont,
    color: rgb(0.2, 0.2, 0.4),
  });
  yPos -= 16;
  if (orgMaoriName) {
    page.drawText(orgMaoriName, {
      x: margin,
      y: yPos,
      size: 9,
      font,
      color: rgb(0.4, 0.4, 0.4),
    });
  }

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
      `  ${orgOmbudsman.line1}`,
      `  ${orgOmbudsman.line2}`,
      `  ${orgOmbudsman.city}`,
      `  Phone: ${orgOmbudsman.phone}`,
      `  Email: ${orgOmbudsman.email}`,
    );
  }

  paragraphs.push(
    "",
    "Yours sincerely,",
    "",
    "",
    "________________________________________",
    orgSignatory.name || orgSignatory.title || "Information and Privacy Officer",
    orgSignatory.department || orgName,
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
