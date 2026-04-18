import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import { SEED } from "../fixtures/test-data";

test.describe("Upload authorization", () => {
  test.use({ storageState: "e2e/.auth/reviewer.json" });

  test("returns 403 when reviewer uploads to a case outside their department", async ({
    request,
  }) => {
    // req-003 (Rangitāne) lives in "Environmental Compliance" / "Parks &
    // Property"; the e2e reviewer is in "Infrastructure" and must not be
    // able to upload to it.
    const fixturePath = path.resolve(__dirname, "../fixtures/test-document.pdf");
    const fileBytes = fs.readFileSync(fixturePath);

    const response = await request.post("/api/documents/upload", {
      headers: { "x-requested-with": "XMLHttpRequest" },
      multipart: {
        caseId: SEED.cases.communityTrust.id,
        files: {
          name: "test-document.pdf",
          mimeType: "application/pdf",
          buffer: fileBytes,
        },
      },
    });

    expect(response.status()).toBe(403);
    const body = await response.json();
    expect(body.code).toBe("UPLOAD_FORBIDDEN");
  });
});
