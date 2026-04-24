/**
 * Regression guard — the pdf.js worker MUST load from the same origin.
 *
 * Rationale: Veil is pitched as a data-sovereignty platform; its CSP
 * (next.config.ts) and air-gapped deploy story fall apart if the worker
 * script is pulled from unpkg.com or any other third-party CDN. Slice A
 * of the viewer rework replaced the unpkg CDN URL with a same-origin
 * path backed by a postinstall copy of node_modules/pdfjs-dist/build/
 * pdf.worker.min.mjs into public/.
 *
 * We assert this by source-parse rather than by importing the module —
 * importing components/review/pdf-viewer.tsx pulls in react-pdf →
 * pdfjs-dist, which needs a DOM and webpack-style bundler context. Not
 * worth setting up jsdom + a bundler for a one-line string check.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const VIEWER_PATH = join(process.cwd(), "components/review/pdf-viewer.tsx");

describe("pdf.js worker URL (Slice A data-sovereignty regression guard)", () => {
  const source = readFileSync(VIEWER_PATH, "utf-8");

  it("assigns pdfjs.GlobalWorkerOptions.workerSrc to a same-origin path", () => {
    // Grab the right-hand-side of the workerSrc assignment as a
    // string literal. The regex deliberately tolerates `=`, leading
    // whitespace, quotes, and tsx comments between the key and
    // the literal so it doesn't break on minor formatting changes.
    const match = source.match(
      /pdfjs\.GlobalWorkerOptions\.workerSrc\s*=\s*["'`]([^"'`]+)["'`]/,
    );
    expect(match, "workerSrc assignment not found in pdf-viewer.tsx").not.toBeNull();
    const workerSrc = match![1];
    expect(workerSrc.startsWith("/"), `workerSrc should start with '/' (got: ${workerSrc})`).toBe(true);
  });

  it("does not reference unpkg.com in the workerSrc assignment", () => {
    expect(source).not.toMatch(/workerSrc\s*=\s*[^;]*unpkg\.com/);
  });

  it("does not reference any external CDN domain for the worker", () => {
    // Any of cdn.jsdelivr.net, cdnjs.cloudflare.com, jsdelivr.net, unpkg.com
    // would be a sovereignty regression.
    expect(source).not.toMatch(/workerSrc\s*=\s*[^;]*\b(unpkg|jsdelivr|cloudflare|skypack)\b/i);
  });
});
