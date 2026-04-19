/**
 * Generate a synthetic 20-25 page DOCX fixture for the Phase 2
 * latency spike.
 *
 * Lives at: test-fixtures/large-docx-fixture.docx
 *
 * Content design:
 *   - Mixed structure per page: headings (H1, H2), paragraphs, tables,
 *     bulleted and numbered lists.
 *   - NZ PII strings sprinkled throughout: IRD (123-456-789), NHI
 *     (JKA1234), mobile (021 555 1234), landline ((06) 759 3400),
 *     address (42 Whiteman Street, Awatere 4310), bank account
 *     (12-3456-7890123-00), driver licence (EA123456).
 *   - Te reo Māori: Ngāti Rangitāne, wāhi tapu, kaitiakitanga, tāngata
 *     whenua — exercises macron rendering through LibreOffice.
 *   - Per-page variety via a deterministic section pattern (5 section
 *     types cycled, each targeting ~1 page of content).
 *
 * Idempotency guards:
 *   - Fixed creator / title / description / keywords.
 *   - Zero Math.random() — all content is literal or index-derived.
 *   - Two-phase pack: docx → JSZip (for content layout) → yazl (for the
 *     final zip container). JSZip alone is NOT byte-reproducible — its
 *     container bytes (central directory, "extra fields", timestamp
 *     precision) vary across runs even when per-file content is
 *     identical. yazl gives explicit control over every zip entry.
 *
 * Byte-reproducible DOCX output: uses yazl for deterministic zip
 * container bytes. JSZip alone does not guarantee byte-identical output
 * across runs. Do not reintroduce JSZip for the final pack step.
 *
 * Usage:
 *   npx tsx scripts/generate-large-docx.ts
 *
 * The script writes the fixture and prints a sha256 for the caller to
 * double-check determinism across runs.
 */
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  PageBreak,
  AlignmentType,
} from "docx";
import JSZip from "jszip";
import yazl from "yazl";
import fs from "fs";
import path from "path";
import { createHash } from "crypto";

const OUTPUT = path.resolve(
  __dirname,
  "../test-fixtures/large-docx-fixture.docx",
);

const FIXED_DATE = new Date("2026-04-01T00:00:00.000Z");

const PII = {
  ird: "123-456-789",
  nhi: "JKA1234",
  mobile: "021 555 1234",
  landline: "(06) 759 3400",
  address: "42 Whiteman Street, Awatere 4310",
  bank: "12-3456-7890123-00",
  driverLicence: "EA123456",
  email: "maia.rangi@example.nz",
};

const MAORI_TERMS = [
  "Ngāti Rangitāne",
  "wāhi tapu",
  "kaitiakitanga",
  "tāngata whenua",
  "Te Tiriti o Waitangi",
  "rūnanga",
  "mātauranga Māori",
];

// --- Content builders --------------------------------------------------

function paragraph(text: string): Paragraph {
  return new Paragraph({ children: [new TextRun(text)] });
}

function heading(text: string, level: (typeof HeadingLevel)[keyof typeof HeadingLevel]): Paragraph {
  return new Paragraph({ text, heading: level });
}

function bulletedItem(text: string): Paragraph {
  return new Paragraph({ text, bullet: { level: 0 } });
}

function numberedItem(text: string, ref: string, num: number): Paragraph {
  return new Paragraph({ text, numbering: { reference: ref, level: 0, instance: num } });
}

function table(headerCells: string[], rows: string[][]): Table {
  const headerRow = new TableRow({
    children: headerCells.map(
      (h) =>
        new TableCell({
          children: [new Paragraph({ children: [new TextRun({ text: h, bold: true })] })],
        }),
    ),
  });
  const bodyRows = rows.map(
    (row) =>
      new TableRow({
        children: row.map(
          (cell) => new TableCell({ children: [new Paragraph(cell)] }),
        ),
      }),
  );
  return new Table({
    rows: [headerRow, ...bodyRows],
    width: { size: 100, type: WidthType.PERCENTAGE },
  });
}

