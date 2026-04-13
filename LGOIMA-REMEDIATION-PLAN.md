# LGOIMA Taxonomy & Codebase Remediation Plan

**Date:** 2026-04-13
**Verified against:** Local Government Official Information and Meetings Act 1987, Version as at 15 January 2026 (PDF in repo)
**Purpose:** Comprehensive analysis of mismatches between the LGOIMA statute, the `lgoima_redaction_taxonomy_detailed.md` reference document, and the Veil prototype codebase. Each issue includes the exact file, the current wrong value, the correct statutory text, and a clear instruction for what to change.

**Intended audience:** Claude Code (or developer) tasked with implementing fixes. No code is written here — only precise specifications.

**Source material used:**
1. The statute itself (PDF pages 10–12 for ss 6–7; pages 18–19 for s 17)
2. `lgoima_redaction_taxonomy_detailed.md` in the repo
3. Claude Code gap analysis (Layer A/B/C detection taxonomy audit)
4. Full codebase review of all files referencing LGOIMA grounds

---

## Severity Classification

- **P0 — Legally incorrect:** Statutory references are wrong. A reviewer relying on these would cite the wrong section of the Act. Must fix before any external use.
- **P1 — Missing ground:** A real LGOIMA ground is absent from the system. Reviewers cannot select it.
- **P2 — Label/description error:** The reference is correct but the label or description is misleading or incomplete.
- **P3 — Structural/architectural:** Multiple sources of truth, missing detection-to-ground mappings, or missing workflow features.

---

## Verified Statutory Text (from the PDF)

### Section 6 — Conclusive reasons for withholding official information

> Good reason for withholding official information exists, for the purpose of section 5, if the making available of that information would be likely—

| Subsection | Verbatim statutory text |
|---|---|
| **s 6(a)** | to prejudice the security or defence of New Zealand or the international relations of the Government of New Zealand; or |
| **s 6(b)** | to prejudice the entrusting of information to the Government of New Zealand on a basis of confidence by— (i) the Government of another country or an agency of that Government; or (ii) any international organisation; or |
| **s 6(c)** | to prejudice the maintenance of the law, including the prevention, investigation, and detection of offences, and the right to a fair trial; or |
| **s 6(d)** | to endanger the safety of any person. |

**There is no s 6(e) in LGOIMA.** (The OIA has s 6(e) for constitutional conventions — this does not exist in LGOIMA.)

### Section 7 — Other reasons for withholding official information

> (1) Where this section applies, good reason for withholding official information exists, for the purpose of section 5, unless, in the circumstances of the particular case, the withholding of that information is outweighed by other considerations which render it desirable, in the public interest, to make that information available.

> (2) Subject to sections 6, 8, and 17, this section applies if, and only if, the withholding of the information is necessary to—

| Subsection | Verbatim statutory text |
|---|---|
| **s 7(2)(a)** | protect the privacy of natural persons, including that of deceased natural persons; or |
| **s 7(2)(b)(i)** | protect information where the making available of the information would disclose a trade secret; or |
| **s 7(2)(b)(ii)** | would be likely unreasonably to prejudice the commercial position of the person who supplied or who is the subject of the information; or |
| **s 7(2)(ba)** | in the case only of an application for a resource consent, or water conservation order, or a requirement for a designation or heritage order, under the Resource Management Act 1991, to avoid serious offence to tikanga Maori, or to avoid the disclosure of the location of waahi tapu; or |
| **s 7(2)(c)** | protect information which is subject to an obligation of confidence or which any person has been or could be compelled to provide under the authority of any enactment, where the making available of the information— |
| **s 7(2)(c)(i)** | would be likely to prejudice the supply of similar information, or information from the same source, and it is in the public interest that such information should continue to be supplied; or |
| **s 7(2)(c)(ii)** | would be likely otherwise to damage the public interest; or |
| **s 7(2)(d)** | avoid prejudice to measures protecting the health or safety of members of the public; or |
| **s 7(2)(e)** | avoid prejudice to measures that prevent or mitigate material loss to members of the public; or |
| **s 7(2)(f)** | maintain the effective conduct of public affairs through— |
| **s 7(2)(f)(i)** | the free and frank expression of opinions by or between or to members or officers or employees of any local authority in the course of their duty; or |
| **s 7(2)(f)(ii)** | the protection of such members, officers, employees, and persons from improper pressure or harassment; or |
| **s 7(2)(g)** | maintain legal professional privilege; or |
| **s 7(2)(h)** | enable any local authority holding the information to carry out, without prejudice or disadvantage, commercial activities; or |
| **s 7(2)(i)** | enable any local authority holding the information to carry on, without prejudice or disadvantage, negotiations (including commercial and industrial negotiations); or |
| **s 7(2)(j)** | prevent the disclosure or use of official information for improper gain or improper advantage. |

### Section 17 — Refusal of requests

> A request made in accordance with section 10 may be refused only for 1 or more of the following reasons, namely,

| Subsection | Verbatim statutory text |
|---|---|
| **s 17(a)** | that, by virtue of section 6 or section 7, there is good reason for withholding the information: |
| **s 17(b)** | that, by virtue of section 8, the local authority does not confirm or deny the existence or non-existence of the information requested: |
| **s 17(c)(i)** | that the making available of the information requested would be contrary to the provisions of a specified enactment; or |
| **s 17(c)(ii)** | constitute contempt of court or of the House of Representatives: |
| **s 17(d)** | that the information requested is or will soon be publicly available: |
| **s 17(da)** | that the request is made by a defendant or person acting on behalf of a defendant and is— (i) for information that could be sought by the defendant under the Criminal Disclosure Act 2008; or (ii) for information that could be sought by the defendant under that Act and that has been disclosed to, or withheld from, the defendant under that Act: |
| **s 17(e)** | that the document alleged to contain the information requested does not exist or, despite reasonable efforts to locate it, cannot be found: |
| **s 17(f)** | that the information requested cannot be made available without substantial collation or research: |
| **s 17(g)** | that the information requested is not held by the local authority and the person dealing with the request has no grounds for believing that the information is either— (i) held by another local authority or a department or Minister of the Crown or organisation; or (ii) connected more closely with the functions of another local authority, or a department or Minister of the Crown or organisation: |
| **s 17(h)** | that the request is frivolous or vexatious or that the information requested is trivial. |

