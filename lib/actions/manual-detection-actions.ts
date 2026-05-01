"use server";

import { prisma } from "@/lib/db/prisma";
import { createAuditEntry } from "@/lib/data/audit";
import { rebuildContentJson } from "@/lib/pipeline/rebuild-content";
import { requireUser } from "@/lib/auth/session";
import { authorizeForDocument, authorizeForDetection, authorizeForBatch } from "@/lib/auth/authorize";
import { createManualDetectionSchema } from "@/lib/validation/schemas";
import { calculateBBoxAll, type WordLayout } from "@/lib/pipeline/bbox";

// ---------------------------------------------------------------------------
// Create a manual detection
// ---------------------------------------------------------------------------

interface CreateManualDetectionInput {
  documentId: string;
  text: string;
  type: string;
  page: number;
  ground?: string;
  reasoning?: string;
}

export async function createManualDetection(input: CreateManualDetectionInput) {
  const validated = createManualDetectionSchema.parse(input);
  const user = await requireUser();
  await authorizeForDocument(user, validated.documentId);

  const doc = await prisma.document.findUnique({
    where: { id: validated.documentId },
    select: { name: true, batchId: true },
  });
  if (!doc) throw new Error("Document not found");

  // Wrap all DB writes in a transaction for atomicity
  const detection = await prisma.$transaction(async (tx) => {
    // Create the detection record. Bbox fields default to 0 in the
    // schema; we resolve and patch them in immediately below so the
    // canvas overlays render the new detection without waiting for a
    // separate bbox-rebuild pass. Pre-2026-04-27 the bbox stayed at
    // 0 indefinitely, which the PDF-mode overlay filtered out and
    // the reviewer saw as "Add Detection didn't redact anything"
    // (Bug 2 from cr24 verification). The HTML branch never showed
    // this gap because it renders detections by text-search rather
    // than bbox.
    const det = await tx.detection.create({
      data: {
        documentId: validated.documentId,
        type: validated.type,
        text: validated.text,
        confidence: 100,
        page: validated.page,
        suggestedGround: validated.ground || null,
        appliedGround: validated.ground || null,
        status: "accepted",
        reasoning: validated.reasoning || "Manually identified by reviewer",
        piConsideration: "",
        aiExplanation: "Manually added by reviewer — this item was not detected by AI.",
        source: "manual",
        reviewedBy: user.name,
        reviewedAt: new Date(),
      },
    });

    // Resolve bbox via the same pipeline helper AI detections use —
    // calculateBBoxAll matches the detection text against the page's
    // stored word polygons (Azure DI output, persisted in
    // DocumentPage.layoutJson during the processing pipeline). The
    // returned `BBox[]` is one box per visual line of match.
    //
    // `skipLongTextGuard: true` opts out of the 80-char short-circuit
    // that the helper applies for AI "long narrative summary"
    // detections. Manual selections come from literal user-dragged
    // text on the rendered page, so a polygon match is meaningful at
    // any length — see Bug 5 from cr25 verification (2026-04-27).
    //
    // Multi-line handling mirrors `process.ts:782-784` — the AI
    // pipeline writes ONE Detection row per visual-line bbox so each
    // line's redaction renders independently. The first bbox patches
    // the existing row (the one we just created above); each
    // additional bbox spawns a sibling Detection row sharing every
    // metadata field except the bbox itself. Counters bump per
    // sibling so detectionCount / redactionCount stay honest. A
    // single FeedbackExample covers the whole reviewer action — one
    // physical drag-and-click is one logical training signal,
    // regardless of how many visual lines the selection wraps onto.
    //
    // Edge cases left at zero bbox (visible in sidebar, invisible on
    // canvas, redacted at export via PyMuPDF Tier-2 text-search):
    //   - The page has no layoutJson (legacy document, ingest issue,
    //     non-OCR'd image-only PDF).
    //   - The detection text doesn't match any word polygon (OCR
    //     misread, user edited the textarea so the visible text and
    //     the typed text diverge).
    const page = await tx.documentPage.findUnique({
      where: {
        documentId_pageNumber: {
          documentId: validated.documentId,
          pageNumber: validated.page,
        },
      },
      select: { layoutJson: true, width: true, height: true },
    });
    const words = (page?.layoutJson ?? null) as unknown as WordLayout[] | null;
    const bboxes = words
      ? calculateBBoxAll(
          validated.text,
          words,
          page?.width ?? undefined,
          page?.height ?? undefined,
          { skipLongTextGuard: true },
        )
      : [];
    let extraSiblingCount = 0;
    if (bboxes.length === 0) {
      // Warn-only — the detection still exports correctly via Tier-2
      // text-search; only the in-app preview misses the visual.
      console.warn(
        `[createManualDetection] no bbox match for text=${JSON.stringify(
          validated.text.slice(0, 60),
        )} on documentId=${validated.documentId} page=${validated.page} ` +
          `(words=${words?.length ?? "no-layoutJson"})`,
      );
    } else {
      const [firstBbox, ...extraBboxes] = bboxes;
      // Patch the just-created row with the FIRST bbox.
      await tx.detection.update({
        where: { id: det.id },
        data: {
          posX: firstBbox.posX,
          posY: firstBbox.posY,
          posW: firstBbox.posW,
          posH: firstBbox.posH,
        },
      });
      // Mirror the patched bbox onto the in-memory return so the
      // post-transaction logic (rebuildContentJson, audit) sees the
      // resolved coordinates without a re-read.
      det.posX = firstBbox.posX;
      det.posY = firstBbox.posY;
      det.posW = firstBbox.posW;
      det.posH = firstBbox.posH;

      // Spawn sibling rows for additional visual lines. Each sibling
      // gets its own Detection.id and its own line-specific bbox but
      // shares every other field with the original. Same pattern as
      // the AI pipeline's enrichedDetections loop.
      for (const extra of extraBboxes) {
        await tx.detection.create({
          data: {
            documentId: validated.documentId,
            type: validated.type,
            text: validated.text,
            confidence: 100,
            page: validated.page,
            suggestedGround: validated.ground || null,
            appliedGround: validated.ground || null,
            status: "accepted",
            reasoning: validated.reasoning || "Manually identified by reviewer",
            piConsideration: "",
            aiExplanation: "Manually added by reviewer — this item was not detected by AI.",
            source: "manual",
            reviewedBy: user.name,
            reviewedAt: new Date(),
            posX: extra.posX,
            posY: extra.posY,
            posW: extra.posW,
            posH: extra.posH,
          },
        });
        extraSiblingCount += 1;
      }
    }

    // Create feedback example (for AI learning). One per reviewer
    // action — siblings share the same training signal.
    await tx.feedbackExample.create({
      data: {
        batchId: doc.batchId,
        documentId: validated.documentId,
        detectionId: det.id,
        type: validated.type,
        text: validated.text,
        ground: validated.ground || null,
        reasoning: validated.reasoning || "",
        createdBy: user.name,
      },
    });

    // Increment document detection count by 1 (original row) plus
    // however many sibling rows we created above.
    const totalNewRows = 1 + extraSiblingCount;
    await tx.document.update({
      where: { id: validated.documentId },
      data: { detectionCount: { increment: totalNewRows } },
    });

    // Increment case redaction count — same total. detectionCount and
    // redactionCount on Case track the same thing post-2026-04-27 fix
    // (one row = one redaction).
    await tx.case.update({
      where: { id: doc.batchId },
      data: { redactionCount: { increment: totalNewRows } },
    });

    return det;
  });

  // Rebuild contentJson to include the new detection in highlighted segments
  await rebuildContentJson(validated.documentId);

  // Audit trail
  await createAuditEntry({
    userId: user.id,
    userName: user.name,
    userRole: user.role,
    type: "manual_detection",
    description: `Manually added detection (${validated.type})`,
    target: doc.name,
    batchId: doc.batchId,
    detail: `Detection ${detection.id}, Page: ${validated.page}${validated.ground ? `, Ground: ${validated.ground}` : ""}`,
  });

  return { success: true, detectionId: detection.id };
}

