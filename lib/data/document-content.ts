import { prisma } from "@/lib/db/prisma";
import type { DocParagraph } from "@/lib/db/mappers";

export async function getDocumentContent(docId: string): Promise<DocParagraph[] | null> {
  const doc = await prisma.document.findUnique({
    where: { id: docId },
    select: { contentJson: true },
  });

  if (!doc?.contentJson) return null;
  return doc.contentJson as unknown as DocParagraph[];
}

export const documentHeaders: Record<string, { title: string; subtitle: string; date: string }> = {
  "doc-001": { title: "District Council", subtitle: "Infrastructure Committee Report", date: "28 February 2026" },
  "doc-002": { title: "District Council", subtitle: "Finance & Infrastructure Division", date: "January 2026" },
  "doc-003": { title: "Email Thread", subtitle: "Internal Correspondence", date: "15 March 2026" },
  "doc-005": { title: "Engineering Consultants Ltd", subtitle: "Geotechnical Assessment", date: "March 2026" },
};