---

## Issue 1 — Section 6 references are scrambled in `lgoima-grounds.ts` [P0]

**File:** `lib/lgoima-grounds.ts`, lines 14–18

The code assigns correct descriptions to the **wrong** section 6 subsection letters. Cross-referencing the PDF:

| Actual LGOIMA | Statutory subject | Code ID that has this content | Code's wrong reference |
|---|---|---|---|
| **s 6(a)** — security/defence/international relations | "prejudice the security or defence of New Zealand or the international relations" | `s6c` | `s6(c)` |
| **s 6(b)** — entrusted by other government | "prejudice the entrusting of information to the Government of New Zealand on a basis of confidence" | `s6d` | `s6(d)` |
| **s 6(c)** — maintenance of the law | "prejudice the maintenance of the law, including the prevention, investigation, and detection of offences" | `s6a` | `s6(a)` |
| **s 6(d)** — safety of any person | "endanger the safety of any person" | `s6b` | `s6(b)` |

**Additionally:** The code includes `s6e` with reference `s6(e)`, label "Constitutional conventions", description "Release would prejudice constitutional conventions". **There is no s 6(e) in LGOIMA.** This provision exists only in the Official Information Act 1982, s 6(e). It must be removed.

**Remediation:**

Replace the entire s6 block in `lib/lgoima-grounds.ts` with:

| id | reference | label | description (from statute) | common | rare | requiresPI |
|---|---|---|---|---|---|---|
| `s6a` | `s6(a)` | Security, defence, or international relations | Making available would be likely to prejudice the security or defence of New Zealand or the international relations of the Government of New Zealand | false | true | false |
| `s6b` | `s6(b)` | Information entrusted by other government | Making available would be likely to prejudice the entrusting of information to the Government of New Zealand on a basis of confidence by another government or international organisation | false | true | false |
| `s6c` | `s6(c)` | Maintenance of the law | Making available would be likely to prejudice the maintenance of the law, including prevention, investigation, and detection of offences, and the right to a fair trial | false | false | false |
| `s6d` | `s6(d)` | Safety of any person | Making available would be likely to endanger the safety of any person | false | false | false |

**Delete** the `s6e` entry entirely.

**Downstream impact:** The `bulk-review/page.tsx` file (Issue 5) happens to have the *correct* s6 labels already — after this fix the central file will agree with it. Check seed data (`prisma/seed.ts`, `prisma/seed-extra-docs.ts`, `scripts/seed-content.ts`) for any references to `s6(e)` and remove them.

---

## Issue 2 — s7(2)(d) is mislabelled in `lgoima-grounds.ts` [P0]

**File:** `lib/lgoima-grounds.ts`, line 24

**Current value:**
```
id: "s7_2d", reference: "s7(2)(d)", label: "Statutory restriction", description: "Disclosure prohibited by specified enactment"
```

**Actual statute (PDF page 11):**
> s 7(2)(d): avoid prejudice to measures protecting the health or safety of members of the public

The current description does not correspond to any s 7(2) provision. "Disclosure prohibited by specified enactment" resembles s 17(c)(i), which is already separately defined in the code as `s17c`.

**Remediation:**

Change to:
- **label:** "Health or safety of the public"
- **description:** "Avoid prejudice to measures protecting the health or safety of members of the public"
- **common:** false
- **rare:** false (this is relevant to water, emergency management, infrastructure, transport safety contexts)
- **requiresPI:** true

---

## Issue 3 — s7(2)(e) is mislabelled in `lgoima-grounds.ts` [P0]

**File:** `lib/lgoima-grounds.ts`, line 25

**Current value:**
```
id: "s7_2e", reference: "s7(2)(e)", label: "Public health/safety", description: "Protect measures for public health or safety"
```

**Actual statute (PDF page 11):**
> s 7(2)(e): avoid prejudice to measures that prevent or mitigate material loss to members of the public

The current label and description actually describe s 7(2)(d), not s 7(2)(e). Once Issue 2 is fixed, this entry would be a duplicate unless also corrected.

**Remediation:**

Change to:
- **label:** "Material loss prevention"
- **description:** "Avoid prejudice to measures that prevent or mitigate material loss to members of the public"
- **common:** false
- **rare:** true
- **requiresPI:** true

---

## Issue 4 — s7(2)(j) is mislabelled in `lgoima-grounds.ts` [P0]

**File:** `lib/lgoima-grounds.ts`, line 30

**Current value:**
```
id: "s7_2j", reference: "s7(2)(j)", label: "Incomplete negotiations", description: "Prevent prejudice to incomplete negotiations"
```

**Actual statute (PDF page 12):**
> s 7(2)(j): prevent the disclosure or use of official information for improper gain or improper advantage.

"Incomplete negotiations" is not a statutory concept. Negotiations is s 7(2)(i), which is already correctly defined in the code as `s7_2i`. This was also flagged in the Claude Code gap analysis.

**Remediation:**

