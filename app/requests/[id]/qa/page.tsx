import { notFound } from "next/navigation";
import { getCase } from "@/lib/data/cases";
import { getDocumentsForCase } from "@/lib/data/documents";
import { getWithholdingItems } from "@/lib/data/detections";
import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import { authorizeForCase } from "@/lib/auth/authorize";
import QAClient from "./qa-client";

export default async function QAPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  await authorizeForCase(user, id);

  const [caseData, documents, withholdingItems] = await Promise.all([
    getCase(id),
    getDocumentsForCase(id),
    getWithholdingItems(id),
  ]);

  if (!caseData) {
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
        caseId: id,
        status: { notIn: ["pending", "processing", "error"] },
      },
    }),
    prisma.auditEntry.findFirst({
      where: {
        caseId: id,
        type: "redaction-verification",
      },
      orderBy: { timestamp: "desc" },
      select: { description: true, detail: true, timestamp: true },
    }),
  ]);

  return (
    <QAClient
      requestId={id}
      caseData={caseData}
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
    />
  );
}
