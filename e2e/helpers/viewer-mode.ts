/**
 * VIEWER_MODE flag helper for e2e specs.
 *
 * Phase 3 of the viewer rework gates the pdf.js PdfViewer behind a
 * SystemSetting row. Slice A (PR #42) introduced it; Slice D2 will
 * flip the default to "pdf". For Slice D1, review-area specs need
 * the PDF view active so their assertions exercise that branch —
 * but other specs must continue running with the default ("html"),
 * because Slice D2 is the only place the default flips.
 *
 * Usage from a Playwright project's `globalSetup` / `globalTeardown`:
 *   import { setViewerMode } from "./helpers/viewer-mode";
 *   await setViewerMode("pdf");   // before review specs
 *   await setViewerMode(null);    // after — restore default
 *
 * Direct DB write (matches Slice A's storage shape — bare JSON string
 * stored under key 'VIEWER_MODE'). Uses execFile (no shell) over
 * docker-exec psql so the pgsql client doesn't need to be on the
 * runner's PATH.
 */
import { execFileSync } from "node:child_process";

const DOCKER_BIN = process.env.DOCKER_BIN ?? "/Applications/Docker.app/Contents/Resources/bin/docker";
const DB_CONTAINER = process.env.E2E_DB_CONTAINER ?? "veil-prototype-db-1";

function sql(query: string): void {
  execFileSync(
    DOCKER_BIN,
    ["exec", DB_CONTAINER, "psql", "-U", "veil", "-d", "veil", "-t", "-A", "-c", query],
    { stdio: "pipe" },
  );
}

export type ViewerMode = "html" | "pdf";

/**
 * Sets `VIEWER_MODE` in the system_settings table. `null` deletes the
 * row, restoring the default-of-default (which lib/data/settings.ts
 * resolves to "html" via DEFAULT_VIEWER_MODE).
 */
export async function setViewerMode(mode: ViewerMode | null): Promise<void> {
  if (mode === null) {
    sql(`DELETE FROM system_settings WHERE key = 'VIEWER_MODE';`);
    return;
  }
  sql(
    `INSERT INTO system_settings (id, key, value, "updatedBy", "updatedAt") ` +
      `VALUES ('VIEWER_MODE_ROW', 'VIEWER_MODE', '"${mode}"', 'e2e-d1', NOW()) ` +
      `ON CONFLICT (key) DO UPDATE SET value = '"${mode}"', "updatedBy" = 'e2e-d1', "updatedAt" = NOW();`,
  );
}