// --- Section builders: five variants, cycled by page index ------------

function sectionIntro(pageIdx: number): (Paragraph | Table)[] {
  const maoriTerm = MAORI_TERMS[pageIdx % MAORI_TERMS.length];
  return [
    heading(`Section ${pageIdx + 1}: Policy context and statutory framing`, HeadingLevel.HEADING_1),
    paragraph(
      `This section records the policy context for LGOIMA request LGOIMA-2026-${String(14 + pageIdx).padStart(3, "0")}. ` +
        `The request was lodged by a member of ${maoriTerm} on 15 March 2026 and relates to ` +
        `infrastructure consent decisions made by the Awatere District Council between ` +
        `January and December 2025.`,
    ),
    paragraph(
      `Primary respondent: the council's Infrastructure General Manager. Secondary respondents include ` +
        `the Policy Advisor, Legal & Governance, and the RMA Consents Lead. The primary contact ` +
        `for follow-up is ${PII.email} with a direct line of ${PII.landline}.`,
    ),
    heading("1.1 Relevant statutory provisions", HeadingLevel.HEADING_2),
    paragraph(
      `Local Government Official Information and Meetings Act 1987, sections 6, 7, and 17. ` +
        `Resource Management Act 1991, sections 6(e) and 7(a). Privacy Act 2020, principle 11 ` +
        `(personal information disclosure). Public Records Act 2005, retention obligations.`,
    ),
    new Paragraph({ children: [new PageBreak()] }),
  ];
}

function sectionDetail(pageIdx: number): (Paragraph | Table)[] {
  return [
    heading(`Section ${pageIdx + 1}: Requester contact details and identity verification`, HeadingLevel.HEADING_1),
    paragraph(
      `The requester provided the following contact information at intake (recorded by the ` +
        `Request Manager on 15 March 2026; verified against the council's electoral roll on 18 March 2026):`,
    ),
    table(
      ["Field", "Value"],
      [
        ["Full name", "Maia Rangi"],
        ["Address", PII.address],
        ["Mobile", PII.mobile],
        ["Landline", PII.landline],
        ["Email", PII.email],
        ["IRD number", PII.ird],
        ["NHI", PII.nhi],
        ["Bank account (for cost recovery)", PII.bank],
        ["Driver licence (identity check)", PII.driverLicence],
      ],
    ),
    paragraph(
      `The above information is personal information under section 7(2)(a) and will be redacted ` +
        `from any response released to third parties under LGOIMA. Staff handling this request must ` +
        `not circulate unredacted copies outside the review team.`,
    ),
    new Paragraph({ children: [new PageBreak()] }),
  ];
}

function sectionAnalysis(pageIdx: number): (Paragraph | Table)[] {
  const maori = MAORI_TERMS[pageIdx % MAORI_TERMS.length];
  return [
    heading(`Section ${pageIdx + 1}: Officer analysis and free-and-frank commentary`, HeadingLevel.HEADING_1),
    paragraph(
      `The following commentary is provided in candour by the responsible officer and is intended ` +
        `only for internal deliberation. In our honest assessment, the councillors who led the 2024 ` +
        `infrastructure review did not adequately consider ${maori} obligations arising from the ` +
        `council's duty of kaitiakitanga over the affected land.`,
    ),
    paragraph(
      `This commentary falls squarely within s7(2)(f)(i) LGOIMA — free and frank expression of ` +
        `opinions by officers, to be withheld to maintain the effective conduct of public affairs. ` +
        `Releasing it would chill future officer advice and should be withheld on that ground alone.`,
    ),
    heading("3.1 Supporting observations", HeadingLevel.HEADING_2),
    bulletedItem(`Councillor A's support for the proposal appeared motivated by factors unrelated to the merits.`),
    bulletedItem(`Councillor B's opposition relied on information not in the agenda pack.`),
    bulletedItem(`The CEO's summary to council omitted legal advice from Holroyd Partners dated 12 November 2024.`),
    bulletedItem(`A second opinion was sought from external counsel; that advice is separately withheld under s7(2)(g).`),
    new Paragraph({ children: [new PageBreak()] }),
  ];
}

