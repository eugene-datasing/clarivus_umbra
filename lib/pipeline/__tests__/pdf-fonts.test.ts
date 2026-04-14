import { describe, it, expect } from "vitest";
import { existsSync } from "fs";
import { join } from "path";
import { PDFDocument } from "pdf-lib";
import { embedFonts } from "../pdf-fonts";

const FONT_DIR = join(process.cwd(), "assets", "fonts");

describe("pdf-fonts", () => {
  it("font files exist at expected paths", () => {
    expect(existsSync(join(FONT_DIR, "NotoSans-Regular.ttf"))).toBe(true);
    expect(existsSync(join(FONT_DIR, "NotoSans-Bold.ttf"))).toBe(true);
  });

  it("embedFonts returns regular, bold, and mono fonts", async () => {
    const pdfDoc = await PDFDocument.create();
    const fonts = await embedFonts(pdfDoc);
    expect(fonts.regular).toBeDefined();
    expect(fonts.bold).toBeDefined();
    expect(fonts.mono).toBeDefined();
  });

  it("can draw text with macronised vowels without throwing", async () => {
    const pdfDoc = await PDFDocument.create();
    const { regular, bold } = await embedFonts(pdfDoc);
    const page = pdfDoc.addPage([595, 842]);

    // This would throw "WinAnsi cannot encode" with StandardFonts.Helvetica
    expect(() => {
      page.drawText("Tūhoe Māori wāhi tapu ō Aotearoa", {
        x: 50,
        y: 700,
        size: 12,
        font: regular,
      });
    }).not.toThrow();

    expect(() => {
      page.drawText("Te Kaunihera-ā-Rohe o Ngāmotu", {
        x: 50,
        y: 680,
        size: 12,
        font: bold,
      });
    }).not.toThrow();

    // Verify the PDF can be serialized
    const bytes = await pdfDoc.save();
    expect(bytes.length).toBeGreaterThan(0);
  });
});
