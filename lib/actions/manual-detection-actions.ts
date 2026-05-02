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
  /** @deprecated Phase 5 — accepted for schema compatibility, no longer persisted. */
  ground?: string;
  reasoning?: string;
  note?: string;
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

  const detection = await prisma.$transaction(async (tx) => {
    const det = await tx.detection.create({
      data: {
        documentId: validated.documentId,
        type: validated.type,
        text: validated.text,
        confidence: 100,
        page: validated.page,
        status: "accepted",
        reasoning: validated.reasoning || "Manually identified by reviewer",
        note: validated.note ?? null,
        aiExplanation: "Manually added by reviewer — this item was not detected by AI.",
        source: "manual",
        reviewedBy: user.name,
        reviewedAt: new Date(),
      },
    });

    // Resolve bbox via the same helper AI detections use. One row per
    // visual line — the first patches the row created above; extras
    // spawn sibling rows so each line redacts independently. Edge
    // cases (missing layoutJson, OCR misread) leave bbox at zero, in
    // which case Tier-2 PyMuPDF text-search still redacts at export.
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
      console.warn(
        `[createManualDetection] no bbox match for text=${JSON.stringify(
          validated.text.slice(0, 60),
        )} on documentId=${validated.documentId} page=${validated.page} ` +
          `(words=${words?.length ?? "no-layoutJson"})`,
      );
    } else {
      const [firstBbox, ...extraBboxes] = bboxes;
      await tx.detection.update({
        where: { id: det.id },
        data: {
          posX: firstBbox.posX,
          posY: firstBbox.posY,
          posW: firstBbox.posW,
          posH: firstBbox.posH,
        },
      });
      det.posX = firstBbox.posX;
      det.posY = firstBbox.posY;
      det.posW = firstBbox.posW;
      det.posH = firstBbox.posH;

      for (const extra of extraBboxes) {
        await tx.detection.create({
          data: {
            documentId: validated.documentId,
            type: validated.type,
            text: validated.text,
            confidence: 100,
            page: validated.page,
            status: "accepted",
            reasoning: validated.reasoning || "Manually identified by reviewer",
            note: validated.note ?? null,
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

    const totalNewRows = 1 + extraSiblingCount;
    await tx.document.update({
      where: { id: validated.documentId },
      data: { detectionCount: { increment: totalNewRows } },
    });

    await tx.batch.update({
      where: { id: doc.batchId },
      data: { redactionCount: { increment: totalNewRows } },
    });

    return det;
  });

  await rebuildContentJson(validated.documentId);

  await createAuditEntry({
    userId: user.id,
    userName: user.name,
    userRole: user.role,
    type: "manual_detection",
    description: `Manually added detection (${validated.type})`,
    target: doc.name,
    batchId: doc.batchId,
    detail: `Detection ${detection.id}, Page: ${validated.page}`,
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

  await prisma.$transaction(async (tx) => {
    await tx.detectionHistory.deleteMany({
      where: { detectionId },
    });

    await tx.detection.delete({
      where: { id: detectionId },
    });

    if (detection.document.detectionCount > 0) {
      await tx.document.update({
        where: { id: documentId },
        data: { detectionCount: { decrement: 1 } },
      });
    }

    const batchData = await tx.batch.findUnique({
      where: { id: batchId },
      select: { redactionCount: true },
    });
    if (batchData && batchData.redactionCount > 0) {
      await tx.batch.update({
        where: { id: batchId },
        data: { redactionCount: { decrement: 1 } },
      });
    }
  });

  await rebuildContentJson(documentId);

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

  const existing = await prisma.customRule.findFirst({
    where: {
      keywords: { contains: detection.text, mode: "insensitive" },
      status: { not: "Disabled" },
    },
  });

  if (existing) {
    return { success: true, ruleId: existing.id, alreadyExists: true };
  }

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

  const pages = await prisma.documentPage.findMany({
    where: {
      document: { batchId },
      documentId: { not: detection.documentId },
      text: { contains: searchText, mode: "insensitive" },
    },
    include: {
      document: { select: { name: true } },
    },
    take: 50,
  });

  const matches: CrossDocMatch[] = pages.map((p) => {
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
      reasoning: true,
      note: true,
    },
  });
  if (!source) throw new Error("Source detection not found");

  let created = 0;
  const affectedDocIds = new Set<string>();

  for (const target of input.targets) {
    const existing = await prisma.detection.findFirst({
      where: {
        documentId: target.documentId,
        text: { equals: source.text, mode: "insensitive" },
      },
    });

    if (existing) continue;

    await prisma.$transaction(async (tx) => {
      await tx.detection.create({
        data: {
          documentId: target.documentId,
          type: source.type,
          text: source.text,
          confidence: 100,
          page: target.pageNumber,
          status: "accepted",
          reasoning: source.reasoning || "Cross-document match from manual detection",
          note: source.note ?? null,
          aiExplanation: `Cross-document match: same text found and applied from another document in this case.`,
          source: "manual",
          reviewedBy: user.name,
          reviewedAt: new Date(),
        },
      });

      await tx.document.update({
        where: { id: target.documentId },
        data: { detectionCount: { increment: 1 } },
      });
    });

    affectedDocIds.add(target.documentId);
    created++;
  }

  for (const docId of affectedDocIds) {
    await rebuildContentJson(docId);
  }

  return { success: true, created };
}
