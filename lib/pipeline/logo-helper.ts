/**
 * Shared helper to embed the organisation logo in pdf-lib documents.
 */

import type { PDFDocument, PDFImage } from "pdf-lib";
import { getOrgBranding } from "@/lib/data/org-config";
import { getStorage } from "@/lib/storage";

export interface EmbeddedLogo {
  image: PDFImage;
  width: number;
  height: number;
}

const MAX_LOGO_HEIGHT = 40;

/**
 * Load and embed the org logo into a PDFDocument.
 * Returns null if no logo is configured.
 */
export async function embedOrgLogo(
  pdfDoc: PDFDocument,
): Promise<EmbeddedLogo | null> {
  const branding = await getOrgBranding();
  if (!branding.logoStorageKey) return null;

  const storage = getStorage();
  const exists = await storage.exists(branding.logoStorageKey);
  if (!exists) return null;

  const data = await storage.download(branding.logoStorageKey);
  const ext = branding.logoStorageKey.split(".").pop()?.toLowerCase();

  let image: PDFImage;
  if (ext === "png") {
    image = await pdfDoc.embedPng(data);
  } else {
    image = await pdfDoc.embedJpg(data);
  }

  // Scale to max height while preserving aspect ratio
  const scale = MAX_LOGO_HEIGHT / image.height;
  const width = image.width * scale;
  const height = MAX_LOGO_HEIGHT;

  return { image, width, height };
}