function sectionCommercial(pageIdx: number): (Paragraph | Table)[] {
  return [
    heading(`Section ${pageIdx + 1}: Commercial information and tender details`, HeadingLevel.HEADING_1),
    paragraph(
      `The following tender information was provided in confidence by the three shortlisted bidders ` +
        `under the 2025 Infrastructure Consent procurement. Release would disclose bidder pricing ` +
        `strategy and commercial position — s7(2)(b)(ii) applies.`,
    ),
    table(
      ["Bidder", "Total price (NZD)", "Indicative margin", "NZBN"],
      [
        ["Northstar Consulting Ltd", "$1,248,500", "14.2%", "9429041876342"],
        ["Greenscape Infrastructure", "$1,092,750", "11.8%", "9429038261115"],
        ["Holroyd Partners (subcontractor)", "$942,300", "9.4%", "9429043882104"],
      ],
    ),
    paragraph(
      `The council's walk-away position for the final round of negotiations was NZD 1,050,000 — ` +
        `this figure is subject to s7(2)(i) (negotiations) and must be withheld while the procurement ` +
        `remains live. Bank account for successful bidder payments is ${PII.bank}.`,
    ),
    new Paragraph({ children: [new PageBreak()] }),
  ];
}

function sectionProcedural(pageIdx: number): (Paragraph | Table)[] {
  return [
    heading(`Section ${pageIdx + 1}: Procedural history and correspondence`, HeadingLevel.HEADING_1),
    paragraph(
      `The request has moved through the following procedural milestones. Dates and responsible ` +
        `officers are recorded below for the audit trail.`,
    ),
    numberedItem("15 Mar 2026: Request received at council reception, logged by Request Manager.", "history", pageIdx),
    numberedItem("18 Mar 2026: Identity verified; requester contacted at " + PII.email + ".", "history", pageIdx),
    numberedItem("22 Mar 2026: Case opened in Veil; documents ingested.", "history", pageIdx),
    numberedItem("29 Mar 2026: Initial review completed by Reviewer A.", "history", pageIdx),
    numberedItem("04 Apr 2026: Senior review completed by Reviewer B.", "history", pageIdx),
    numberedItem("11 Apr 2026: Final approval by Request Manager.", "history", pageIdx),
    numberedItem("15 Apr 2026: Response package prepared for release.", "history", pageIdx),
    paragraph(
      `Related correspondence IRD cross-reference: ${PII.ird}. Driver-licence check: ${PII.driverLicence}. ` +
        `NHI on medical evidence submitted by the requester: ${PII.nhi}.`,
    ),
    new Paragraph({ children: [new PageBreak()] }),
  ];
}

const SECTION_BUILDERS = [
  sectionIntro,
  sectionDetail,
  sectionAnalysis,
  sectionCommercial,
  sectionProcedural,
];

// --- Document assembly ------------------------------------------------

async function generate(): Promise<Buffer> {
  const SECTION_COUNT = 22; // target 22 sections → ≥20 pages post LibreOffice
  const children: (Paragraph | Table)[] = [];

  // Title page
  children.push(
    new Paragraph({
      children: [
        new TextRun({ text: "LGOIMA Disclosure Package — Synthetic Test Fixture", bold: true, size: 36 }),
      ],
      alignment: AlignmentType.CENTER,
    }),
    paragraph(""),
    paragraph(""),
    new Paragraph({
      children: [new TextRun({ text: "Case reference: LGOIMA-2026-LARGE-FIXTURE", italics: true })],
      alignment: AlignmentType.CENTER,
    }),
    new Paragraph({ children: [new PageBreak()] }),
  );

  for (let i = 0; i < SECTION_COUNT; i++) {
    const builder = SECTION_BUILDERS[i % SECTION_BUILDERS.length];
    children.push(...builder(i));
  }

  const doc = new Document({
    creator: "Veil Test Fixture Generator",
    title: "LGOIMA Disclosure Package — Synthetic Test Fixture",
    description: "Deterministic 20+ page DOCX for Phase 2 latency spike",
    keywords: "veil lgoima test fixture",
    lastModifiedBy: "Veil Test Fixture Generator",
    revision: 1,
    subject: "Phase 2 spike fixture",
    numbering: {
      config: [
        {
          reference: "history",
          levels: [
            {
              level: 0,
              format: "decimal" as const,
              text: "%1.",
              alignment: AlignmentType.START,
            },
          ],
        },
      ],
    },
    sections: [{ children }],
  });

  return await packDeterministically(doc);
}

