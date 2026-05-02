# Umbra — Developer Notes

A working scratchpad for engineering decisions, gotchas, and patterns that
don't fit cleanly into the spec docs. Treat this as a living document.

For the high-level overview see `README.md`; for the rework programme see
`docs/umbra-implementation-plan.md`.

---

## Repo provenance

Umbra forks from Veil at the `v0.0.0-umbra-fork` tag (April 2026). The
fork strategy was strip-in-place: same git history, new GitHub remote
(`DataSing/clarivus_umbra`), all Veil-era branches preserved.

Key docs:
- `docs/umbra-current-state-survey.md` — what was wired at fork time
- `docs/umbra-implementation-plan.md` — the 11-phase rework plan
- `docs/legacy-veil/` — archived Veil-era specs (LGOIMA, NPDC, original Azure deployment)

If you're new to the codebase: read README → CLAUDE.md → the survey, in
that order.

---

## Database conventions

### Map between TypeScript and Postgres

Prisma uses `@@map` to convert PascalCase model names to snake_case table
names. When you write raw SQL (`prisma.$queryRaw`), use the snake_case
table name and quote camelCase column names:

```sql
SELECT id, "batchId", "integrityHash"
FROM audit_entries
WHERE "batchId" = $1
ORDER BY timestamp ASC, id ASC
```

The Prisma client is generated to `lib/generated/prisma` (not
`@prisma/client`). Imports:

```ts
import { prisma } from "@/lib/db/prisma";   // app code
import { PrismaClient } from "../lib/generated/prisma/client";  // standalone scripts
```

### Migration regeneration

Pre-deploy phases (1–11) freely regenerate `0001_init`. The pattern is:

```bash
rm -rf prisma/migrations/
PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION="yes go ahead" PRISMA_SKIP_SEED=true \
  npx prisma migrate reset --force
PRISMA_SKIP_SEED=true npx prisma migrate dev --create-only --name init
npx prisma migrate deploy
npx prisma generate
```

This is destructive — every deployed environment needs a fresh start.
Phase 11 cuts the deploy lock; after that, schema changes need real
migrations.

### Timestamp gotcha (audit chain)

`AuditEntry.timestamp` is `timestamp(3) without time zone`.
`createAuditEntry` writes `new Date(isoString)` (UTC), and the hash is
computed over that ISO string. The `pg` driver re-interprets the stored
value in the server's local TZ on read — producing a different ISO
string than the one that was hashed.

The workaround is raw SQL with `to_char(timestamp,
'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')` — see `verifyAuditIntegrity` in
`lib/data/audit.ts` and `loadCanonicalEntries` in
`lib/jobs/audit-archive.ts`.

**Don't switch the audit-archive code to `prisma.findMany` without
understanding this.**

---

## pg-boss (Phase 6)

pg-boss 12.x manages its own Postgres schema (`pgboss`) inside the same
DB. Auto-creates on first start; migrations are emitted as part of
`boss.start()` and don't appear in our Prisma migrations folder.

In production the worker runs in-process inside the Next.js Node server
(`instrumentation.ts:register`). On Azure App Service set "Always On" to
true so the worker doesn't sleep between requests.

For separate-worker container deployments, run `npx tsx scripts/start-worker.ts`
(not yet implemented — Phase 11 if needed).

---

## Detection-type vocabulary

The 22-entry vocabulary is the canonical truth. `lib/detection-type-grounds.ts`
holds the map; every other emit point (regex patterns, AI prompt,
label-adjacent dictionary, settings toggles, bench-pathway routing) must
reference the same set of strings.

`lib/__tests__/detection-type-parity.test.ts` enforces this invariant.
Adding a new type? Add it to `DEFAULT_GROUND_FOR_TYPE` first, then thread
it through the dependent points; the parity test will fail loud until
they all line up.

---

## Storage abstraction

`StorageProvider` (`lib/storage/types.ts`) has six methods:
`upload, download, getUrl, delete, exists, listByPrefix`.

Local impl in `lib/storage/local.ts` is filesystem-backed. Path-traversal
guard via `resolvePath` — keys can't escape `baseDir`.

Azure impl in `lib/storage/azure-blob.ts` uses
`@azure/storage-blob`'s `BlobServiceClient`. `listByPrefix` uses
`container.listBlobsFlat({ prefix })` — single API call, paged
enumeration via `for await`.

Phase 6c uses `listByPrefix` for two purposes:
- `{batchId}/` — clean up data blobs after cascade-delete
- `archives/` — enumerate every archive directory for the cross-batch
  download

---

## NextResponse + Buffer

`new NextResponse(buf, { ... })` doesn't accept Node `Buffer` directly
under the Next 15 / React 19 type stack. Use `new Uint8Array(buf)` to
satisfy the body type. Real-world examples in
`app/api/admin/audit-archive/download/route.ts` and
`app/api/reports/chain-of-custody/route.ts`.

---

## CSRF and auth

CSRF protection sits at the API-route layer:
`lib/csrf.ts:requireCsrfHeader(request)` validates an `X-Requested-With`
header on all mutating routes. Server actions inherit the CSRF guard
from Next.js's own action-call protocol, so `/api/...` routes carry the
explicit check while `actions/*.ts` rely on the framework.

`requireUser`, `requireAdmin`, `authorizeForBatch`, `authorizeForDocument`,
`authorizeForDetection` all re-read the user's role from the database.
Don't trust JWT claims on role — the JWT can be stale.

---

## Bench / detection quality

Canonical fixtures live under `test-fixtures/bench/`. Baselines under
`docs/bench-baselines/`. Run:

```bash
npm run bench:detection                    # smoke
npm run bench:suite                         # multi-fixture
npm run bench:compare -- <baseline-dir>     # diff vs frozen
npm run bench:canonical                     # capture new canonical
```

---

## Logging

`lib/logger.ts` — child-logger pattern. Use `logger.child({ module: "..." })`
at the top of each file with a meaningful `module` name. Errors include
`error: String(err)` to avoid `[object Object]` in CloudWatch / App
Insights output.

Avoid `console.log` in production code paths — telemetry is opt-in via
`logger.info` / `warn` / `error`.

---

## Testing

- Vitest unit tests live next to the code in `__tests__/` directories.
- Playwright e2e tests live in `e2e/`. They seed test users via
  `e2e/seed-test-users.ts` before any spec runs (`npm run test:e2e`).
- The detection-type parity test is the cheapest insurance against a
  vocabulary drift bug — keep it green.

---

## Common gotchas (compiled list)

- **Standalone scripts** must pass `DATABASE_URL` explicitly. `npx tsx -e`
  doesn't load `.env`.
- **Prisma 7 `--skip-seed` flag** removed. Use `PRISMA_SKIP_SEED=true`.
- **Migration reset** needs `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION="yes go ahead"`.
- **Docker on macOS**: Docker CLI may not be on PATH. Add
  `/Applications/Docker.app/Contents/Resources/bin`.
- **Port conflicts**: `PORT=3001 npm run dev`.
- **Buffer**: use `new Uint8Array(data)` in NextResponse bodies.
- **Raw SQL**: snake_case tables, quoted camelCase columns. See
  `audit_entries` and `purge_log` for reference patterns.
- **Audit timestamps**: see "Timestamp gotcha" above. Don't change the
  reads without understanding the hash chain.
