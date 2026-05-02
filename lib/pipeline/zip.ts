/**
 * ZIP assembly helper.
 *
 * Builds a ZIP buffer from an in-memory list of named parts. Used by
 * the export-package orchestrator and by Phase 6's audit-archive
 * (which assembles purged-batch CSV + integrity JSON into a single
 * archive blob per purged batch).
 */

import archiver from "archiver";

export interface ZipPart {
  name: string;
  data: Buffer | Uint8Array;
}

export function assembleZip(parts: ZipPart[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const archive = archiver("zip", { zlib: { level: 6 } });
    const chunks: Buffer[] = [];

    archive.on("data", (chunk: Buffer) => chunks.push(chunk));
    archive.on("end", () => resolve(Buffer.concat(chunks)));
    archive.on("error", reject);

    for (const part of parts) {
      archive.append(Buffer.from(part.data), { name: part.name });
    }

    archive.finalize();
  });
}
