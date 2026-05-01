import { notFound } from "next/navigation";
import { getBatch } from "@/lib/data/batches";
import { getDocumentsForCase } from "@/lib/data/documents";
import { getWithholdingItems } from "@/lib/data/detections";
import { getQASimulation } from "@/lib/data/qa-simulation";
import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import { authorizeForBatch } from "@/lib/auth/authorize";
import QAClient from "./qa-client";

export default async function QAPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  await authorizeForBatch(user, id);

  const [batchData, documents, withholdingItems, simulation] = await Promise.all([
    getBatch(id),
    getDocumentsForCase(id),
    getWithholdingItems(id),
    getQASimulation(id),
  ]);

  if (!batchData) {
    notFound();
  }

  // Count s7 detections and those missing public interest consideration
  const docIds = documents.map((d) => d.id);
  const [s7Total, s7MissingPi, pendingDetections, processedDocs, verificationAudit] = await Promise.all([
    prisma.detection.count({
      where: {
        documentId: { in: docIds },
        status: "accepted",
        appliedGround: { startsWith: "s7" },
      },
    }),
    prisma.detection.count({
      where: {
        documentId: { in: docIds },
        status: "accepted",
        appliedGround: { startsWith: "s7" },
        piConsideration: "",
      },
    }),
    prisma.detection.count({
      where: {
        documentId: { in: docIds },
        status: "pending",
      },
    }),
    prisma.document.count({
      where: {
        batchId: id,
        status: { notIn: ["pending", "processing", "error"] },
      },
    }),
    prisma.auditEntry.findFirst({
      where: {
        batchId: id,
        type: "redaction-verification",
      },
      orderBy: { timestamp: "desc" },
      select: { description: true, detail: true, timestamp: true },
    }),
  ]);

  return (
    <QAClient
      requestId={id}
      batchData={batchData}
      documents={documents.map((d) => ({
        id: d.id,
        status: d.status,
        detectionCount: d.detectionCount,
      }))}
      withholdingItems={withholdingItems}
      s7Stats={{ total: s7Total, missingPi: s7MissingPi }}
      pendingDetections={pendingDetections}
      processedDocCount={processedDocs}
      verificationResult={verificationAudit ? {
        passed: verificationAudit.description.includes("passed"),
        detail: verificationAudit.detail ?? "",
        checkedAt: verificationAudit.timestamp.toISOString(),
      } : null}
      simulation={simulation}
    />
  );
}
