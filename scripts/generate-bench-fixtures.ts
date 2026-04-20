/**
 * Generate the governance-pathway (A) and commercial-pathway (C1)
 * benchmark fixtures at `test-fixtures/bench/`.
 *
 * Both documents are synthetic NZ-flavoured council content designed to
 * exercise specific detection pathways end-to-end. B1 (HR investigation)
 * lives elsewhere and is Eugene-authored; B3 (long multi-page entity
 * propagation) is queued for tranche 2a-ii.
 *
 * Byte-reproducibility: docx → JSZip → yazl two-phase pack, mirroring
 * the pattern in `scripts/generate-docx-fixture.ts`. Zero `Math.random()`,
 * no Date.now(); core.xml timestamps pinned to FIXED_DATE; per-entry
 * mtimes pinned on the yazl pack step. Confirmed byte-identical across
 * runs.
 *
 * Usage:
 *   npx tsx scripts/generate-bench-fixtures.ts
 *
 * Writes:
 *   test-fixtures/bench/A_Council_Memo_Candid_Advice.docx
 *   test-fixtures/bench/C1_Tender_Evaluation_Commercial.docx
 * and prints byte count + sha256 per file.
 */
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
} from "docx";
import JSZip from "jszip";
import yazl from "yazl";
import fs from "fs";
import path from "path";
import { createHash } from "crypto";

const FIXED_DATE = new Date("2026-04-20T00:00:00.000Z");
const OUTPUT_DIR = "test-fixtures/bench";

// ---------------------------------------------------------------------------
// Small paragraph helpers (match the style of generate-docx-fixture.ts)
// ---------------------------------------------------------------------------

function p(text: string): Paragraph {
  return new Paragraph({ children: [new TextRun(text)] });
}

function pBold(text: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, bold: true })],
  });
}

function heading(text: string, level: (typeof HeadingLevel)[keyof typeof HeadingLevel]): Paragraph {
  return new Paragraph({ text, heading: level });
}

function blank(): Paragraph {
  return new Paragraph({ children: [new TextRun("")] });
}

// ---------------------------------------------------------------------------
// Fixture A — governance pathway (candid advice + legal privilege +
// confidential informant). Plausible council-to-CEO memo on a live
// bylaw-review issue.
// ---------------------------------------------------------------------------