Change to:
- **label:** "Improper gain or advantage"
- **description:** "Prevent the disclosure or use of official information for improper gain or improper advantage"

---

## Issue 5 — Bulk-review page has multiple wrong s7 labels [P0]

**File:** `app/requests/[id]/bulk-review/page.tsx`, lines 9–26

This file contains a hardcoded `groundLabels` mapping that is independent of `lgoima-grounds.ts`. Several entries are wrong, verified against the statute PDF:

| Key | Current label | Correct statutory text | Problem |
|---|---|---|---|
| `s7(2)(c)(i)` | "Terms of contract" | "prejudice the supply of similar information, or information from the same source, and it is in the public interest that such information should continue to be supplied" | Misdescribed — s 7(2)(c)(i) is about prejudice to future supply of information given in confidence, not terms of contract |
| `s7(2)(c)(ii)` | "Negotiations" | "would be likely otherwise to damage the public interest" | Misdescribed — negotiations is s 7(2)(i); s 7(2)(c)(ii) is the second limb of obligation of confidence |
| `s7(2)(f)(ii)` | "Free and frank expression" | "the protection of such members, officers, employees, and persons from improper pressure or harassment" | s 7(2)(f)(ii) is specifically about protecting persons from improper pressure or harassment, not free and frank expression |
| `s7(2)(g)` | "Effective conduct of public affairs" | "maintain legal professional privilege" | Wrong ground entirely — "effective conduct of public affairs" is the s 7(2)(f) chapeau; s 7(2)(g) is legal privilege |
| `s7(2)(h)` | "Legal professional privilege" | "enable any local authority holding the information to carry out, without prejudice or disadvantage, commercial activities" | Swapped with s 7(2)(g) |
| `s7(2)(j)` | "Prevent improper pressure" | "prevent the disclosure or use of official information for improper gain or improper advantage" | Misdescribed — "improper pressure" is s 7(2)(f)(ii); s 7(2)(j) is about improper gain/advantage |
| `s17` | "Information does not exist" | Multiple distinct s 17 subsections | Too broad — "s17" covers 8+ distinct refusal grounds; this description matches s 17(e) only |

**Remediation:**

This entire mapping should be **deleted** and replaced by a lookup function against `lgoima-grounds.ts` (see Issue 11). If retained as a standalone mapping, every value above must be corrected to match the statute.

---

## Issue 6 — Reports module has wrong labels and an OIA ground [P0]

**File:** `lib/data/reports.ts`, lines 71–82

This hardcoded `groundLabels` mapping has multiple errors:

| Key | Current label | Correct statutory provision | Problem |
|---|---|---|---|
| `s7(2)(c)(i)` | "Negotiations prejudice" | Prejudice to future supply of confidential information | Wrong — negotiations is s 7(2)(i) |
| `s7(2)(d)` | "Improper gain/advantage" | Health or safety measures | Wrong — improper gain is s 7(2)(j); s 7(2)(d) is about health/safety |
| `s7(2)(h)` | "Legal professional privilege" | Local authority commercial activities | Wrong — legal privilege is s 7(2)(g); s 7(2)(h) is council commercial activities |
| `s7(2)(i)` | "Officials advice to Ministers" | Negotiations (including commercial and industrial) | Wrong — "officials advice to Ministers" is **OIA s 9(2)(g)(i)**, not an LGOIMA ground at all |

**Remediation:**

Delete this mapping and derive labels from `lgoima-grounds.ts` (see Issue 11). Also add coverage for all grounds — the current mapping only covers 10 of the full ground set. Any ground stored as `appliedGround` in the database should resolve to a correct label.

---

## Issue 7 — s7(2)(ba) (tikanga Māori / wāhi tapu) is missing from the codebase [P1]

**File:** `lib/lgoima-grounds.ts`

**Statute (PDF page 11):**
> s 7(2)(ba): in the case only of an application for a resource consent, or water conservation order, or a requirement for a designation or heritage order, under the Resource Management Act 1991, to avoid serious offence to tikanga Maori, or to avoid the disclosure of the location of waahi tapu

This ground is absent from `lgoima-grounds.ts` and therefore unavailable to reviewers in the statutory ground selector UI. The taxonomy document covers it in section 5.2.4, and the Claude Code gap analysis confirms it is missing from both the grounds list and detection types.

**Remediation:**

Add a new entry to the s7 block in `lgoima-grounds.ts`, inserted after `s7_2bii` to maintain statutory order:

| Field | Value |
|---|---|
| id | `s7_2ba` |
| section | `s7` |
| reference | `s7(2)(ba)` |
| label | Tikanga Māori / wāhi tapu |
| description | In resource consent/RMA contexts, avoid serious offence to tikanga Māori or disclosure of the location of wāhi tapu |
| common | false |
| rare | false |
| requiresPI | true |

---

## Issue 8 — s7(2)(c) should be split into (i) and (ii) [P1]

**File:** `lib/lgoima-grounds.ts`, line 23

The code has a single entry for s 7(2)(c) — "Obligation of confidence". The statute (PDF page 11) has two distinct limbs:

- **s 7(2)(c)(i):** "would be likely to prejudice the supply of similar information, or information from the same source, and it is in the public interest that such information should continue to be supplied"
- **s 7(2)(c)(ii):** "would be likely otherwise to damage the public interest"

These are legally distinct. (i) protects the supply chain — complainants, whistleblowers, confidential sources. (ii) is a broader public interest damage test.

**Remediation:**

Replace the single `s7_2c` entry with two:

| id | reference | label | description |
|---|---|---|---|
| `s7_2ci` | `s7(2)(c)(i)` | Prejudice to supply of confidential information | Protect information subject to an obligation of confidence where release would prejudice the supply of similar information, and it is in the public interest that such information continue to be supplied |
| `s7_2cii` | `s7(2)(c)(ii)` | Damage to public interest | Protect information subject to an obligation of confidence where release would be likely otherwise to damage the public interest |

Both: `requiresPI: true`, `common: true`.

**Downstream impact:** Existing detections or seed data using `s7_2c` or `s7(2)(c)` will need migrating. Suggested default: map to `s7_2ci` (the more commonly invoked limb) and flag for reviewer attention.

---

## Issue 9 — s7(2)(f) should be split into (i) and (ii) [P1]

**File:** `lib/lgoima-grounds.ts`, line 26

The code has a single entry for s 7(2)(f). The statute (PDF pages 11–12) has two distinct limbs:

- **s 7(2)(f)(i):** "the free and frank expression of opinions by or between or to members or officers or employees of any local authority in the course of their duty"
- **s 7(2)(f)(ii):** "the protection of such members, officers, employees, and persons from improper pressure or harassment"

These serve different purposes. (i) protects candour of internal advice. (ii) protects people from retaliation, doxxing, or harassment.

**Remediation:**

Replace the single `s7_2f` entry with two:

| id | reference | label | description |
|---|---|---|---|
| `s7_2fi` | `s7(2)(f)(i)` | Free and frank opinions | Maintain effective conduct of public affairs through free and frank expression of opinions by or between or to members, officers, or employees of any local authority |
| `s7_2fii` | `s7(2)(f)(ii)` | Protection from improper pressure or harassment | Protect members, officers, employees, and persons from improper pressure or harassment |

`s7_2fi`: `common: true`. `s7_2fii`: `common: false`.

**Downstream impact:** Same as Issue 8. Map existing `s7_2f` / `s7(2)(f)` to `s7_2fi` by default and flag for review. The bulk-review page already uses split references `s7(2)(f)(i)` and `s7(2)(f)(ii)`, so once the central file is updated, they will align.

---

## Issue 10 — Section 17 references are scrambled in `lgoima-grounds.ts` [P0]

**File:** `lib/lgoima-grounds.ts`, lines 32–35

The code uses IDs and references that do not match the actual LGOIMA subsection letters. Verified against PDF pages 18–19:

| Code ID | Code reference | Code label | Actual LGOIMA subsection for this content |
|---|---|---|---|
| `s17a` | `s17(a)` | "Information not held" | **Real s 17(e)** — "the document alleged to contain the information requested does not exist or, despite reasonable efforts to locate it, cannot be found" |
| `s17b` | `s17(b)` | "Substantial collation" | **Real s 17(f)** — "the information requested cannot be made available without substantial collation or research" |
| `s17c` | `s17(c)` | "Contrary to enactment" | **Partially correct** — s 17(c)(i) is about being "contrary to the provisions of a specified enactment", but the code conflates this with s 17(c)(ii) (contempt of court) |
| `s17e` | `s17(e)` | "Frivolous or vexatious" | **Real s 17(h)** — "that the request is frivolous or vexatious or that the information requested is trivial" |

The actual LGOIMA s 17 subsections are (from PDF):
- **s 17(a)** — good reason under s 6 or s 7 for withholding
- **s 17(b)** — NCND under s 8
- **s 17(c)(i)** — contrary to provisions of specified enactment
- **s 17(c)(ii)** — contempt of court or House of Representatives
- **s 17(d)** — information is or will soon be publicly available
- **s 17(da)** — request by defendant re Criminal Disclosure Act 2008
- **s 17(e)** — document does not exist or cannot be found
- **s 17(f)** — substantial collation or research
- **s 17(g)** — not held and no grounds to believe held elsewhere
- **s 17(h)** — frivolous, vexatious, or trivial

**Remediation:**

Replace the s17 block with correctly referenced entries. Recommended minimum set for a redaction tool:

| id | reference | label | description (from statute) | requiresPI |
|---|---|---|---|---|
| `s17a` | `s17(a)` | Good reason to withhold (s6/s7) | By virtue of section 6 or section 7, there is good reason for withholding the information | false |
| `s17b` | `s17(b)` | NCND (section 8) | By virtue of section 8, the local authority does not confirm or deny the existence or non-existence of the information | false |
| `s17ci` | `s17(c)(i)` | Contrary to enactment | Making available would be contrary to the provisions of a specified enactment | false |
| `s17cii` | `s17(c)(ii)` | Contempt of court | Making available would constitute contempt of court or of the House of Representatives | false |
| `s17d` | `s17(d)` | Publicly available | The information requested is or will soon be publicly available | false |
| `s17e` | `s17(e)` | Information not held | The document alleged to contain the information does not exist or cannot be found | false |
| `s17f` | `s17(f)` | Substantial collation or research | The information cannot be made available without substantial collation or research | false |
| `s17g` | `s17(g)` | Not held, no known holder | The information is not held by the local authority and there are no grounds for believing it is held elsewhere | false |
| `s17h` | `s17(h)` | Frivolous or vexatious | The request is frivolous or vexatious or the information requested is trivial | false |

**Design decision:** Whether to include s 17(a), s 17(b), and s 17(da) is up to you — they are less commonly selected in a redaction context (s 17(a) is implied whenever a s 6/s 7 ground is applied). At minimum, include s 17(c) through s 17(h) with correct references.

**Downstream impact:** Data migration needed for any stored `appliedGround` or `suggestedGround` values using the old references:

| Old stored value | Correct new value |
|---|---|
| `s17(a)` (if meant "not held") | `s17(e)` |
| `s17(b)` (if meant "substantial collation") | `s17(f)` |
| `s17(e)` (if meant "frivolous") | `s17(h)` |

