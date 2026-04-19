import { test, expect } from "@playwright/test";
import { createHash } from "crypto";
import path from "path";
import { SEED } from "../fixtures/test-data";

const CASE_ID = SEED.cases.coastalWalkway.id; // req-001
const DOCX_FIXTURE = path.resolve(
  __dirname,
  "../../test-fixtures/dummy-lgoima-pack/01_Planning_and_Resource_Consent/04_main_case_file_long.docx",
);

test.describe("Canonical PDF — build and fetch", () => {
  // Admin storageState so (a) requireAdmin on /canonical passes, and
  // (b) /api/files/{caseId}/… auth via authorizeForCase passes for any case.
  test.use({ storageState: "e2e/.auth/admin.json" });

  // DOCX → LibreOffice convert → DI → AI detection can easily exceed the
  // default 30s Playwright test budget. Bump to 2 minutes.
  test.setTimeout(120_000);

  test("DOCX upload → canonical PDF persisted → GET /api/files/{path} returns valid PDF with matching sha256", async ({
    page,
    request,
  }) => {
    // 1. Upload via the ingest UI. Capture the POST /api/documents/upload
    //    response to pick up the new Document id without a direct DB hit.
    await page.goto(`/requests/${CASE_ID}/ingest`);

    const uploadResponsePromise = page.waitForResponse(
      (r) =>
        r.url().includes("/api/documents/upload") &&
        r.request().method() === "POST",
    );
    await page
      .locator('input[type="file"][aria-label="Upload documents"]')
      .setInputFiles(DOCX_FIXTURE);
    const uploadResponse = await uploadResponsePromise;
    expect(uploadResponse.status()).toBe(201);
    const uploadBody = (await uploadResponse.json()) as Array<{ id: string; name: string }>;
    expect(uploadBody.length).toBe(1);
    const docId = uploadBody[0].id;

    // 2. Poll the admin /canonical endpoint until status=ready and
    //    canonicalPdfPath is populated. 90s budget — DOCX ingest goes
    //    through LibreOffice convert + DI + AI detection.
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
    const deadline = Date.now() + 90_000;
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
      "Document did not reach status=ready with canonicalPdfPath within 90s",
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
  });
});
