/**
 * Duplicate detection for uploaded documents.
 *
 * Provides exact-match detection via SHA-256 content hashing and
 * near-duplicate detection via trigram Jaccard similarity.
 */

import { createHash } from "crypto";
import { prisma } from "@/lib/db/prisma";
import { createAuditEntry } from "@/lib/data/audit";

/** Similarity threshold for near-duplicate detection (0-1). */
const NEAR_DUPLICATE_THRESHOLD = 0.85;

/** Minimum text length to bother with near-duplicate analysis. */
const MIN_TEXT_LENGTH = 100;

export interface DuplicateResult {
  contentHash: string;
  isExactDuplicate: boolean;
  nearDuplicateOf: string | null;
  nearDuplicateSimilarity: number | null;
  duplicateGroup: string | null;
}

/**
 * Compute SHA-256 hash of the document's extracted text.
 *
 * Normalises whitespace before hashing to avoid false negatives from
 * trivial formatting differences.
 */
export function computeContentHash(text: string): string {
  const normalised = text.replace(/\s+/g, " ").trim().toLowerCase();
  return createHash("sha256").update(normalised, "utf8").digest("hex");
}

/**
 * Build a set of character trigrams from text.
 */
function trigrams(text: string): Set<string> {
  const normalised = text.replace(/\s+/g, " ").trim().toLowerCase();
  const result = new Set<string>();
  for (let i = 0; i <= normalised.length - 3; i++) {
    result.add(normalised.substring(i, i + 3));
  }
  return result;
}

/**
 * Compute Jaccard similarity between two trigram sets.
 */
function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  let intersection = 0;
  for (const tri of a) {
    if (b.has(tri)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Detect duplicates for a document after text extraction.
 *
 * 1. Computes SHA-256 of the full extracted text
 * 2. Checks for exact duplicates (same hash) in the same case
 * 3. If no exact match, checks for near-duplicates using trigram similarity
 * 4. Updates the document's contentHash and duplicateGroup fields
 * 5. Creates audit entries for detected duplicates
 */
export async function detectDuplicates(
  docId: string,
  caseId: string,
  fullText: string,
): Promise<DuplicateResult> {
  const contentHash = computeContentHash(fullText);

  // Check for exact duplicates (same hash, same case, different document)
  const exactMatch = await prisma.document.findFirst({
    where: {
      caseId,
      contentHash,
      id: { not: docId },
    },
    select: { id: true, name: true, duplicateGroup: true },
  });

  if (exactMatch) {
    // Use the existing duplicate group or create one from the original doc ID
    const group = exactMatch.duplicateGroup || `dup-${exactMatch.id.slice(0, 8)}`;

    // Ensure the original document is also tagged
    if (!exactMatch.duplicateGroup) {
      await prisma.document.update({
        where: { id: exactMatch.id },
        data: { duplicateGroup: group },
      });
    }

    await prisma.document.update({
      where: { id: docId },
      data: { contentHash, duplicateGroup: group },
    });

    const currentDoc = await prisma.document.findUnique({
      where: { id: docId },
      select: { name: true },
    });

    await createAuditEntry({
      userName: "Veil AI",
      userRole: "system",
      type: "duplicate_detected",
      description: `Exact duplicate detected: "${currentDoc?.name}" matches "${exactMatch.name}"`,
      target: currentDoc?.name || docId,
      caseId,
      detail: `Content hash: ${contentHash.slice(0, 16)}..., Group: ${group}`,
    });

    return {
      contentHash,
      isExactDuplicate: true,
      nearDuplicateOf: null,
      nearDuplicateSimilarity: null,
      duplicateGroup: group,
    };
  }

  // No exact match — check for near-duplicates if text is long enough
  if (fullText.length >= MIN_TEXT_LENGTH) {
    const docTrigrams = trigrams(fullText);

    // Load other documents in the same case that have been processed
    const otherDocs = await prisma.document.findMany({
      where: {
        caseId,
        id: { not: docId },
        contentHash: { not: null },
      },
      select: { id: true, name: true, duplicateGroup: true },
    });

    for (const other of otherDocs) {
      // Load the other document's text from its pages
      const pages = await prisma.documentPage.findMany({
        where: { documentId: other.id },
        orderBy: { pageNumber: "asc" },
        select: { text: true },
      });
      const otherText = pages.map((p) => p.text).join(" ");
      if (otherText.length < MIN_TEXT_LENGTH) continue;

      const otherTrigrams = trigrams(otherText);
      const similarity = jaccardSimilarity(docTrigrams, otherTrigrams);

      if (similarity >= NEAR_DUPLICATE_THRESHOLD) {
        const group = other.duplicateGroup || `dup-${other.id.slice(0, 8)}`;

        if (!other.duplicateGroup) {
          await prisma.document.update({
            where: { id: other.id },
            data: { duplicateGroup: group },
          });
        }

        await prisma.document.update({
          where: { id: docId },
          data: { contentHash, duplicateGroup: group },
        });

        const currentDoc = await prisma.document.findUnique({
          where: { id: docId },
          select: { name: true },
        });

        await createAuditEntry({
          userName: "Veil AI",
          userRole: "system",
          type: "duplicate_detected",
          description: `Near-duplicate detected: "${currentDoc?.name}" is ${Math.round(similarity * 100)}% similar to "${other.name}"`,
          target: currentDoc?.name || docId,
          caseId,
          detail: `Jaccard similarity: ${(similarity * 100).toFixed(1)}%, Group: ${group}`,
        });

        return {
          contentHash,
          isExactDuplicate: false,
          nearDuplicateOf: other.id,
          nearDuplicateSimilarity: similarity,
          duplicateGroup: group,
        };
      }
    }
  }

  // No duplicates found — just store the hash
  await prisma.document.update({
    where: { id: docId },
    data: { contentHash },
  });

  return {
    contentHash,
    isExactDuplicate: false,
    nearDuplicateOf: null,
    nearDuplicateSimilarity: null,
    duplicateGroup: null,
  };
}