// ---------------------------------------------------------------------------
// Delete a manual detection
// ---------------------------------------------------------------------------

export async function deleteManualDetection(detectionId: string) {
  const user = await requireUser();
  await authorizeForDetection(user, detectionId);

  const detection = await prisma.detection.findUnique({
    where: { id: detectionId },
    include: { document: { select: { name: true, batchId: true, detectionCount: true } } },
  });
  if (!detection) throw new Error("Detection not found");

  if (detection.source !== "manual") {
    throw new Error("Only manual detections can be deleted");
  }

  const documentId = detection.documentId;
  const batchId = detection.document.batchId;

  // Wrap all DB writes in a transaction for atomicity
  await prisma.$transaction(async (tx) => {
    // Delete the associated feedback example
    await tx.feedbackExample.deleteMany({
      where: { detectionId },
    });

    // Delete detection history (cascades via schema, but be explicit)
    await tx.detectionHistory.deleteMany({
      where: { detectionId },
    });

    // Delete the detection itself
    await tx.detection.delete({
      where: { id: detectionId },
    });

    // Decrement document detection count (prevent going negative)
    if (detection.document.detectionCount > 0) {
      await tx.document.update({
        where: { id: documentId },
        data: { detectionCount: { decrement: 1 } },
      });
    }

    // Decrement case redaction count (prevent going negative)
    const batchData = await tx.case.findUnique({
      where: { id: batchId },
      select: { redactionCount: true },
    });
    if (batchData && batchData.redactionCount > 0) {
      await tx.case.update({
        where: { id: batchId },
        data: { redactionCount: { decrement: 1 } },
      });
    }
  });

  // Rebuild contentJson to remove the deleted detection
  await rebuildContentJson(documentId);

  // Audit trail
  await createAuditEntry({
    userId: user.id,
    userName: user.name,
    userRole: user.role,
    type: "manual_detection_deleted",
    description: `Deleted manual detection (${detection.type})`,
    target: detection.document.name,
    batchId,
    detail: `Detection ${detectionId}, Page: ${detection.page}`,
  });

  return { success: true };
}