Check seed files for hardcoded references: `prisma/seed.ts`, `prisma/seed-extra-docs.ts`, `scripts/seed-content.ts`.

---

## Issue 11 — Multiple sources of truth for ground labels [P3]

**Files affected:**
- `lib/lgoima-grounds.ts` — canonical definition (currently 19 entries, many wrong)
- `app/requests/[id]/bulk-review/page.tsx`, lines 9–26 — hardcoded `groundLabels` (16 entries, several wrong)
- `lib/data/reports.ts`, lines 71–82 — hardcoded `groundLabels` (10 entries, several wrong)
- `lib/pipeline/ai-detect.ts` — system prompt with inline examples (no ground enumeration)
- `lib/pipeline/patterns.ts` — hardcoded `suggestedGround` strings (all `"s7(2)(a)"`)

Each location independently defines ground labels and references. None derive from the central file.

**Remediation:**

1. **Add a lookup helper to `lgoima-grounds.ts`:** Create a function `getGroundLabelMap(): Record<string, string>` that returns a mapping from `reference` → `label` (e.g., `{ "s6(a)": "Security, defence, or international relations", ... }`). Also consider a `getGroundByReference(ref: string)` function.

2. **`bulk-review/page.tsx`:** Delete the local `groundLabels` constant (lines 9–26). Import and use `getGroundLabelMap()` from `lgoima-grounds.ts`.

3. **`reports.ts`:** Delete the local `groundLabels` constant (lines 71–82). Import and use `getGroundLabelMap()` from `lgoima-grounds.ts`.

4. **`ai-detect.ts`:** Dynamically inject the current ground list into the system prompt by importing from `lgoima-grounds.ts`. This ensures the AI always sees the correct, current references. See Issue 13 for details.

5. **`patterns.ts`:** The hardcoded `suggestedGround` strings (all `"s7(2)(a)"`) are acceptable since they are deterministic PII patterns. Ensure the string values match the `reference` field in `lgoima-grounds.ts` exactly after Batch 1 fixes.

---

## Issue 12 — Detection types are too narrow; most grounds have no detection pathway [P3]

**Files affected:**
- `lib/db/mappers.ts` (DetectionType union)
- `lib/pipeline/patterns.ts` (regex patterns)
- `lib/pipeline/ai-detect.ts` (AI system prompt)

**Claude Code gap analysis summary:**

The system currently has:
- **Pattern detectors (regex):** ird, phone, email-addr, nhi, address, bank-account, nz-passport, vehicle-reg
- **AI detection types:** personal-name, phone, email-addr, ird, address, bank-account, nz-passport, vehicle-reg, commercial, free-frank, legal-privilege, confidential
- **UI toggles:** 11 (Personal Names, Phone Numbers, Email Addresses, Physical Addresses, IRD Numbers, Bank Account Numbers, NZ Passport Numbers, Vehicle Registration, Commercial Sensitivity, Legal Privilege, Free & Frank Opinions)

But the LGOIMA has 17+ withholding grounds. The detection → ground mapping is thin:

| LGOIMA ground | Has a detection type? | Detection type | Notes |
|---|---|---|---|
| s 7(2)(a) Privacy | Yes | All PII types | Well covered |
| s 7(2)(b)(i) Trade secret | Partial | "commercial" | Folded into generic commercial |
| s 7(2)(b)(ii) Commercial prejudice | Partial | "commercial" | Folded into generic commercial |
| s 7(2)(ba) Tikanga / wāhi tapu | **No** | — | No detection type exists |
| s 7(2)(c) Obligation of confidence | **No** | — | "confidential" is closest but not explicitly mapped |
| s 7(2)(d) Health/safety measures | **No** | — | — |
| s 7(2)(e) Material loss prevention | **No** | — | — |
| s 7(2)(f)(i) Free and frank | Yes | free-frank | Covered |
| s 7(2)(f)(ii) Harassment protection | **No** | — | — |
| s 7(2)(g) Legal privilege | Yes | legal-privilege | Covered |
| s 7(2)(h) Council commercial | **No** | — | — |
| s 7(2)(i) Negotiations | **No** | — | — |
| s 7(2)(j) Improper gain | **No** | — | — |
| s 6(a) Security/defence | **No** | — | — |
| s 6(b) Foreign government info | **No** | — | — |
| s 6(c) Maintenance of law | **No** | — | — |
| s 6(d) Safety of person | **No** | — | — |

**Layer A (detectable content) gaps from Claude Code analysis:**

| Missing type | Detection method | Difficulty | Ground mapping |
|---|---|---|---|
| `driver-licence` | Pattern (NZ: 2 letters + 6 digits) | Low (overlaps passport) | s 7(2)(a) |
| `gps-coordinates` | Pattern (lat/long regex) | Low | s 7(2)(a) or s 7(2)(ba) |
| `date-of-birth` | Pattern + AI context | Medium | s 7(2)(a) |
| `medical-notes` | AI only (contextual) | Medium | s 7(2)(a) |
| `witness-statement` | AI only (contextual) | Medium | s 6(c) or s 7(2)(c)(i) |
| `evaluation-commentary` | AI only (contextual) | Medium | s 7(2)(f)(i) |
| `negotiation-position` | AI only (contextual) | Medium | s 7(2)(i) |
| `disciplinary` | AI only (contextual) | Medium | s 7(2)(a) |
| `signature` | Image/layout analysis | High (outside text pipeline) | s 7(2)(a) |

**Remediation (phased):**

