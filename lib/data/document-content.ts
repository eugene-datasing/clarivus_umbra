import { prisma } from "@/lib/db/prisma";
import type { DocParagraph } from "@/lib/db/mappers";
import { getSetting, SETTING_KEYS, type OrgIdentity, DEFAULT_ORG_IDENTITY } from "@/lib/data/settings";

export async function getDocumentContent(docId: string): Promise<DocParagraph[] | null> {
  const doc = await prisma.document.findUnique({
    where: { id: docId },
    select: { contentJson: true },
  });

  if (!doc?.contentJson) return null;
  return doc.contentJson as unknown as DocParagraph[];
}

/**
 * File type labels for the document header subtitle.
 */
const FILE_TYPE_LABELS: Record<string, string> = {
  pdf: "PDF Document",
  docx: "Word Document",
  xlsx: "Spreadsheet",
  pptx: "Presentation",
  eml: "Email",
  msg: "Email",
  pst: "Email Archive",
  txt: "Text Document",
  rtf: "Rich Text Document",
  html: "Web Document",
  csv: "Data File",
};

/**
 * Derive the document header from real metadata instead of hardcoding.
 * Uses the org identity from settings for the title, the document name
 * for the subtitle, and the document's last-modified date.
 */
export async function getDocumentHeader(
  docId: string,
): Promise<{ title: string; subtitle: string; date: string }> {
  const [doc, orgIdentity] = await Promise.all([
    prisma.document.findUnique({
      where: { id: docId },
      select: { name: true, fileType: true, updatedAt: true, createdAt: true },
    }),
    getSetting<OrgIdentity>(SETTING_KEYS.ORG_IDENTITY, DEFAULT_ORG_IDENTITY),
  ]);

  if (!doc) {
    return { title: "Document", subtitle: "", date: "" };
  }

  const title = orgIdentity.name || orgIdentity.abbreviation || "Document Review";

  // Use the document name without extension as the subtitle
  const nameWithoutExt = doc.name.replace(/\.[^.]+$/, "");
  const typeLabel = FILE_TYPE_LABELS[doc.fileType?.toLowerCase() ?? ""] ?? "Document";
  const subtitle = nameWithoutExt || typeLabel;

  // Format the date from the document record
  const dateObj = doc.updatedAt || doc.createdAt;
  const date = dateObj
    ? dateObj.toLocaleDateString("en-NZ", { day: "numeric", month: "long", year: "numeric" })
    : "";

  return { title, subtitle, date };
}
