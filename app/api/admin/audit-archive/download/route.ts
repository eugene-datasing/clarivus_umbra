/**
 * Cross-batch audit archive download (admin-only).
 *
 * Lists every archived audit chain under `archives/{YYYY}/...`,
 * re-verifies each chain at download time (per Amendment 8 — never
 * trust the cached `chainValid` in PurgeLog), and bundles the
 * canonical artefacts into a single ZIP.
 *
 * The download intentionally re-verifies rather than trusting
 * PurgeLog.chainValid: the archive blob may have been tampered with
 * after the original write. Re-verification reads the JSONL exactly
 * as it sits in storage today and recomputes the SHA-256 + chain
 * verdict, then writes a top-level `verification-summary.json` into
 * the ZIP capturing each batch's verdict alongside the artefacts.
 */

import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { requireAdmin } from "@/lib/auth/authorize";
import { getStorage } from "@/lib/storage";
import { assembleZip, type ZipPart } from "@/lib/pipeline/zip";
import {
  deserialiseAuditJsonl,
  verifyAuditChainIntegrity,
} from "@/lib/jobs/audit-archive";
import { logger } from "@/lib/logger";
import { createHash } from "crypto";

const log = logger.child({
  module: "api",
  route: "/api/admin/audit-archive/download",
});

interface ArchiveSummary {
  batchId: string;
  archivePath: string;
  totalEntries: number;
  chainValid: boolean;
  brokenAt?: number;
  sha256OfJsonl: string;
  sha256Match: boolean;
  storedSha256: string | null;
  artefactsPresent: string[];
}

export async function GET() {
  const user = await requireUser();
  await requireAdmin(user);

  const storage = getStorage();

  let allKeys: string[];
  try {
    allKeys = await storage.listByPrefix("archives/");
  } catch (err) {
    log.error("[audit-archive/download] listByPrefix failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: "Failed to list archives" },
      { status: 500 },
    );
  }

  // Group keys by archive directory: archives/{YYYY}/{batchId}/...
  const byArchive = new Map<string, string[]>();
  for (const key of allKeys) {
    // Match `archives/<year>/<batchId>/<file>` (year is 4 digits).
    const m = key.match(/^archives\/(\d{4})\/([^/]+)\//);
    if (!m) continue;
    const dir = `archives/${m[1]}/${m[2]}`;
    const list = byArchive.get(dir) ?? [];
    list.push(key);
    byArchive.set(dir, list);
  }

  if (byArchive.size === 0) {
    return NextResponse.json(
      { error: "No archives present" },
      { status: 404 },
    );
  }

  const zipParts: ZipPart[] = [];
  const summaries: ArchiveSummary[] = [];

  for (const [archivePath, keys] of byArchive) {
    const batchId = archivePath.split("/").pop() ?? "unknown";

    // Pull every file under the archive directory into the ZIP, but
    // only re-verify when audit.jsonl exists.
    let storedJsonl: Buffer | null = null;
    let storedIntegrity: { sha256OfJsonl?: string } | null = null;

    for (const key of keys) {
      try {
        const data = await storage.download(key);
        const relName = key.substring("archives/".length);
        zipParts.push({ name: `archives/${relName}`, data });

        if (key.endsWith("/audit.jsonl")) {
          storedJsonl = data;
        }
        if (key.endsWith("/integrity.json")) {
          try {
            storedIntegrity = JSON.parse(data.toString("utf8"));
          } catch {
            storedIntegrity = null;
          }
        }
      } catch (err) {
        log.warn("[audit-archive/download] skipped artefact (download failed)", {
          key,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    let totalEntries = 0;
    let chainValid = false;
    let brokenAt: number | undefined;
    let sha256OfJsonl = "";

    if (storedJsonl) {
      sha256OfJsonl = createHash("sha256").update(storedJsonl).digest("hex");
      try {
        const entries = deserialiseAuditJsonl(storedJsonl.toString("utf8"));
        totalEntries = entries.length;
        const verdict = verifyAuditChainIntegrity(entries);
        chainValid = verdict.chainValid;
        brokenAt = verdict.brokenAt;
      } catch (err) {
        log.warn("[audit-archive/download] re-verify failed", {
          archivePath,
          error: err instanceof Error ? err.message : String(err),
        });
        chainValid = false;
      }
    }

    const storedSha = storedIntegrity?.sha256OfJsonl ?? null;

    summaries.push({
      batchId,
      archivePath,
      totalEntries,
      chainValid,
      ...(brokenAt !== undefined ? { brokenAt } : {}),
      sha256OfJsonl,
      sha256Match: storedSha !== null && storedSha === sha256OfJsonl,
      storedSha256: storedSha,
      artefactsPresent: keys.map((k) =>
        k.substring(archivePath.length + 1),
      ),
    });
  }

  const verificationSummary = {
    generatedAt: new Date().toISOString(),
    archiveCount: summaries.length,
    allChainsValid: summaries.every((s) => s.chainValid),
    allShaMatch: summaries.every((s) => s.sha256Match),
    archives: summaries,
  };

  zipParts.push({
    name: "verification-summary.json",
    data: Buffer.from(JSON.stringify(verificationSummary, null, 2), "utf8"),
  });

  const zipBuffer = await assembleZip(zipParts);

  const filename = `umbra-audit-archives-${new Date().toISOString().split("T")[0]}.zip`;

  log.info("[audit-archive/download] zip assembled", {
    archiveCount: summaries.length,
    bytes: zipBuffer.length,
    allChainsValid: verificationSummary.allChainsValid,
  });

  return new NextResponse(new Uint8Array(zipBuffer), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(zipBuffer.length),
    },
  });
}