**Phase 1 — Expand AI prompt (low effort, high impact):** Update the AI system prompt in `ai-detect.ts` to enumerate all LGOIMA grounds and instruct GPT-4o to suggest the most appropriate one. Currently the prompt lists 9 detection types but doesn't enumerate the full ground set. This single change would immediately improve ground suggestions without any code changes to detection types. See Issue 13.

**Phase 2 — Add new detection types (medium effort):** Add types for the most important uncovered areas. Each new type needs: an entry in the `DetectionType` union in `mappers.ts`, a `detectionTypeConfig` display entry, and mention in the AI prompt.

Suggested new types:
- `negotiation-position` → default ground s 7(2)(i)
- `safety-concern` → default ground s 6(d)
- `law-enforcement` → default ground s 6(c)
- `council-commercial` → default ground s 7(2)(h)
- `harassment-risk` → default ground s 7(2)(f)(ii)
- `cultural-sensitivity` → default ground s 7(2)(ba)
- `health-safety-measure` → default ground s 7(2)(d)

**Phase 3 — Add new regex patterns (low effort):** Add patterns for:
- GPS coordinates (e.g., `-39.0556, 174.0752`)
- NZ driver licence numbers (needs disambiguation from passport format)

---

## Issue 13 — Detection logic never suggests s6 or s17 grounds [P2]

**Files affected:**
- `lib/pipeline/patterns.ts` — all patterns suggest `s7(2)(a)`
- `lib/pipeline/ai-detect.ts` — default fallback is `s7(2)(a)` (line 139); system prompt doesn't mention s6 grounds

**Current state:**

Every regex pattern defaults to `s7(2)(a)` (privacy). The AI system prompt instructs GPT-4o to classify content into types but never mentions s 6 grounds. The fallback in `validateDetection()` (line 139) is also `s7(2)(a)`.

Content that should trigger s 6(c) (law enforcement — e.g., witness identities in investigation files) or s 6(d) (safety — e.g., hidden addresses for threatened persons) will always be suggested as s 7(2)(a) privacy. This is legally significant because s 6 grounds are **conclusive** (no public interest balancing) whereas s 7(2)(a) requires public interest balancing.

**Remediation:**

1. **Update the system prompt in `ai-detect.ts`** to include all s 6 and s 7 grounds with brief descriptions, dynamically imported from `lgoima-grounds.ts`. Add specific guidance:
   - "If content relates to an active investigation, prosecution, or enforcement action, suggest s 6(c) rather than s 7(2)(a)"
   - "If releasing a person's address could endanger their safety (e.g., family violence, threatened witness), suggest s 6(d) rather than s 7(2)(a)"
   - "If content is clearly subject to legal professional privilege, suggest s 7(2)(g)"
   - "Section 6 grounds are conclusive — they do not require public interest balancing. Prefer s 6 where the threshold is met."

2. **Consider changing the fallback** in `validateDetection()` from `"s7(2)(a)"` to an empty string or `"unclassified"` so that unclassifiable detections are flagged for reviewer attention rather than silently defaulting to privacy.

---

## Issue 14 — Layer C (workflow routing) is entirely absent [P3]

**Current state (from Claude Code gap analysis):**

The taxonomy document defines 11 workflow/response-routing categories. None are implemented:

| Workflow category | Implemented? | Notes |
|---|---|---|
| Public interest balancing required | No | `requiresPI` flag on grounds is the closest thing, but there's no workflow flag/tag |
| Neither confirm nor deny candidate | No | Whole-request decision, not a detection |
| Privacy Act routing candidate | No | s 10(1A) — request should be handled under Privacy Act 2020 |
| Transfer candidate | No | s 12 — request should be transferred |
| Information not held | Partial | s 17(e) exists as a ground |
| Substantial collation/research | Partial | s 17(f) exists as a ground |
| Already publicly available | No | s 17(d) — no detection or flag |
| Refusal-ground candidate | No | Workflow state, not detection |
| Excerpt / summary release | No | s 15/16 — alternative release format |

**Remediation:**

This is feature work, not a bug fix. Recommended approach:

1. **Add a `WorkflowFlag` type** (in `lib/lgoima-grounds.ts` or new `lib/workflow-flags.ts`) defining flags: `public-interest-review`, `ncnd-candidate`, `privacy-act-routing`, `transfer-candidate`, `excerpt-release-candidate`, `publicly-available`, `substantial-collation`.

2. **Add a `workflowFlags` field** to the Case model in `prisma/schema.prisma` — a JSON array of active flags.

3. **Add UI** in the review interface for tagging requests with workflow flags.

4. **Optionally** add AI triage to suggest flags at request level (e.g., "this request is for the requester's own personal information — consider Privacy Act routing under s 10(1A)").

---

## Issue 15 — Taxonomy document minor gaps [P2]

**File:** `lgoima_redaction_taxonomy_detailed.md`

The document is thorough and largely accurate. Minor corrections:

1. **Add explicit note that s 6(e) does not exist in LGOIMA** — to prevent the confusion that exists in the codebase. The document correctly omits s 6(e), but a positive statement prevents future errors.

2. **The summary table in section 20** does not include s 7(2)(ba) (tikanga Māori / wāhi tapu) even though the document covers it in section 5.2.4. Add a row.

3. **The summary table in section 20** does not include s 7(2)(c)(ii), s 7(2)(e), or s 7(2)(f)(ii) as separate rows. Expand to show all sub-limbs.

4. **Section 17 coverage:** Add a summary table mapping s 17 subsection letters to their content, as the document does for s 6 and s 7 in section 20.

5. **Claude Code gap analysis integration:** The Layer A/B/C gap analysis produced by Claude Code contains valuable implementation detail (detection method, difficulty, ground mapping) that should be incorporated into the taxonomy document's sections 7 (content-feature taxonomy) and 8 (legal-label schema) as implementation notes.

