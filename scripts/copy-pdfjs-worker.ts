/**
 * Copy the pdf.js worker bundled by pdfjs-dist into public/ so the
 * PdfViewer can load it same-origin rather than from unpkg.com.
 *
 * Runs as a postinstall hook (package.json). Idempotent: overwrites
 * public/pdf.worker.min.mjs each install so the worker stays pinned
 * to the exact pdfjs-dist version react-pdf resolved.
 *
 * Why same-origin:
 *   - unpkg.com is a third-party CDN; a data-sovereignty platform
 *     should not depend on it at runtime.
 *   - strict CSP and air-gapped deployments cannot reach unpkg.
 *   - version drift: pdfjs.version at build time must match the
 *     worker; pulling from unpkg relies on npm version resolution
 *     being consistent across client and package lock.
 *
 * Why postinstall (option a from the Slice A scope):
 *   - No binary blob in git (public/pdf.worker.min.mjs is gitignored).
 *   - Version auto-tracks the resolved pdfjs-dist version.
 *   - Single dependency on Node's fs, no extra tooling or webpack
 *     config surface.
 */
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

const SRC = join(
  process.cwd(),
  "node_modules",
  "pdfjs-dist",
  "build",
  "pdf.worker.min.mjs",
);
const DEST = join(process.cwd(), "public", "pdf.worker.min.mjs");

if (!existsSync(SRC)) {
  // Soft-warn: CI install steps run before node_modules is fully
  // resolved in some layouts. Don't hard-fail — PdfViewer will 404
  // at runtime which is a louder, more diagnosable signal.
  console.warn(`[copy-pdfjs-worker] source not found at ${SRC}; skipping.`);
  process.exit(0);
}

mkdirSync(dirname(DEST), { recursive: true });
copyFileSync(SRC, DEST);
console.log(`[copy-pdfjs-worker] copied ${SRC} -> ${DEST}`);
