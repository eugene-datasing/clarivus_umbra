/**
 * Compliance summary data layer.
 *
 * Aggregates case-level LGOIMA compliance metrics: status distribution,
 * statutory grounds usage, detection counts, and deadline adherence.
 */

import { prisma } from "@/lib/db/prisma";

export interface CaseComplianceRow {
  reference: string;
  requesterName: string;
  status: string;
  documentCount: number;
  detectionCount: number;
  acceptedCount: number;
  groundsUsed: string[];
  dateReceived: string;
  deadline: string;
  withinDeadline: boolean;
}

export interface GroundFrequency {
  ground: string;
  count: number;
}

export interface ComplianceSummaryData {
  generatedAt: string;
  totalCases: number;
  batchesByStatus: Record<string, number>;
  totalDocuments: number;
  totalDetections: number;
  totalAccepted: number;
  totalRejected: number;
  groundFrequency: GroundFrequency[];
  cases: CaseComplianceRow[];
  deadlineAdherence: { met: number; total: number; percentage: number };
}

export async function computeComplianceSummary(): Promise<ComplianceSummaryData> {
  const cases = await prisma.batch.findMany({
    orderBy: { dateReceived: "desc" },
    include: {
      documents: {
        select: {
          id: true,
          detections: {
            select: {
              status: true,
              appliedGround: true,
              suggestedGround: true,
            },
          },
        },
      },
    },
  });

  const batchesByStatus: Record<string, number> = {};
  const groundCounts = new Map<string, number>();
  let totalDocuments = 0;
  let totalDetections = 0;
  let totalAccepted = 0;
  let totalRejected = 0;
  let deadlineMet = 0;

  const caseRows: CaseComplianceRow[] = [];

  for (const c of cases) {
    // Status distribution
    batchesByStatus[c.status] = (batchesByStatus[c.status] || 0) + 1;

    // Document and detection counts
    const docCount = c.documents.length;
    totalDocuments += docCount;

    let caseDetections = 0;
    let caseAccepted = 0;
    const caseGrounds = new Set<string>();

    for (const doc of c.documents) {
      for (const det of doc.detections) {
        caseDetections++;
        totalDetections++;

        if (det.status === "accepted") {
          caseAccepted++;
          totalAccepted++;
          const ground = det.appliedGround || det.suggestedGround;
          if (ground) {
            caseGrounds.add(ground);
            groundCounts.set(ground, (groundCounts.get(ground) || 0) + 1);
          }
        } else if (det.status === "rejected") {
          totalRejected++;
        }
      }
    }

    // Deadline check
    const now = new Date();
    const deadline = c.deadline;
    const isComplete = ["released", "ready-export"].includes(c.status);
    const withinDeadline = isComplete || deadline >= now;
    if (withinDeadline) deadlineMet++;

    caseRows.push({
      reference: c.reference,
      requesterName: c.requesterName,
      status: c.status,
      documentCount: docCount,
      detectionCount: caseDetections,
      acceptedCount: caseAccepted,
      groundsUsed: Array.from(caseGrounds).sort(),
      dateReceived: c.dateReceived.toISOString().split("T")[0],
      deadline: c.deadline.toISOString().split("T")[0],
      withinDeadline,
    });
  }

  const groundFrequency = Array.from(groundCounts.entries())
    .map(([ground, count]) => ({ ground, count }))
    .sort((a, b) => b.count - a.count);

  return {
    generatedAt: new Date().toISOString(),
    totalCases: cases.length,
    batchesByStatus,
    totalDocuments,
    totalDetections,
    totalAccepted,
    totalRejected,
    groundFrequency,
    cases: caseRows,
    deadlineAdherence: {
      met: deadlineMet,
      total: cases.length,
      percentage: cases.length > 0 ? Math.round((deadlineMet / cases.length) * 100) : 0,
    },
  };
}
