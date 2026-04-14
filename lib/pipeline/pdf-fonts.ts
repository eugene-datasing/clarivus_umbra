/**
 * Shared font loader for PDF generation.
 *
 * Embeds Noto Sans (Regular + Bold) with subset: true for Unicode support
 * including te reo Māori macrons (ā, ē, ī, ō, ū).
 *
 * Also provides Courier (monospace) for hash digests and timestamps which
 * are pure ASCII and benefit from fixed-width rendering.
 *
 * Replaces the previous StandardFonts.Helvetica approach which was limited
 * to WinAnsi encoding and could not encode macronised vowels.
 */

import { StandardFonts, type PDFDocument, type PDFFont } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { readFile } from "fs/promises";
import { join } from "path";

export interface EmbeddedFonts {
  regular: PDFFont;
  bold: PDFFont;
  mono: PDFFont;
}

/**
 * Embed Noto Sans Regular + Bold + Courier into a PDFDocument.
 * Uses subset embedding for Noto Sans to keep file size small.
 * Courier is a built-in PDF font used only for ASCII content (hashes, IDs).
 *
 * Usage:
 *   const { regular: font, bold: boldFont, mono: monoFont } = await embedFonts(pdfDoc);
 */
export async function embedFonts(pdfDoc: PDFDocument): Promise<EmbeddedFonts> {
  pdfDoc.registerFontkit(fontkit);
  const fontDir = join(process.cwd(), "assets", "fonts");
  const [regularBytes, boldBytes] = await Promise.all([
    readFile(join(fontDir, "NotoSans-Regular.ttf")),
    readFile(join(fontDir, "NotoSans-Bold.ttf")),
  ]);
  const [regular, bold, mono] = await Promise.all([
    pdfDoc.embedFont(regularBytes, { subset: true }),
    pdfDoc.embedFont(boldBytes, { subset: true }),
    pdfDoc.embedFont(StandardFonts.Courier),
  ]);
  return { regular, bold, mono };
}
