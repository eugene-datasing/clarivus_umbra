"use server";

import { prisma } from "@/lib/db/prisma";
import { createAuditEntry } from "@/lib/data/audit";
import { rebuildContentJson } from "@/lib/pipeline/rebuild-content";
import { requireUser } from "@/lib/auth/session";
import { authorizeForDocument, authorizeForDetection, authorizeForCase } from "@/lib/auth/authorize";
import { createManualDetectionSchema } from "@/lib/validation/schemas";

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
    select: { name: true, caseId: true },
  });
  if (!doc) throw new Error("Document not found");

  // Wrap all DB writes in a transaction for atomicity
  const detection = await prisma.$transaction(async (tx) => {
    // Create the detection record
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

    // Create feedback example (for AI learning)
    await tx.feedbackExample.create({
      data: {
        caseId: doc.caseId,
        documentId: validated.documentId,
        detectionId: det.id,
        type: validated.type,
        text: validated.text,
        ground: validated.ground || null,
        reasoning: validated.reasoning || "",
        createdBy: user.name,
      },
    });

    // Increment document detection count
    await tx.document.update({
      where: { id: validated.documentId },
      data: { detectionCount: { increment: 1 } },
    });

    // Increment case redaction count
    await tx.case.update({
      where: { id: doc.caseId },
      data: { redactionCount: { increment: 1 } },
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
    description: `Manually added detection: "${validated.text.substring(0, 40)}${validated.text.length > 40 ? "..." : ""}"`,
    target: doc.name,
    caseId: doc.caseId,
    detail: `Type: ${validated.type}, Page: ${validated.page}${validated.ground ? `, Ground: ${validated.ground}` : ""}`,
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
    include: { document: { select: { name: true, caseId: true, detectionCount: true } } },
  });
  if (!detection) throw new Error("Detection not found");

  if (detection.source !== "manual") {
    throw new Error("Only manual detections can be deleted");
  }

  const documentId = detection.documentId;
  const caseId = detection.document.caseId;

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
    const caseData = await tx.case.findUnique({
      where: { id: caseId },
      select: { redactionCount: true },
    });
    if (caseData && caseData.redactionCount > 0) {
      await tx.case.update({
        where: { id: caseId },
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
    description: `Deleted manual detection: "${detection.text.substring(0, 40)}${detection.text.length > 40 ? "..." : ""}"`,
    target: detection.document.name,
    caseId,
    detail: `Type: ${detection.type}, Page: ${detection.page}`,
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
  caseId: string,
): Promise<{ matches: CrossDocMatch[] }> {
  const user = await requireUser();
  await authorizeForCase(user, caseId);
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
      document: { caseId },
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