function buildACouncilMemo(): Document {
  const children: Paragraph[] = [
    new Paragraph({
      children: [
        new TextRun({ text: "AWATERE DISTRICT COUNCIL", bold: true, size: 28 }),
      ],
      alignment: AlignmentType.CENTER,
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: "MEMORANDUM — IN CONFIDENCE",
          bold: true,
          size: 24,
        }),
      ],
      alignment: AlignmentType.CENTER,
    }),
    blank(),
    p("To:        Chief Executive"),
    p("From:      Aroha Taiwera, Group Manager — Regulatory Services"),
    p("Date:      12 March 2026"),
    p("Subject:   Kowhai Precinct dog-control bylaw — staff advice"),
    p("File ref:  REG-BYLAW-2026-007"),
    blank(),
    heading("Background", HeadingLevel.HEADING_2),
    p(
      "Council resolved on 4 March 2026 to review the Kowhai Precinct dog-control bylaw following sustained community feedback, including a petition of 347 signatures coordinated by Mrs Judith Patterson (jpatterson.kowhai@example.nz, 027 445 1982). The review falls within Regulatory Services' work programme for Q2 and is expected to conclude by 30 June 2026.",
    ),
    p(
      "Mrs Patterson also provided a written submission (ref SUB-2026-184) and requested a confidential briefing with Council officers, which took place on 8 March 2026.",
    ),
    blank(),
    heading(
      "Free and frank staff advice — s7(2)(f)",
      HeadingLevel.HEADING_2,
    ),
    p(
      "Council officers are asked to provide a frank assessment of the current bylaw's workability before committee is briefed. Our considered view, expressed candidly: the current 100-metre leash-on requirement across the Kowhai Precinct is unenforceable in practice. Animal Management have issued four infringement notices in the past eighteen months; none have been sustained on review.",
    ),
    p(
      "Elected members have been told by officers that \u201Cenforcement is robust\u201D, and that characterisation is at best generous. The reality on the ground is that Animal Management lacks the staffing and the legal teeth to pursue off-leash infringements in a residential precinct. We recommend the committee be briefed on the enforcement reality rather than the bylaw's aspirational text, and that members be invited to consider whether maintaining an unenforceable rule damages council's credibility more than a principled relaxation would.",
    ),
    p(
      "Officers further note, frankly, that several elected members have publicly defended the 100-metre rule for reasons that appear political rather than operational. A quiet walk-back is preferable to a public debate that forces officers to contradict the elected record.",
    ),
    blank(),
    heading(
      "Privileged legal advice — s7(2)(g)",
      HeadingLevel.HEADING_2,
    ),
    p(
      "We have obtained privileged legal opinion from Jennifer McAllister of Rata Legal regarding council's exposure if the bylaw is challenged under the Bill of Rights Act. Ms McAllister's advice, which is attached as Appendix B and which remains subject to solicitor-client privilege, is that the 100-metre leash provision is likely to be found disproportionate in any judicial review and that officers should not defend the provision in formal proceedings without revised instructions.",
    ),
    p(
      "Counsel's advice further canvasses the settlement range should the matter reach costs negotiation: $25,000 to $55,000 inclusive of legal costs is defensible on current authorities. Ms McAllister recommends an early without-prejudice approach to the petitioners' counsel if litigation looks likely.",
    ),
    p(
      "This advice is privileged and must not be released under LGOIMA without express waiver from the Chief Executive in consultation with the Mayor.",
    ),
    blank(),
    heading(
      "Confidential account — s7(2)(c)(i)",
      HeadingLevel.HEADING_2,
    ),
    p(
      "A former Animal Management officer has provided a written account on condition of anonymity, indicating that enforcement practices in the Kowhai Precinct between 2022 and 2024 systematically favoured specific property owners known to the previous Area Manager. The account alleges selective non-enforcement of off-leash complaints where the offending dog's owner was a member of the local residents' association.",
    ),
    p(
      "The former officer has asked that their identity not be disclosed due to professional retaliation concerns; their written account is held in the HR investigation file HR-INV-2025-042. A summary without identifying details is available on request but the full account must be protected under s7(2)(c)(i) to preserve future supply of similar submissions from other ex-officers.",
    ),
    blank(),
    heading("Recommendation", HeadingLevel.HEADING_2),
    p(
      "Officers recommend: (1) Council accepts the enforcement reality and reviews the 100-metre provision toward a 20-metre or similar enforceable range; (2) the privileged legal opinion inform committee discussion but not be released under LGOIMA; (3) the HR-INV-2025-042 account be held in confidence and referenced in the officer briefing only in summary form.",
    ),
    blank(),
    p("Signed:    Aroha Taiwera"),
    p("           Group Manager — Regulatory Services"),
    blank(),
    p("cc:        Group Manager — Legal & Governance"),
    p("           Mayor (verbal briefing scheduled 14 March 2026)"),
  ];

  return new Document({
    creator: "Veil Bench Fixture Generator",
    title: "A_Council_Memo_Candid_Advice",
    description: "Synthetic governance-pathway benchmark fixture",
    keywords: "veil bench fixture governance free-frank legal-privilege",
    lastModifiedBy: "Veil Bench Fixture Generator",
    revision: 1,
    subject: "Detection-coverage benchmark — governance pathway",
    sections: [{ children }],
  });
}

// ---------------------------------------------------------------------------
// Fixture C1 — commercial pathway (third-party bid pricing under
// confidentiality + trade-secret-adjacent content + council-commercial
// strategic position + negotiation BATNA + tikanga reference).
// Plausible tender-evaluation panel memo.
// ---------------------------------------------------------------------------

