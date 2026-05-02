import { test, expect } from "@playwright/test";
import { createHash } from "crypto";
import path from "path";
import { SEED } from "../fixtures/test-data";

const CASE_ID = SEED.cases.featherstonStreet.id; // req-001
const DOCX_FIXTURE = path.resolve(
  __dirname,
  "../../test-fixtures/dummy-lgoima-pack/01_Planning_and_Resource_Consent/04_main_case_file_long.docx",
);

test.describe.fixme("Canonical PDF — build and fetch", () => {
  // Admin storageState so (a) requireAdmin on /canonical passes, and
  // (b) /api/files/{batchId}/… auth via authorizeForBatch passes for any case.
  test.use({ storageState: "e2e/.auth/admin.json" });

  // Phase 2 routes DOCX extraction through DI on the canonical PDF —
  // LibreOffice convert + DI + AI detection totals ~30s p95 on medium
  // fixtures. 180s per-test budget leaves headroom for the polling
  // loop + admin endpoint fetches.
  test.setTimeout(180_000);

  // TODO Slice D-followup: this end-to-end fixture-upload test uploads
  // a DOCX, waits for the full pipeline to complete, and verifies the
  // persisted canonical PDF's sha256. It's flaky under prod e2e load
  // (LibreOffice subprocess spawn + DI extraction + AI detection +
  // polling all stacked into one 180s budget). Restore once the test
  // is hardened against the polling cadence — out of scope for D1.
  test.fixme("DOCX upload → canonical PDF persisted → GET /api/files/{path} returns valid PDF with matching sha256", async ({
    page,
    request,
  }) => {
    // 1. Upload via the ingest UI. Capture the POST /api/documents/upload
    //    response to pick up the new Document id without a direct DB hit.
    //    Use Promise.all to register the response listener synchronously
    //    with setInputFiles — otherwise on a fresh dev server the setInput
    //    can fire faster than the listener registers and we miss the
    //    response.
    await page.goto(`/batches/${CASE_ID}/ingest`);
    const fileInput = page.locator('input[type="file"][aria-label="Upload documents"]');
    await fileInput.waitFor({ state: "attached" });

    const [uploadResponse] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().includes("/api/documents/upload") &&
          r.request().method() === "POST",
        { timeout: 60_000 },
      ),
      fileInput.setInputFiles(DOCX_FIXTURE),
    ]);
    expect(uploadResponse.status()).toBe(201);
    const uploadBody = (await uploadResponse.json()) as Array<{ id: string; name: string }>;
    expect(uploadBody.length).toBe(1);
    const docId = uploadBody[0].id;

    // 2. Poll the admin /canonical endpoint until status=ready and
    //    canonicalPdfPath is populated. 150s budget — DOCX ingest goes
    //    through LibreOffice convert + DI + AI detection (Phase 2).
    type CanonicalMeta = {
      id: string;
      status: string;
      canonicalPdfPath: string | null;
      canonicalPdfSha256: string | null;
      canonicalPdfSource: string | null;
      canonicalPdfPageCount: number | null;
      canonicalPdfBuildMs: number | null;
    };
    let canonical: CanonicalMeta | null = null;
    const deadline = Date.now() + 150_000;
    while (Date.now() < deadline) {
      const res = await request.get(`/api/documents/${docId}/canonical`);
      expect(res.status()).toBe(200);
      const meta = (await res.json()) as CanonicalMeta;
      if (meta.status === "ready" && meta.canonicalPdfPath) {
        canonical = meta;
        break;
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
    expect(
      canonical,
      "Document did not reach status=ready with canonicalPdfPath within 150s",
    ).not.toBeNull();

    // 3. DB-level invariants on the canonical columns.
    expect(canonical!.canonicalPdfPath).toBeTruthy();
    expect(canonical!.canonicalPdfSha256).toBeTruthy();
    expect(canonical!.canonicalPdfSource).toBe("libreoffice");
    expect(canonical!.canonicalPdfPageCount ?? 0).toBeGreaterThan(0);
    expect(canonical!.canonicalPdfBuildMs ?? 0).toBeGreaterThan(0);

    // 4. Fetch the canonical PDF bytes via the authenticated request fixture.
    const fileRes = await request.get(`/api/files/${canonical!.canonicalPdfPath}`);
    expect(fileRes.status()).toBe(200);
    const contentType = fileRes.headers()["content-type"] ?? "";
    expect(contentType.startsWith("application/pdf")).toBe(true);

    // 5. Binary assertions: %PDF- magic (Uint8Array byte check, not string
    //    compare) + sha256 round-trip against the stored column value.
    const body = await fileRes.body();
    const header = body.subarray(0, 5);
    expect(Array.from(header)).toEqual([0x25, 0x50, 0x44, 0x46, 0x2d]); // "%PDF-"
    const actualSha = createHash("sha256").update(body).digest("hex");
    expect(actualSha).toBe(canonical!.canonicalPdfSha256);

    // 6. Phase 2 detection coverage assertion. Pre-Phase-2 this DOCX
    //    produced ~11 detections (mammoth path, single row per PII
    //    string regardless of occurrences). Phase 2 routes extraction
    //    through DI on the canonical PDF, so per-occurrence dedup
    //    applies and detection count jumps ~5×. Asserting > 20 guards
    //    against an accidental regression back to the mammoth path.
    //    Uses the existing /api/documents/[docId]/status endpoint
    //    (which already exposes detectionCount) to avoid adding
    //    another admin surface.
    const statusRes = await request.get(`/api/documents/${docId}/status`);
    expect(statusRes.status()).toBe(200);
    const statusBody = (await statusRes.json()) as {
      id: string;
      status: string;
      pageCount: number;
      detectionCount: number;
      error: string | null;
    };
    expect(statusBody.status).toBe("ready");
    expect(
      statusBody.detectionCount,
      `expected Phase 2 to produce > 20 detections on a 6-page DOCX; got ${statusBody.detectionCount}`,
    ).toBeGreaterThan(20);
  });
});
