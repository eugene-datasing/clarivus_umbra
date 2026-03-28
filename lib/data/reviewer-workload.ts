/**
 * Reviewer workload data layer.
 *
 * Aggregates audit trail entries to compute per-reviewer activity metrics:
 * documents reviewed, detections handled, actions breakdown.
 */

import { prisma } from "@/lib/db/prisma";

export interface ReviewerRow {
  userId: string;
  userName: string;
  userRole: string;
  documentsReviewed: number;
  detectionsAccepted: number;
  detectionsRejected: number;
  totalActions: number;
  firstAction: string;
  lastAction: string;
}

export interface DailyActivity {
  date: string;
  count: number;
}

export interface ReviewerWorkloadData {
  generatedAt: string;
  totalReviewers: number;
  totalActions: number;
  avgActionsPerReviewer: number;
  reviewers: ReviewerRow[];
  dailyActivity: DailyActivity[];
}

const REVIEW_ACTION_TYPES = [
  "detection-accepted",
  "detection-rejected",
  "detection-reviewed",
  "detection-update",
  "review-submitted",
  "review-started",
  "senior-review",
  "senior-review-submitted",
  "sign-off",
  "signed-off",
  "ground-applied",
  "status-change",
];

export async function computeReviewerWorkload(): Promise<ReviewerWorkloadData> {
  const entries = await prisma.auditEntry.findMany({
    where: { type: { in: REVIEW_ACTION_TYPES } },
    orderBy: { timestamp: "asc" },
    select: {
      userId: true,
      userName: true,
      userRole: true,
      type: true,
      timestamp: true,
      target: true,
    },
  });

  // Per-reviewer aggregation
  const reviewerMap = new Map<
    string,
    {
      userName: string;
      userRole: string;
      documents: Set<string>;
      accepted: number;
      rejected: number;
      total: number;
      firstAction: Date;
      lastAction: Date;
    }
  >();

  // Daily activity aggregation
  const dailyMap = new Map<string, number>();

  for (const entry of entries) {
    const uid = entry.userId;
    if (!uid) continue;
    if (!reviewerMap.has(uid)) {
      reviewerMap.set(uid, {
        userName: entry.userName,
        userRole: entry.userRole,
        documents: new Set(),
        accepted: 0,
        rejected: 0,
        total: 0,
        firstAction: entry.timestamp,
        lastAction: entry.timestamp,
      });
    }

    const rev = reviewerMap.get(uid)!;
    rev.total++;
    rev.lastAction = entry.timestamp;

    if (entry.target) rev.documents.add(entry.target);

    if (entry.type === "detection-accepted") rev.accepted++;
    if (entry.type === "detection-rejected") rev.rejected++;

    // Daily count
    const day = entry.timestamp.toISOString().split("T")[0];
    dailyMap.set(day, (dailyMap.get(day) || 0) + 1);
  }

  const reviewers: ReviewerRow[] = Array.from(reviewerMap.entries())
    .map(([userId, r]) => ({
      userId,
      userName: r.userName,
      userRole: r.userRole,
      documentsReviewed: r.documents.size,
      detectionsAccepted: r.accepted,
      detectionsRejected: r.rejected,
      totalActions: r.total,
      firstAction: r.firstAction.toISOString().split("T")[0],
      lastAction: r.lastAction.toISOString().split("T")[0],
    }))
    .sort((a, b) => b.totalActions - a.totalActions);

  const dailyActivity = Array.from(dailyMap.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const totalActions = entries.length;
  const totalReviewers = reviewerMap.size;

  return {
    generatedAt: new Date().toISOString(),
    totalReviewers,
    totalActions,
    avgActionsPerReviewer: totalReviewers > 0 ? Math.round(totalActions / totalReviewers) : 0,
    reviewers,
    dailyActivity,
  };
}