---

## Implementation Status

### Batch 1 — Fix the central ground definitions [CRITICAL] ✅ DONE

**Issues:** 1, 2, 3, 4, 7, 8, 9, 10

**Changes made in:** `lib/lgoima-grounds.ts`, `lib/__tests__/lgoima-grounds.test.ts`

Completed:
- s 6(a)–(d) corrected — all had wrong labels/descriptions (were shifted by one)
- s 6(e) removed (OIA-only provision)
- s 7(2)(ba) added (tikanga Māori / wāhi tapu)
- s 7(2)(c) split into (i) and (ii)
- s 7(2)(d) fixed: "Statutory restriction" → "Health or safety of the public"
- s 7(2)(e) fixed: "Public health/safety" → "Material loss prevention"
- s 7(2)(f) split into (i) and (ii)
- s 7(2)(j) fixed: "Incomplete negotiations" → "Improper gain or advantage"
- All 9 s 17 entries rewritten with correct statutory references
- Added `getGroundLabelMap()` and `getGroundByReference()` helpers
- Test file updated: 32 tests passing, validates 27 grounds, no s 6(e), correct PI flags

**Final ground count:** 27 entries (4 × s6, 14 × s7, 9 × s17). All 9 s 17 subsections included per user decision.

### Batch 2 — Eliminate duplicate label mappings ✅ DONE

**Issues:** 5, 6, 11

**Changes made in:**
- `app/requests/[id]/bulk-review/page.tsx` — deleted 17-line hardcoded `groundLabels`, replaced with `getGroundLabelMap()` import from central source
- `lib/data/reports.ts` — deleted 10-line hardcoded `groundLabels`, replaced with `getGroundLabelMap()` import from central source

### Batch 3 — Improve AI detection prompt ✅ DONE

**Issues:** 12 (Phase 1), 13

**Changes made in:** `lib/pipeline/ai-detect.ts`

Completed:
- System prompt now dynamically includes all 27 LGOIMA grounds with reference, label, description, and PI requirement — generated from `lgoimaGrounds` array via `buildGroundsReference()`
- Added s 6 ground guidance (when to use conclusive vs balanced grounds; specific instructions for s 6(c) law enforcement and s 6(d) safety)
- Added distinction guidance for split grounds: (c)(i)/(ii), (f)(i)/(ii)
- Instructed model not to suggest s 17 grounds (request-level refusal, not content-level withholding)
- Changed default `suggestedGround` fallback from `"s7(2)(a)"` to `""` (forces reviewer attention instead of silently defaulting to privacy)

### Seed data updates ✅ DONE

**Changes made in:** `prisma/seed.ts`, `prisma/seed-extra-docs.ts`, `scripts/seed-content.ts`

- All `s7_2f` references updated to `s7_2fi` (~20 detection records across 3 files)
- No `s7_2c` references existed in seed data (no migration needed)
- `s7_2ba` references in seed data are now valid (Issue 7 added the ground)
- No s 17 references existed in seed data (no migration needed)

### Batch 4 — Expand detection types ❌ NOT DONE (deferred)

**Issues:** 12 (Phase 2 and 3)

**Would change:**
- `lib/db/mappers.ts` — add 7 new detection types to `DetectionType` union and `detectionTypeConfig` (negotiation-position, safety-concern, law-enforcement, council-commercial, harassment-risk, cultural-sensitivity, health-safety-measure)
- `lib/pipeline/patterns.ts` — add GPS coordinates, driver licence patterns
- `lib/pipeline/ai-detect.ts` — add new contextual detection type instructions to `ALL_AI_TYPES`
- `lib/data/settings.ts` — add new toggle entries

### Batch 5 — Update taxonomy document ❌ NOT DONE (deferred)

**Issues:** 15

**Would change:**
- `lgoima_redaction_taxonomy_detailed.md` — corrections and additions as listed

### Batch 6 — Workflow routing (new feature) ❌ NOT DONE (deferred)

**Issues:** 14

New feature work — design and implement request-level workflow flags.

---

## Data Migration Notes

After Batch 1, if the system has persisted data (detections, audit entries) storing ground references as strings, migrations will be needed:

### s 6 grounds
The s 6 IDs and references stay the same (`s6a` → `s6(a)`, etc.) but the labels/descriptions change. If the DB stores the `id` or `reference` (not the label text), no data migration is needed for s 6 — only the display will change. **However**, any records referencing `s6(e)` or `s6e` must be removed or remapped.

### s 7 grounds (splits)
| Old stored value | New value | Notes |
|---|---|---|
| `s7_2c` or `s7(2)(c)` | Default to `s7_2ci` / `s7(2)(c)(i)` | Flag for reviewer attention |
| `s7_2f` or `s7(2)(f)` | Default to `s7_2fi` / `s7(2)(f)(i)` | Flag for reviewer attention |

### s 17 grounds (reference corrections)
| Old stored value | Correct new value |
|---|---|
| `s17(a)` (meant "not held") | `s17(e)` |
| `s17(b)` (meant "substantial collation") | `s17(f)` |
| `s17(e)` (meant "frivolous") | `s17(h)` |
| `s17(c)` (meant "contrary to enactment") | `s17(c)(i)` (or retain as `s17(c)` if not splitting) |

### Seed files to check
- `prisma/seed.ts`
- `prisma/seed-extra-docs.ts`
- `scripts/seed-content.ts`

---

## Verification Checklist

After all fixes are applied, verify:

- [ ] Every entry in `lgoima-grounds.ts` has a `reference` that matches the actual LGOIMA subsection (verified against the PDF in the repo)
- [ ] Every entry has a `label` and `description` that accurately reflect the statutory text
- [ ] No duplicate entries exist (unique IDs and unique references)
- [ ] s 6(e) does not exist
- [ ] s 7(2)(ba) exists and is positioned after s 7(2)(b)(ii)
- [ ] s 7(2)(c)(i) and s 7(2)(c)(ii) are separate entries
- [ ] s 7(2)(d) describes health/safety measures (not "statutory restriction")
- [ ] s 7(2)(e) describes material loss prevention (not "public health/safety")
- [ ] s 7(2)(f)(i) and s 7(2)(f)(ii) are separate entries
- [ ] s 7(2)(j) describes improper gain/advantage (not "incomplete negotiations")
- [ ] All s 17 references match actual LGOIMA s 17 subsections from the PDF
- [ ] `bulk-review/page.tsx` derives labels from the central file (no local `groundLabels`)
- [ ] `reports.ts` derives labels from the central file (no local `groundLabels`)
- [ ] No OIA provisions (e.g., "officials advice to Ministers") appear anywhere
- [ ] The AI system prompt references the correct ground set
- [ ] All `requiresPI` flags are correct (true for all s 7, false for all s 6 and s 17)
- [ ] Existing tests pass with updated ground definitions
- [ ] Seed data uses correct references
- [ ] The taxonomy document's section 20 table includes all grounds including s 7(2)(ba)

---

## Reference: Complete correct ground set for `lgoima-grounds.ts`

For implementer convenience, here is the full target state after Batch 1:

### Section 6 — Conclusive (requiresPI: false)

| id | reference | label | description |
|---|---|---|---|
| s6a | s6(a) | Security, defence, or international relations | Making available would be likely to prejudice the security or defence of New Zealand or the international relations of the Government of New Zealand |
| s6b | s6(b) | Information entrusted by other government | Making available would be likely to prejudice the entrusting of information to the Government of New Zealand on a basis of confidence by another government or international organisation |
| s6c | s6(c) | Maintenance of the law | Making available would be likely to prejudice the maintenance of the law, including prevention, investigation, and detection of offences, and the right to a fair trial |
| s6d | s6(d) | Safety of any person | Making available would be likely to endanger the safety of any person |

### Section 7 — Balanced (requiresPI: true)

| id | reference | label | description | common |
|---|---|---|---|---|
| s7_2a | s7(2)(a) | Privacy of natural persons | Protect the privacy of natural persons, including that of deceased natural persons | true |
| s7_2bi | s7(2)(b)(i) | Trade secrets | Protect information where making available would disclose a trade secret | false |
| s7_2bii | s7(2)(b)(ii) | Commercial position | Protect information where making available would be likely unreasonably to prejudice the commercial position of the supplier or subject | true |
| s7_2ba | s7(2)(ba) | Tikanga Māori / wāhi tapu | In RMA contexts, avoid serious offence to tikanga Māori or disclosure of the location of wāhi tapu | false |
| s7_2ci | s7(2)(c)(i) | Prejudice to supply of confidential information | Protect information subject to obligation of confidence where release would prejudice supply of similar information, and continued supply is in the public interest | true |
| s7_2cii | s7(2)(c)(ii) | Damage to public interest | Protect information subject to obligation of confidence where release would likely otherwise damage the public interest | false |
| s7_2d | s7(2)(d) | Health or safety of the public | Avoid prejudice to measures protecting the health or safety of members of the public | false |
| s7_2e | s7(2)(e) | Material loss prevention | Avoid prejudice to measures that prevent or mitigate material loss to members of the public | false |
| s7_2fi | s7(2)(f)(i) | Free and frank opinions | Maintain effective conduct of public affairs through free and frank expression of opinions by or between or to members, officers, or employees of any local authority | true |
| s7_2fii | s7(2)(f)(ii) | Protection from improper pressure or harassment | Protect members, officers, employees, and persons from improper pressure or harassment | false |
| s7_2g | s7(2)(g) | Legal professional privilege | Maintain legal professional privilege | true |
| s7_2h | s7(2)(h) | Local authority commercial activities | Enable local authority to carry out, without prejudice or disadvantage, commercial activities | false |
| s7_2i | s7(2)(i) | Negotiations | Enable local authority to carry on, without prejudice or disadvantage, negotiations (including commercial and industrial negotiations) | false |
| s7_2j | s7(2)(j) | Improper gain or advantage | Prevent the disclosure or use of official information for improper gain or improper advantage | false |

### Section 17 — Refusal (requiresPI: false)

| id | reference | label | description |
|---|---|---|---|
| s17a | s17(a) | Good reason to withhold (s6/s7) | By virtue of section 6 or section 7, there is good reason for withholding the information |
| s17b | s17(b) | NCND (section 8) | By virtue of section 8, the local authority does not confirm or deny the existence or non-existence of the information |
| s17ci | s17(c)(i) | Contrary to enactment | Making available would be contrary to the provisions of a specified enactment |
| s17cii | s17(c)(ii) | Contempt of court | Making available would constitute contempt of court or of the House of Representatives |
| s17d | s17(d) | Publicly available | The information requested is or will soon be publicly available |
| s17e | s17(e) | Information not held | The document alleged to contain the information does not exist or cannot be found |
| s17f | s17(f) | Substantial collation or research | The information cannot be made available without substantial collation or research |
| s17g | s17(g) | Not held, no known holder | The information is not held and there are no grounds for believing it is held elsewhere |
| s17h | s17(h) | Frivolous or vexatious | The request is frivolous or vexatious or the information requested is trivial |

**Total:** 4 (s6) + 14 (s7) + 9 (s17) = **27 grounds**