// ---------------------------------------------------------------------------
// Suggest a custom rule from a manual detection
// ---------------------------------------------------------------------------

export async function suggestCustomRule(detectionId: string) {
  const user = await requireUser();
  await authorizeForDetection(user, detectionId);

  const detection = await prisma.detection.findUnique({
    where: { id: detectionId },
    select: { type: true, text: true, source: true },
  });
  if (!detection) throw new Error("Detection not found");

  // Check if a similar rule already exists
  const existing = await prisma.customRule.findFirst({
    where: {
      keywords: { contains: detection.text, mode: "insensitive" },
      status: { not: "Disabled" },
    },
  });

  if (existing) {
    return { success: true, ruleId: existing.id, alreadyExists: true };
  }

  // Create a draft custom rule
  const rule = await prisma.customRule.create({
    data: {
      name: `Auto: ${detection.text.substring(0, 50)}`,
      type: "Keyword",
      status: "Draft",
      matchMode: "Fuzzy",
      keywords: detection.text,
      scope: "All Documents",
      priority: "Medium",
      suggestedGround: null,
      description: `Auto-suggested from manual detection by ${user.name}. Original type: ${detection.type}.`,
    },
  });

  return { success: true, ruleId: rule.id, alreadyExists: false };
}

// ---------------------------------------------------------------------------
// Cross-document scan
// ---------------------------------------------------------------------------

interface CrossDocMatch {
  documentId: string;
  documentName: string;
  pageNumber: number;
  snippet: string;
}

export async function scanCrossDocument(
  detectionId: string,
  batchId: string,
): Promise<{ matches: CrossDocMatch[] }> {
  const user = await requireUser();
  await authorizeForBatch(user, batchId);
  const detection = await prisma.detection.findUnique({
    where: { id: detectionId },
    select: { text: true, documentId: true },
  });
  if (!detection) throw new Error("Detection not found");

  const searchText = detection.text.trim();
  if (searchText.length < 3) {
    return { matches: [] };
  }

  // Search DocumentPage text across all docs in this case (excluding current doc)
  const pages = await prisma.documentPage.findMany({
    where: {
      document: { batchId },
      documentId: { not: detection.documentId },
      text: { contains: searchText, mode: "insensitive" },
    },
    include: {
      document: { select: { name: true } },
    },
    take: 50, // Limit results
  });

  const matches: CrossDocMatch[] = pages.map((p) => {
    // Extract a snippet around the match
    const lower = p.text.toLowerCase();
    const idx = lower.indexOf(searchText.toLowerCase());
    const snippetStart = Math.max(0, idx - 40);
    const snippetEnd = Math.min(p.text.length, idx + searchText.length + 40);
    const snippet =
      (snippetStart > 0 ? "..." : "") +
      p.text.slice(snippetStart, snippetEnd) +
      (snippetEnd < p.text.length ? "..." : "");

    return {
      documentId: p.documentId,
      documentName: p.document.name,
      pageNumber: p.pageNumber,
      snippet,
    };
  });

  return { matches };
}

// ---------------------------------------------------------------------------
// Bulk create detections from cross-doc scan results
// ---------------------------------------------------------------------------

interface BulkCrossDocInput {
  sourceDetectionId: string;
  targets: Array<{
    documentId: string;
    pageNumber: number;
  }>;
}

export async function bulkCreateCrossDocDetections(input: BulkCrossDocInput) {
  const user = await requireUser();
  await authorizeForDetection(user, input.sourceDetectionId);

  const source = await prisma.detection.findUnique({
    where: { id: input.sourceDetectionId },
    select: {
      type: true,
      text: true,
      appliedGround: true,
      suggestedGround: true,
      reasoning: true,
    },
  });
  if (!source) throw new Error("Source detection not found");

  let created = 0;
  const affectedDocIds = new Set<string>();

  for (const target of input.targets) {
    // Check if this text already has a detection in the target document
    const existing = await prisma.detection.findFirst({
      where: {
        documentId: target.documentId,
        text: { equals: source.text, mode: "insensitive" },
      },
    });

    if (existing) continue; // Skip duplicates

    // Wrap detection creation + counter increment in a transaction
    await prisma.$transaction(async (tx) => {
      await tx.detection.create({
        data: {
          documentId: target.documentId,
          type: source.type,
          text: source.text,
          confidence: 100,
          page: target.pageNumber,
          suggestedGround: source.suggestedGround,
          appliedGround: source.appliedGround,
          status: "accepted",
          reasoning: source.reasoning || "Cross-document match from manual detection",
          piConsideration: "",
          aiExplanation: `Cross-document match: same text found and applied from another document in this case.`,
          source: "manual",
          reviewedBy: user.name,
          reviewedAt: new Date(),
        },
      });

      // Increment detection count
      await tx.document.update({
        where: { id: target.documentId },
        data: { detectionCount: { increment: 1 } },
      });
    });

    affectedDocIds.add(target.documentId);
    created++;
  }

  // Rebuild content for all affected documents
  for (const docId of affectedDocIds) {
    await rebuildContentJson(docId);
  }

  return { success: true, created };
}