/**
 * Pack a docx Document, then post-process the zip so
 *   (a) docProps/core.xml's <dcterms:created> and <dcterms:modified>
 *       are pinned to FIXED_DATE (docx v9's public API does not expose
 *       overrides for these), and
 *   (b) every zip entry's mtime is set to FIXED_DATE (JSZip otherwise
 *       stamps entries with `new Date()` at generation time).
 *
 * Attempting to swap global Date before/after Packer.toBuffer did not
 * work — docx/JSZip capture Date at module-load time via closure, so a
 * runtime reassignment is invisible to the captured reference. Taking
 * the post-process path instead, which is fully deterministic.
 */
async function packDeterministically(doc: Document): Promise<Buffer> {
  // Phase 1 (via docx / JSZip): lay out the DOCX content. JSZip does
  // this well; we just don't trust its container output.
  const firstPass = await Packer.toBuffer(doc);
  const sourceZip = await JSZip.loadAsync(firstPass);

  // Read every entry out of the source zip (non-deterministic iteration
  // order), pin core.xml's timestamps, then sort entries by path.
  type Entry = { path: string; data: Buffer };
  const entries: Entry[] = [];
  for (const fileName of Object.keys(sourceZip.files)) {
    const f = sourceZip.files[fileName];
    if (f.dir) continue;
    let data = await f.async("nodebuffer");
    if (fileName === "docProps/core.xml") {
      const asText = data.toString("utf-8");
      const pinned = asText
        .replace(
          /<dcterms:created xsi:type="dcterms:W3CDTF">[^<]+<\/dcterms:created>/,
          `<dcterms:created xsi:type="dcterms:W3CDTF">${FIXED_DATE.toISOString()}</dcterms:created>`,
        )
        .replace(
          /<dcterms:modified xsi:type="dcterms:W3CDTF">[^<]+<\/dcterms:modified>/,
          `<dcterms:modified xsi:type="dcterms:W3CDTF">${FIXED_DATE.toISOString()}</dcterms:modified>`,
        );
      data = Buffer.from(pinned, "utf-8");
    }
    entries.push({ path: fileName, data });
  }
  entries.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  // Phase 2 (via yazl): pack the sorted entries with explicit mtime.
  // yazl is designed for deterministic output and exposes every knob
  // that JSZip hides.
  return new Promise((resolve, reject) => {
    const zipfile = new yazl.ZipFile();
    for (const { path: p, data } of entries) {
      zipfile.addBuffer(data, p, { mtime: FIXED_DATE, compress: true });
    }
    const chunks: Buffer[] = [];
    zipfile.outputStream.on("data", (chunk: Buffer) => chunks.push(chunk));
    zipfile.outputStream.on("end", () => resolve(Buffer.concat(chunks)));
    zipfile.outputStream.on("error", reject);
    zipfile.end();
  });
}

async function main() {
  const buffer = await generate();
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, buffer);
  const sha = createHash("sha256").update(buffer).digest("hex");
  console.log(`wrote ${OUTPUT}`);
  console.log(`  size  ${buffer.length} bytes`);
  console.log(`  sha256 ${sha}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
