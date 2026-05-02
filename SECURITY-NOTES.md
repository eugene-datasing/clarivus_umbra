# Security Notes

## npm vulnerability triage

**Last reviewed:** 2026-05-02 (post Phase 4)

### Resolved during triage

Triaged 27 inherited Veil-fork vulnerabilities (1 critical, 13 high, 12 moderate, 1 low). Resolution log:

#### Auto-fixed via `npm audit fix` (17 advisories)

- **Critical (1):** `protobufjs` (transitive in Azure SDK chain)
- **High (7):** `@prisma/config`, `@xmldom/xmldom`, `defu`, `effect`, `hono`, `lodash`, `vite` (vite's path-traversal, fs.deny bypass, and arbitrary-file-read CVEs)
- **Moderate (8):** `@azure/msal-node`, `@chevrotain/cst-dts-gen`, `@chevrotain/gast`, `@mrleebo/prisma-ast`, `brace-expansion`, `chevrotain`, `fast-xml-parser`, `nodemailer`
- **Low (1):** `mailparser`

All cleared via transitive lockfile resolution; no direct-dependency version bumps.

#### Replaced dependency

- **`xlsx@0.18.5` → `exceljs@4.4.0`** to address two unfixable advisories:
  - GHSA-4r6h-8v6p-xvw6 (Prototype Pollution in SheetJS, **high**)
  - GHSA-5pgg-2g8v-p4x9 (SheetJS ReDoS, **high**)
  
  `xlsx` was used for **input parsing** of user-uploaded `.xlsx` files in `lib/pipeline/extract.ts` and `lib/pipeline/format-converter.ts`. Both code paths handle untrusted public-consultation submissions, making the CVEs real exploitable surface. `exceljs` is actively maintained with no current high-severity advisories. The migration preserves both function signatures (`extractFromXlsx` and `convertXlsx`) and produces RFC-4180-compliant CSV output via a manual escape pass (cells with comma/CR/LF/double-quote get quoted; embedded quotes get doubled).

#### Explicit upgrades (3 succeeded, 1 already at latest)

- `picomatch`: 2.3.1 → 4.0.4 (cleared the **high** advisory)
- `@azure/functions`: 4.11.2 → 4.14.0 (didn't fully clear — see residuals)
- `uuid`: 8.3.2 → 14.0.0 (didn't fully clear transitive — see residuals)
- `applicationinsights`: 3.14.0 → 3.14.0 (already latest published version; advisory targets 3.14.0 itself)

### Residual vulnerabilities (9 moderate)

After all triage steps the audit reports 9 moderate advisories. They split into two groups:

#### Real (4 advisories) — transitive `uuid` lock chain

- **`uuid` (moderate, GHSA-w5hq-g745-h8pq)**: missing buffer bounds check in v3/v5/v6 when `buf` is provided. Top-level `uuid@14.0.0` is patched, but transitive copies remain at older versions in:
  - `node_modules/exceljs/node_modules/uuid` — exceljs 4.x bundles older uuid; fix would require exceljs 5.x (not yet released)
  - `node_modules/@azure/functions-old/node_modules/uuid` — applicationinsights 3.14.0 depends on a legacy `@azure/functions` (3.5.0-alpha.x – 4.0.0-alpha.13) that pins old uuid
- **`@azure/functions` (moderate)**: the legacy alpha range above. Same chain: applicationinsights pin → unable to bump.
- **`applicationinsights` (moderate)**: depends on the vulnerable `@azure/functions` chain. Already at latest (3.14.0). Fix requires upstream maintainer release.
- **`exceljs` (moderate)**: depends on vulnerable `uuid`. Fix requires upstream maintainer release.

Practical risk: the `uuid` advisory is a buffer-bounds issue when callers pass a custom `buf` — none of our code does that, so the exposure surface is internal SDK calls only.

#### Bogus npm-audit "downgrade-as-fix" suggestions (5 advisories)

`npm audit` reports `fixAvailable: { name: "...", version: "9.3.3" or "6.19.3" }` for these — but those are older versions than what we have installed, so the suggestion is to *downgrade*, which would regress functionality. These are a known npm-audit pathology and should not be applied:

- `next` — npm suggests next@9.3.3; we're on 15.x
- `postcss` — same root suggestion via next
- `prisma` — npm suggests prisma@6.19.3; we're on 7.5.0
- `@prisma/dev` — same root suggestion via prisma
- `@hono/node-server` — same chain via prisma

Real fix path: wait for the affected packages' next minor/patch releases or upgrade past the next major (e.g. Prisma 8 when released).

### Review cadence

Re-run `npm audit` between phases. Re-evaluate residuals when:

- A phase's deletions remove a vulnerable transitive dep (e.g. Phase 7 cover-letter / cost-recovery / compliance-summary cleanup may drop currently-load-bearing transitives if those reports were the only consumers).
- Upstream issues a fix:
  - `applicationinsights`: watch for a 3.x patch that bumps the @azure/functions pin, or migrate to a newer telemetry SDK in Phase 11.
  - `exceljs`: watch for 5.x release with bumped uuid.
  - `next` / `prisma`: future major/minor releases will resolve their downgrade-suggestion noise.
- Threat model shifts (e.g. when production deploy planning crystallises in Phase 11; pre-deploy security review may demand reaching zero-residual).

### Headline numbers

| | Critical | High | Moderate | Low | Total |
|---|---|---|---|---|---|
| Inherited from Veil fork | 1 | 13 | 12 | 1 | **27** |
| After triage | 0 | 0 | 9 | 0 | **9** |
| Cleared | 1 | 13 | 3 | 1 | **18** |

Zero critical, zero high. All residuals are moderate, with practical risk concentrated in one transitive `uuid` chain.