function buildC1TenderEvaluation(): Document {
  const children: Paragraph[] = [
    new Paragraph({
      children: [
        new TextRun({ text: "AWATERE DISTRICT COUNCIL", bold: true, size: 28 }),
      ],
      alignment: AlignmentType.CENTER,
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: "TENDER EVALUATION PANEL — COMMERCIAL IN CONFIDENCE",
          bold: true,
          size: 22,
        }),
      ],
      alignment: AlignmentType.CENTER,
    }),
    blank(),
    p("Subject:   Water infrastructure maintenance contract WI-MAINT-2026-004"),
    p("Date:      18 March 2026"),
    p(
      "Panel:     Hemi Rangi (chair, Group Manager Assets), Priya Kumar (Procurement Lead), Catherine Ohiro (Legal Counsel — Commercial)",
    ),
    p("Close:     5 March 2026, 3 bids received"),
    blank(),
    heading("Executive summary", HeadingLevel.HEADING_2),
    p(
      "Three tenders were received for the Kaimai trunkmain inspection and maintenance contract over a four-year term. This memo summarises the bid evaluations and recommends a preferred supplier, subject to referee checks and contract finalisation.",
    ),
    blank(),
    heading("Bid summary — commercial in confidence", HeadingLevel.HEADING_2),
    p(
      "Bidder A (Kaitiaki Engineering Ltd): lump sum $3.42M over four years, includes $180k contingency for emergency response and a 12% margin on installation. Kaitiaki have provided this pricing on condition of confidentiality, and specifically requested that the margin structure not be disclosed to other bidders in the event of a re-tender.",
    ),
    p(
      "Bidder B (Pacific Flowline Services): lump sum $3.78M over four years, lean margin (8%), no contingency \u2014 Pacific intend to rely on council's existing emergency contract. Their commercial terms were provided in writing under a confidentiality undertaking dated 28 February 2026.",
    ),
    p(
      "Bidder C (Southern Infrastructure Group): lump sum $4.15M over four years, bundled with optional upgrades. SIG's pricing includes a proprietary acoustic leak-detection methodology which they have flagged as a trade secret and have requested we not share technical specifics with competitor bidders or publish in any disclosure response.",
    ),
    blank(),
    heading("Technical evaluation", HeadingLevel.HEADING_2),
    p(
      "All three bids met the non-price criteria. Kaitiaki's proposal included a novel dual-stage pipeline inspection process \u2014 combining ground-penetrating radar with low-frequency acoustic monitoring \u2014 which their technical appendix identifies as proprietary and developed in-house over four years. The combination of these two methods, and the specific operating thresholds, are represented as trade secrets under their commercial-in-confidence submission.",
    ),
    p(
      "SIG's acoustic leak-detection methodology relies on a proprietary signal-processing pipeline with vendor-specific calibration thresholds. SIG have disclosed the methodology exists but withheld technical operating parameters under trade-secret protection.",
    ),
    blank(),
    heading("Council commercial position", HeadingLevel.HEADING_2),
    p(
      "Council's preferred bidder rank is Kaitiaki Engineering, contingent on successful referee checks and commercial terms. Our fallback position in negotiation is to move to Pacific Flowline at the $3.78M price point; we have budgetary authority to $4.1M and should not disclose this ceiling during negotiations. If Kaitiaki's referee checks surface concerns and we need to pivot, we would be well-placed to negotiate Pacific down from their listed price given their stated margin position.",
    ),
    p(
      "The panel's BATNA assessment: if no preferred supplier emerges from referee checks, council's next-best alternative is to extend the existing interim maintenance arrangement with the in-house Assets team for a further twelve months at an estimated internal cost of $1.1M per year. This should not be signalled externally as it would weaken our negotiating hand with the commercial bidders.",
    ),
    blank(),
    heading(
      "Iwi and cultural considerations",
      HeadingLevel.HEADING_2,
    ),
    p(
      "The trunkmain corridor traverses land adjacent to known w\u0101hi tapu identified by Ng\u0101ti Awatere in their cultural impact assessment dated November 2022. The successful bidder will be required to engage with iwi liaison prior to groundworks, and the k\u014Diwi tangata protocol attached as Appendix D must be observed for any excavation within the protected zone.",
    ),
    blank(),
    heading("Recommendation", HeadingLevel.HEADING_2),
    p(
      "Panel recommends: (1) Award Kaitiaki Engineering Ltd contingent on referee checks and final negotiation of inspection KPIs; (2) Advise unsuccessful bidders of decision outcomes without disclosure of competing bid pricing; (3) Hold Bidder B and Bidder C's commercial terms in confidence for the duration of any re-tender process.",
    ),
    blank(),
    p("Submitted by:  Priya Kumar, Procurement Lead"),
    p("Reviewed by:   Catherine Ohiro, Legal Counsel \u2014 Commercial"),
  ];

  return new Document({
    creator: "Veil Bench Fixture Generator",
    title: "C1_Tender_Evaluation_Commercial",
    description: "Synthetic commercial-pathway benchmark fixture",
    keywords: "veil bench fixture commercial trade-secret negotiation",
    lastModifiedBy: "Veil Bench Fixture Generator",
    revision: 1,
    subject: "Detection-coverage benchmark — commercial pathway",
    sections: [{ children }],
  });
}

// ---------------------------------------------------------------------------
// Deterministic pack (mirrors scripts/generate-docx-fixture.ts)
// ---------------------------------------------------------------------------

async function packDeterministically(doc: Document): Promise<Buffer> {
  const firstPass = await Packer.toBuffer(doc);
  const sourceZip = await JSZip.loadAsync(firstPass);

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

async function writeFixture(name: string, doc: Document): Promise<void> {
  const buffer = await packDeterministically(doc);
  const outputPath = path.resolve(__dirname, "..", OUTPUT_DIR, name);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, buffer);
  const sha = createHash("sha256").update(buffer).digest("hex");
  console.log(`wrote ${outputPath}`);
  console.log(`  size   ${buffer.length} bytes`);
  console.log(`  sha256 ${sha}`);
}

async function main(): Promise<void> {
  await writeFixture(
    "A_Council_Memo_Candid_Advice.docx",
    buildACouncilMemo(),
  );
  await writeFixture(
    "C1_Tender_Evaluation_Commercial.docx",
    buildC1TenderEvaluation(),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
