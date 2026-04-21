/**
 * Generate the governance-pathway (A), commercial-pathway (C1), and
 * long-investigation (B3) benchmark fixtures at `test-fixtures/bench/`.
 *
 * A and C1 are synthetic NZ-flavoured council content designed to
 * exercise specific detection pathways end-to-end. B1 (HR investigation)
 * lives elsewhere and is Eugene-authored. B3 is a 10-page infrastructure
 * inquiry rendered directly as PDF (not DOCX→PDF) so the canonical page
 * count is stable — it exercises Phase 4 cross-batch entity propagation
 * and Phase 3 Example 17 health-safety coverage.
 *
 * Byte-reproducibility:
 *   A, C1 — docx → JSZip → yazl two-phase pack, mirroring the pattern in
 *   `scripts/generate-docx-fixture.ts`. Zero `Math.random()`, no Date.now();
 *   core.xml timestamps pinned to FIXED_DATE; per-entry mtimes pinned on
 *   the yazl pack step. Confirmed byte-identical across runs.
 *
 *   B3 — pdf-lib with pinned setCreationDate/setModificationDate and
 *   standard Helvetica (no embedded fonts). Page count fixed by explicit
 *   addPage() calls per section.
 *
 * Usage:
 *   npx tsx scripts/generate-bench-fixtures.ts
 *
 * Writes:
 *   test-fixtures/bench/A_Council_Memo_Candid_Advice.docx
 *   test-fixtures/bench/C1_Tender_Evaluation_Commercial.docx
 *   test-fixtures/bench/B3_Long_Investigation.pdf
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
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
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

// ---------------------------------------------------------------------------
// Fixture B3 — long-investigation PDF for Phase 4 entity propagation.
// Rendered directly as PDF (not DOCX→PDF) so the canonical page count is
// stable. Theme: Awatere District Council Inquiry into the Rangitoto
// Reservoir Contamination Event. Five named individuals each appear on
// multiple pages in honorific + bare-surname forms. Includes
// health-safety protective-measures content (Phase 3 Example 17),
// free-and-frank findings, privileged legal advice, and commercial
// terms from an external contractor.
// ---------------------------------------------------------------------------

type Block =
  | { kind: "h1"; text: string }
  | { kind: "h2"; text: string }
  | { kind: "p"; text: string }
  | { kind: "kv"; label: string; value: string }
  | { kind: "spacer"; height?: number };

const B3_PAGES: Block[][] = [
  // ============= PAGE 1: title + executive summary + parties table =============
  [
    { kind: "h1", text: "AWATERE DISTRICT COUNCIL" },
    { kind: "h2", text: "INQUIRY INTO THE RANGITOTO RESERVOIR CONTAMINATION EVENT" },
    { kind: "p", text: "Report of the Inquiry — 28 February 2026 — File ref: INQ-2026-003" },
    { kind: "spacer", height: 6 },
    { kind: "h2", text: "Executive summary" },
    {
      kind: "p",
      text: "On 14 November 2025, a contamination event was detected at the Rangitoto Reservoir, resulting in a boil-water notice affecting approximately 4,200 households in the Kowhai Precinct and surrounding areas for 72 hours. This Inquiry, convened by the Chief Executive, examined the causes, identified organisational and individual failures, and recommends protective measures. The report draws on privileged legal advice and includes candid findings on deferred maintenance practices.",
    },
    { kind: "spacer", height: 6 },
    { kind: "h2", text: "Parties and persons interviewed" },
    { kind: "p", text: "Inquiry Commissioner" },
    { kind: "kv", label: "Name", value: "Helen Margaret Ashworth" },
    { kind: "kv", label: "Role", value: "Independent Inquiry Commissioner" },
    { kind: "kv", label: "Date of birth", value: "4 August 1971" },
    { kind: "kv", label: "Contact", value: "021 908 4433, helen.ashworth@ashworthlaw.co.nz" },
    { kind: "kv", label: "Postal", value: "PO Box 2184, Wellington 6011" },
    { kind: "spacer", height: 4 },
    { kind: "p", text: "Technical Advisor" },
    { kind: "kv", label: "Name", value: "Dr Tenisha Marama Aalbers" },
    { kind: "kv", label: "Role", value: "Hydrogeologist (external appointment)" },
    { kind: "kv", label: "Date of birth", value: "19 January 1982" },
    { kind: "kv", label: "IRD", value: "092-415-881" },
    { kind: "kv", label: "Contact", value: "027 552 9140, t.aalbers@aalbers-hydro.nz" },
    { kind: "kv", label: "Address", value: "47 Pohutukawa Terrace, Tauranga 3110" },
    { kind: "spacer", height: 4 },
    { kind: "p", text: "Senior Council Officer (subject)" },
    { kind: "kv", label: "Name", value: "Gareth Alexander Thornton" },
    { kind: "kv", label: "Role", value: "Group Manager — Infrastructure (until December 2025)" },
    { kind: "kv", label: "Date of birth", value: "27 November 1968" },
    { kind: "kv", label: "Contact", value: "021 744 6221, g.thornton@personalmail.example.nz" },
    { kind: "kv", label: "Home address", value: "12 Miro Street, Awatere 4310" },
  ],
  // ============= PAGE 2: more parties + background =============
  [
    { kind: "h2", text: "Parties — continued" },
    { kind: "p", text: "Contractor representative" },
    { kind: "kv", label: "Name", value: "Ms Rua Maia Henderson" },
    { kind: "kv", label: "Role", value: "Site Supervisor, Pacific Flowline Services" },
    { kind: "kv", label: "Date of birth", value: "11 May 1978" },
    { kind: "kv", label: "Contact", value: "022 803 4416, r.henderson@pacificflowline.example.co.nz" },
    { kind: "kv", label: "Postal", value: "Level 3 / 188 Vivian Street, New Plymouth 4310" },
    { kind: "spacer", height: 4 },
    { kind: "p", text: "Witness (maintenance technician)" },
    { kind: "kv", label: "Name", value: "Mr Ieremia Hemi Valeafou" },
    { kind: "kv", label: "Role", value: "Maintenance Technician, Water Treatment" },
    { kind: "kv", label: "Date of birth", value: "2 October 1988" },
    { kind: "kv", label: "IRD", value: "115-328-904" },
    { kind: "kv", label: "Contact", value: "027 220 9915, ivaleafou@example.nz" },
    { kind: "kv", label: "Home address", value: "9 Rimu Place, Awatere 4310" },
    { kind: "spacer", height: 6 },
    { kind: "h2", text: "Background" },
    {
      kind: "p",
      text: "The Rangitoto Reservoir services the Kowhai Precinct and adjacent suburbs, supplying treated water to approximately 4,200 residential connections and twelve commercial premises. The plant comprises a sedimentation basin, dual-stage chlorination system, and two reservoirs. Chlorine dosing is managed by a programmable logic controller with automated feedback from in-line residual sensors, supplemented by manual-mode operation when the automated system is offline.",
    },
    {
      kind: "p",
      text: "Routine maintenance of the chlorine dosing equipment is undertaken under a maintenance contract with Pacific Flowline Services. Under that contract, Pacific Flowline attend quarterly for scheduled servicing. In-between quarters, Council's own Maintenance Technicians are responsible for daily inspection, sensor calibration, and stockpile management. Mr Valeafou was the rostered technician on the days leading up to the event and was the first to detect the residual-chlorine deficit that triggered the contamination response.",
    },
    {
      kind: "p",
      text: "The Inquiry interviewed all named parties between 12 January 2026 and 17 February 2026. Transcripts are appended. References to individuals in this report use full names on first mention and honorific-plus-surname form thereafter, except where direct quotation requires otherwise.",
    },
  ],
  // ============= PAGE 3: timeline =============
  [
    { kind: "h2", text: "Timeline of events" },
    {
      kind: "p",
      text: "11 November 2025 (D-3): Pacific Flowline attended for scheduled quarterly servicing. Ms Henderson's field report, reviewed by the Inquiry, records that the primary dosing pump was serviced and that the secondary backup pump was found to have a calibration drift of 14% beyond tolerance. Ms Henderson's report recommends the secondary pump be taken offline for workshop service, leaving the primary pump as sole active unit until a replacement part arrives.",
    },
    {
      kind: "p",
      text: "12 November 2025 (D-2): Mr Thornton, as Group Manager, was copied on Ms Henderson's recommendation via email at 14:22 NZDT. No response is recorded in the Council email archive. Mr Valeafou, on shift that afternoon, noted in the plant logbook that the secondary backup pump was flagged out of service and that the primary pump was operating within tolerance.",
    },
    {
      kind: "p",
      text: "13 November 2025 (D-1): Mr Valeafou's morning inspection noted residual-chlorine readings 0.3 mg/L below the normal operating band but within the statutory minimum. The logbook records that he attempted to reach Mr Thornton's office to escalate the drift but was informed Mr Thornton was off-site for a budget session. The acting Group Manager's diary does not show any callback.",
    },
    {
      kind: "p",
      text: "14 November 2025, 06:40 (D-day): Mr Valeafou's pre-shift sensor sweep detected residual chlorine at 0.09 mg/L — below the statutory minimum of 0.20 mg/L. He immediately triggered the plant's automated boil-water protocol and contacted Ms Henderson, who arrived on site at 07:15.",
    },
    {
      kind: "p",
      text: "14 November 2025, 08:30: Council's Emergency Management Coordinator issued a boil-water notice to the 4,200 affected households via text-message alert and radio. Dr Aalbers was contacted at 09:10 and retained as independent technical advisor the same afternoon.",
    },
    {
      kind: "p",
      text: "14-16 November 2025: The primary dosing pump was found to have a cracked diaphragm. Pacific Flowline engineers replaced the diaphragm under emergency call-out. Dr Aalbers recommended a parallel sampling programme across all service reticulation zones to confirm restoration; this programme was completed on 17 November.",
    },
    {
      kind: "p",
      text: "17 November 2025, 18:00: Boil-water notice lifted after 72 hours following clearance by Dr Aalbers and the Ministry of Health regional officer.",
    },
  ],
  // ============= PAGE 4: technical investigation =============
  [
    { kind: "h2", text: "Technical investigation — root cause" },
    {
      kind: "p",
      text: "The Inquiry accepts Dr Aalbers' technical findings in full. Her report, attached as Appendix A, concludes that the contamination event had two proximate causes:",
    },
    {
      kind: "p",
      text: "(1) The primary dosing pump's diaphragm failed over a period of 8 to 14 hours beginning during the afternoon of 13 November 2025. The diaphragm had passed its last scheduled replacement date (May 2025) by six months. Dr Aalbers notes that diaphragm replacements are scheduled at six-monthly intervals in the manufacturer's specification and that the May 2025 replacement was the last recorded replacement in the plant maintenance log.",
    },
    {
      kind: "p",
      text: "(2) The secondary backup pump had been out of service since 11 November 2025 pending the arrival of a calibration-controller replacement ordered by Ms Henderson on the same date. In Dr Aalbers' assessment, had the secondary backup been operational, automatic failover would have maintained the residual-chlorine band within the statutory minimum and no boil-water notice would have been necessary.",
    },
    {
      kind: "p",
      text: "Dr Aalbers further identifies three contributing systemic factors, each of which is discussed at greater length in the Findings section:",
    },
    {
      kind: "p",
      text: "(a) The plant's automated alerting did not distinguish between the statutory minimum (0.20 mg/L) and the internal operating band lower bound (0.50 mg/L). Dr Aalbers states that the operating-band lower bound is the threshold at which backup chlorination should automatically engage, and that relying on the statutory minimum alone leaves an insufficient buffer for the 8-14 hour decay window observed on 13-14 November.",
    },
    {
      kind: "p",
      text: "(b) The maintenance log does not flag elapsed-time counters for diaphragm components. Dr Aalbers recommends a mandatory vulnerability assessment for chlorine dosing equipment on a six-monthly cycle, with explicit flagging of components approaching replacement due date.",
    },
    {
      kind: "p",
      text: "(c) The contamination response plan activation threshold of 4.5 mg/L (for the inverse event — over-chlorination) had been tabletopped in 2024 but the under-dosing threshold had not been rehearsed since 2019. Dr Aalbers considers this a material gap in emergency preparedness.",
    },
  ],
  // ============= PAGE 5: Dr Aalbers testimony =============
  [
    { kind: "h2", text: "Witness testimony — Dr Aalbers" },
    {
      kind: "p",
      text: "Dr Aalbers was interviewed on 22 January 2026. She confirmed the findings set out in her technical report and was asked to elaborate on matters the Inquiry considered material to organisational accountability.",
    },
    {
      kind: "p",
      text: "On the question of whether Mr Thornton should have acted on Ms Henderson's 11 November warning, Dr Aalbers stated: \"A reasonable infrastructure manager, on receipt of a field report flagging a backup system out of tolerance, would either action same-day replacement or escalate the risk tolerance decision to the Chief Executive. Deferring the decision for 48 hours in plain hope that the primary unit would hold was, in my view, not within the band of reasonable technical judgement.\"",
    },
    {
      kind: "p",
      text: "Asked whether the 2024 risk register had identified this specific failure mode, Dr Aalbers confirmed that the 2024 register had recorded \"concurrent failure of primary and backup chlorine dosing\" as a high-likelihood / high-consequence risk, rated Priority 1 for mitigation. Dr Aalbers confirmed that the mitigation recommendation in the 2024 register was identical to her recommendation in the present Inquiry: namely, maintain backup-pump redundancy at all times and implement mandatory vulnerability assessment protocols for chlorine dosing equipment on a six-monthly cycle.",
    },
    {
      kind: "p",
      text: "Asked whether Council's public framing of the 2024 audit as \"clean\" was accurate, Dr Aalbers declined to offer a regulatory opinion but noted that the audit's detailed findings were not consistent with the single-sentence public summary circulated at the time. She referred the Inquiry to Appendix B of her report, which reproduces the relevant audit findings verbatim.",
    },
    {
      kind: "p",
      text: "Dr Aalbers' view, offered in candid form and recorded with her permission: \"The 2024 audit was not a clean audit. It was an audit with one material adverse finding and the adverse finding was the one that materialised fourteen months later. That is a plain statement of fact rather than a judgement, but I accept it is a statement the Council may not welcome.\"",
    },
    {
      kind: "p",
      text: "Aalbers' further remarks on the contamination response plan and the adequacy of the public-notification protocol are set out in the Findings section.",
    },
  ],
  // ============= PAGE 6: Thornton testimony =============
  [
    { kind: "h2", text: "Witness testimony — Mr Thornton" },
    {
      kind: "p",
      text: "Mr Thornton was interviewed on 28 January 2026. The Inquiry gave Mr Thornton advance notice of the matters to be covered and the opportunity to respond to Ms Henderson's 11 November email in writing prior to interview. Mr Thornton provided a written response on 26 January 2026 (Appendix C) and was interviewed in person on the scheduled date.",
    },
    {
      kind: "p",
      text: "Mr Thornton confirmed receipt of Ms Henderson's 11 November 14:22 email. He accepted that he had not responded to the email on 12 November and had not personally actioned the backup-pump replacement recommendation. Mr Thornton's explanation, as he put it: \"I was in the final week of the draft budget cycle and I will be candid — I prioritised the budget submission over a maintenance escalation that, on the face of the email, did not read to me as same-day urgent.\"",
    },
    {
      kind: "p",
      text: "Asked whether he had seen the 2024 risk register's Priority 1 entry on concurrent dosing-pump failure, Mr Thornton stated that he had reviewed the register at the time of its publication in March 2024 and had noted the Priority 1 entry. He stated that he had relied on existing redundancy — the two-pump architecture — to meet the residual risk and that he had not directed any further mitigation activity beyond the existing quarterly-service schedule with Pacific Flowline.",
    },
    {
      kind: "p",
      text: "Asked whether he had personally approved the public framing of the 2024 audit as \"clean\", Mr Thornton confirmed that he had reviewed and approved the single-sentence public summary in March 2024. His written submission to the Inquiry acknowledges, in direct language: \"In candid retrospect, the Council's organisational tolerance for maintenance deferral has drifted materially from safe practice. I was part of that drift and I bear a portion of the accountability for it.\"",
    },
    {
      kind: "p",
      text: "Mr Thornton's employment with Council ended on 12 December 2025 by mutual agreement. The Inquiry was not asked to opine on the terms of that agreement and does not do so.",
    },
    {
      kind: "p",
      text: "The Inquiry accepts Thornton's written and oral evidence as frank and finds it has been helpful in identifying the sequence of decisions that led to the 14 November event. It does not find, on balance, that Thornton's conduct was wilful, but it does find that the conduct fell short of the standard reasonably expected of a Group Manager with direct accountability for a Priority 1 public-health risk.",
    },
  ],
  // ============= PAGE 7: Henderson + Valeafou testimony =============
  [
    { kind: "h2", text: "Witness testimony — Ms Henderson" },
    {
      kind: "p",
      text: "Ms Henderson was interviewed on 4 February 2026 at Pacific Flowline's New Plymouth office. Ms Henderson confirmed the sequence of events as set out in her 11 November field report and the subsequent 14 November call-out. She stated that Pacific Flowline's standard practice, on identifying a backup pump out of tolerance, is to escalate in writing within the same shift and to request written acknowledgement within 24 hours. Her 11 November email to Mr Thornton is consistent with that practice.",
    },
    {
      kind: "p",
      text: "Asked whether Pacific Flowline had any commercial interest in the outcome of the 14 November event, Ms Henderson confirmed that Pacific Flowline's contract includes a variation clause for emergency call-out. The variation fee claimed by Pacific Flowline for the 14-16 November diaphragm replacement was $18,400, of which $6,200 covered parts (at cost) and $12,200 covered labour (at the contract's standard emergency rate). The variation has been paid in full by Council and is not in dispute.",
    },
    {
      kind: "p",
      text: "Pacific Flowline's broader commercial arrangements with Council are governed by the maintenance contract dated 3 April 2024, which includes a commercial-in-confidence schedule detailing proprietary chlorine-dosing calibration procedures and a trade-secret schedule of Pacific Flowline's preferred parts suppliers. Henderson asked that the Inquiry respect the confidentiality undertaking in the contract. The Inquiry has done so and the commercial schedules are not reproduced in this report.",
    },
    { kind: "spacer", height: 4 },
    { kind: "h2", text: "Witness testimony — Mr Valeafou" },
    {
      kind: "p",
      text: "Mr Valeafou was interviewed on 6 February 2026. His evidence was consistent with the plant logbook and the automated telemetry. Mr Valeafou detailed his attempts to escalate the residual-chlorine drift on 13 November and the difficulty he had reaching Mr Thornton during the budget-session period.",
    },
    {
      kind: "p",
      text: "Asked whether he had felt any pressure not to escalate, Mr Valeafou stated: \"I did not feel pressured not to escalate. I did feel that the escalation path was not responsive on that particular day. I raised the drift with the acting Group Manager's office and I left a message. I did not get a callback.\" Valeafou confirmed that on 14 November he followed plant protocol exactly and contacted Henderson immediately on detecting the 0.09 mg/L reading.",
    },
    {
      kind: "p",
      text: "The Inquiry commends Valeafou's conduct on 13-14 November and finds no fault with his actions. His logbook entries are contemporaneous and detailed; the Inquiry has relied on them extensively.",
    },
  ],
  // ============= PAGE 8: Commercial + Privileged advice =============
  [
    { kind: "h2", text: "Commercial arrangements" },
    {
      kind: "p",
      text: "The Inquiry reviewed Council's commercial arrangements with Pacific Flowline Services. The maintenance contract dated 3 April 2024 is a three-year term at an annual fee of $840,000, with a commercial-in-confidence schedule detailing proprietary chlorine-dosing calibration procedures that Pacific Flowline treat as trade-secret information. The variation fee paid in respect of the 14-16 November emergency response was $18,400 and is on the record.",
    },
    {
      kind: "p",
      text: "Pacific Flowline also tendered for a subsequent variation, raised by Ms Henderson at the Inquiry, covering redesign of the automated alerting thresholds. That variation was quoted at $41,500 and included a proprietary signal-processing methodology which Pacific Flowline represents as a trade secret under their commercial-in-confidence submission. The variation has not yet been accepted by Council pending the recommendations of this Inquiry.",
    },
    { kind: "spacer", height: 4 },
    { kind: "h2", text: "Privileged legal advice" },
    {
      kind: "p",
      text: "The Inquiry has been provided with privileged advice from Farrow & Slate Lawyers on Council's exposure under the Health Act 1956 and the Local Government Act 2002. That advice, which is attached as Appendix D and which remains subject to solicitor-client privilege, is that Council's exposure is limited but non-trivial. Counsel's settlement range, should any affected party pursue a claim, is $180,000 to $450,000 inclusive of legal costs.",
    },
    {
      kind: "p",
      text: "Farrow & Slate further advise that the privileged opinion must not be released under LGOIMA without express waiver from the Chief Executive in consultation with the Mayor and the Audit and Risk Committee Chair. The Inquiry accepts that advice and has treated the privileged opinion as confidential for the purpose of this report.",
    },
    {
      kind: "p",
      text: "The Inquiry notes that the privileged advice canvasses the question of whether Mr Thornton's conduct gives rise to any separate personal liability. Farrow & Slate conclude that it does not. The Inquiry does not disturb that conclusion.",
    },
  ],
  // ============= PAGE 9: Free-and-frank findings =============
  [
    { kind: "h2", text: "Findings — free and frank" },
    {
      kind: "p",
      text: "The Inquiry's findings below are expressed in candid form and are intended as advice to the Chief Executive and elected members. They are not formal regulatory findings and are not offered in terms of any statutory test.",
    },
    {
      kind: "p",
      text: "Finding 1: In candid retrospect, staff concerns raised in the 2024 risk register were not actioned with appropriate urgency. The Priority 1 entry on concurrent chlorine-dosing failure was visible to three successive Group Managers and was not acted on until the event it predicted had occurred. That is a plain failure of risk-management process, not a failure of any individual officer's good faith.",
    },
    {
      kind: "p",
      text: "Finding 2: The Inquiry finds, frankly, that the prior Group Manager's public framing of the 2024 audit as \"clean\" was inconsistent with the audit's actual findings. The audit was not clean. It contained one material adverse finding, and that finding was the proximate cause of the November 2025 event. Misrepresenting the audit to the public and to elected members denied those audiences the information they needed to hold officers to account.",
    },
    {
      kind: "p",
      text: "Finding 3: The organisational tolerance for maintenance deferral has, in the Inquiry's view, drifted materially from safe practice. Officers routinely deferred six-monthly replacements to nine- or twelve-month cycles on the implicit assumption that redundancy would absorb the risk. That assumption was wrong on the facts; it was also wrong in principle. Redundancy is a margin for unexpected failure, not a licence for expected failure.",
    },
    {
      kind: "p",
      text: "Finding 4: The escalation path on 12-13 November was not functional. Mr Valeafou's attempts to reach Mr Thornton on 13 November were met with a budget-session absence and an unresponsive acting Group Manager's office. The Inquiry finds that single-point-of-failure escalation paths are incompatible with Priority 1 public-health risk management and must be replaced with a roster-backed on-call system.",
    },
    {
      kind: "p",
      text: "These findings are offered in advice rather than as judgement. The Inquiry accepts that each individual officer acted in good faith. The findings go to organisational process and culture rather than to individual conduct, except to the extent noted in respect of Mr Thornton above.",
    },
  ],
  // ============= PAGE 10: Health-safety measures + recommendations + sign-off =============
  [
    { kind: "h2", text: "Health-safety protective measures" },
    {
      kind: "p",
      text: "The Inquiry recommends the following protective measures, each of which is designed to reduce the likelihood or consequence of a similar event. Certain operational details in these measures are withheld from public release under s7(2)(d) because disclosure would reveal specific vulnerabilities that an adversary could exploit to trigger a contamination event.",
    },
    {
      kind: "p",
      text: "Protective measure A: Mandatory six-monthly vulnerability assessment protocols for chlorine dosing equipment, with explicit component-lifecycle flagging and an escalation path that does not rely on a single officer. The detailed protocol is set out in Appendix E of this report. Appendix E contains operational information whose disclosure could endanger public safety if exploited and must not be released under LGOIMA.",
    },
    {
      kind: "p",
      text: "Protective measure B: Emergency backup chlorination procedure at the 4.5 mg/L threshold, rehearsed at annual frequency and tested against both under-dosing and over-dosing scenarios. The under-dosing scenario has not been rehearsed since 2019 and the Inquiry considers this a material gap. The protective-measure specification includes the dispatch sequencing and alternate dosing-source coordinates for the backup supply, both of which are withheld from public release on the same s7(2)(d) basis.",
    },
    {
      kind: "p",
      text: "Protective measure C: Contamination response plan activation thresholds, updated to include automated triggering at the internal operating-band lower bound (0.50 mg/L) rather than the statutory minimum alone, and extended to cover a stress-tested boil-water notice distribution list.",
    },
    { kind: "spacer", height: 4 },
    { kind: "h2", text: "Recommendations" },
    {
      kind: "p",
      text: "The Inquiry recommends: (1) adoption of protective measures A, B and C as set out above, with implementation led by the incoming Group Manager Infrastructure and reported to the Audit and Risk Committee quarterly; (2) roster-backed 24-hour on-call escalation for Priority 1 public-health risks; (3) a formal externally-facilitated review of the 2024 risk register; (4) public disclosure of this report in its non-withheld form within 10 working days of adoption by Council.",
    },
    { kind: "spacer", height: 6 },
    { kind: "p", text: "Signed:" },
    { kind: "p", text: "Helen Margaret Ashworth" },
    { kind: "p", text: "Independent Inquiry Commissioner" },
    { kind: "p", text: "28 February 2026" },
  ],
];

interface RenderContext {
  page: PDFPage;
  font: PDFFont;
  bold: PDFFont;
  y: number;
  margin: number;
  pageWidth: number;
  textWidth: number;
}

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN = 54;
const TEXT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const FONT_SIZE_BODY = 10.5;
const FONT_SIZE_H2 = 12;
const FONT_SIZE_H1 = 15;
const LINE_HEIGHT = 14;

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const tentative = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(tentative, size) <= width) {
      current = tentative;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function drawBlock(ctx: RenderContext, block: Block): void {
  if (block.kind === "spacer") {
    ctx.y -= block.height ?? 8;
    return;
  }
  if (block.kind === "h1") {
    const lines = wrap(block.text, ctx.bold, FONT_SIZE_H1, ctx.textWidth);
    for (const line of lines) {
      ctx.page.drawText(line, {
        x: ctx.margin,
        y: ctx.y,
        size: FONT_SIZE_H1,
        font: ctx.bold,
        color: rgb(0, 0, 0),
      });
      ctx.y -= FONT_SIZE_H1 + 4;
    }
    ctx.y -= 4;
    return;
  }
  if (block.kind === "h2") {
    const lines = wrap(block.text, ctx.bold, FONT_SIZE_H2, ctx.textWidth);
    for (const line of lines) {
      ctx.page.drawText(line, {
        x: ctx.margin,
        y: ctx.y,
        size: FONT_SIZE_H2,
        font: ctx.bold,
        color: rgb(0, 0, 0),
      });
      ctx.y -= FONT_SIZE_H2 + 3;
    }
    ctx.y -= 3;
    return;
  }
  if (block.kind === "p") {
    const lines = wrap(block.text, ctx.font, FONT_SIZE_BODY, ctx.textWidth);
    for (const line of lines) {
      ctx.page.drawText(line, {
        x: ctx.margin,
        y: ctx.y,
        size: FONT_SIZE_BODY,
        font: ctx.font,
        color: rgb(0, 0, 0),
      });
      ctx.y -= LINE_HEIGHT;
    }
    ctx.y -= 2;
    return;
  }
  // kv — label in bold, value in regular, same line
  const label = `${block.label}: `;
  const labelWidth = ctx.bold.widthOfTextAtSize(label, FONT_SIZE_BODY);
  ctx.page.drawText(label, {
    x: ctx.margin,
    y: ctx.y,
    size: FONT_SIZE_BODY,
    font: ctx.bold,
    color: rgb(0, 0, 0),
  });
  const valueLines = wrap(block.value, ctx.font, FONT_SIZE_BODY, ctx.textWidth - labelWidth);
  for (let i = 0; i < valueLines.length; i++) {
    ctx.page.drawText(valueLines[i], {
      x: ctx.margin + (i === 0 ? labelWidth : 0),
      y: ctx.y,
      size: FONT_SIZE_BODY,
      font: ctx.font,
      color: rgb(0, 0, 0),
    });
    ctx.y -= LINE_HEIGHT;
  }
}

async function buildB3LongInvestigation(): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  pdf.setCreationDate(FIXED_DATE);
  pdf.setModificationDate(FIXED_DATE);
  pdf.setCreator("Veil Bench Fixture Generator");
  pdf.setProducer("Veil Bench Fixture Generator");
  pdf.setTitle("B3_Long_Investigation");
  pdf.setAuthor("Awatere District Council (synthetic)");
  pdf.setSubject("Detection-coverage benchmark — long-investigation fixture");
  pdf.setKeywords(["veil", "bench", "fixture", "long-investigation", "entity-propagation"]);

  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  for (const blocks of B3_PAGES) {
    const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    const ctx: RenderContext = {
      page,
      font,
      bold,
      y: PAGE_HEIGHT - MARGIN,
      margin: MARGIN,
      pageWidth: PAGE_WIDTH,
      textWidth: TEXT_WIDTH,
    };
    for (const block of blocks) {
      drawBlock(ctx, block);
    }
  }

  // useObjectStreams: false keeps the byte output stable across pdf-lib
  // runs (object streams would reorder refs based on write order).
  const bytes = await pdf.save({ useObjectStreams: false });
  return Buffer.from(bytes);
}

async function writePdfFixture(name: string, builder: () => Promise<Buffer>): Promise<void> {
  const buffer = await builder();
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
  await writePdfFixture("B3_Long_Investigation.pdf", buildB3LongInvestigation);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
