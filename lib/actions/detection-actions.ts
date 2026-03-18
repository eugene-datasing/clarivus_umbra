"use server";

import { prisma } from "@/lib/db/prisma";
import { createAuditEntry } from "@/lib/data/audit";

export async function acceptDetection(detectionId: string, ground?: string) {
  const detection = await prisma.detection.findUnique({
    where: { id: detectionId },
    include: { document: { select: { name: true, caseId: true } } },
  });
  if (!detection) throw new Error("Detection not found");

  const appliedGround = ground || detection.suggestedGround;

  await prisma.detection.update({
    where: { id: detectionId },
    data: {
      status: "accepted",
      appliedGround,
      reviewedAt: new Date(),
    },
  });

  await createAuditEntry({
    userName: "K. Williams",
    userRole: "Reviewer",
    type: "review",
    description: `Accepted detection: "${detection.text.substring(0, 40)}${detection.text.length > 40 ? "..." : ""}"`,
    target: detection.document.name,
    caseId: detection.document.caseId,
    detail: `Detection ${detectionId}, Confidence: ${detection.confidence}%, Ground: ${appliedGround}`,
  });

  return { success: true };
}

export async function rejectDetection(detectionId: string, reason?: string) {
  const detection = await prisma.detection.findUnique({
    where: { id: detectionId },
    include: { document: { select: { name: true, caseId: true } } },
  });
  if (!detection) throw new Error("Detection not found");

  await prisma.detection.update({
    where: { id: detectionId },
    data: {
      status: "rejected",
      appliedGround: null,
      reviewedAt: new Date(),
    },
  });

  await createAuditEntry({
    userName: "K. Williams",
    userRole: "Reviewer",
    type: "review",
    description: `Rejected detection: "${detection.text.substring(0, 40)}${detection.text.length > 40 ? "..." : ""}"`,
    target: detection.document.name,
    caseId: detection.document.caseId,
    detail: reason ? `Reason: ${reason}` : undefined,
  });

  return { success: true };
}

export async function revertDetection(detectionId: string) {
  await prisma.detection.update({
    where: { id: detectionId },
    data: {
      status: "pending",
      appliedGround: null,
      reviewedAt: null,
    },
  });

  return { success: true };
}

export async function applyGround(detectionId: string, groundId: string) {
  await prisma.detection.update({
    where: { id: detectionId },
    data: { appliedGround: groundId },
  });

  return { success: true };
}

export async function bulkAcceptDetections(detectionIds: string[], ground?: string) {
  const result = await prisma.detection.updateMany({
    where: { id: { in: detectionIds } },
    data: {
      status: "accepted",
      appliedGround: ground || undefined,
      reviewedAt: new Date(),
    },
  });

  return { count: result.count };
}

export async function bulkRejectDetections(detectionIds: string[]) {
  const result = await prisma.detection.updateMany({
    where: { id: { in: detectionIds } },
    data: {
      status: "rejected",
      appliedGround: null,
      reviewedAt: new Date(),
    },
  });

  return { count: result.count };
}
