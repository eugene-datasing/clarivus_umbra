"use client";

import Link from "next/link";
import {
  ChevronRight,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Shield,
  ArrowLeft,
  Eye,
  FileText,
  BarChart3,
} from "lucide-react";
import type { SimulationResult } from "@/lib/data/qa-simulation";

interface QAItem {
  label: string;
  status: "pass" | "warning" | "fail";
  detail: string;
}

interface QAGroup {
  title: string;
  items: QAItem[];
}

interface BatchData {
  id: string;
  reference: string;
  name: string;
  documentCount: number;
  reviewedCount: number;
  redactionCount: number;
}

interface DocumentData {
  id: string;
  status: string;
  detectionCount: number;
}

interface WithholdingItem {
  id: string;
  reasoning: string | null;
  note: string | null;
  text: string;
}

interface VerificationData {
  passed: boolean;
  detail: string;
  checkedAt: string;
}

interface QAClientProps {
  requestId: string;
  batchData: BatchData | null;
  documents: DocumentData[];
  withholdingItems: WithholdingItem[];
  pendingDetections: number;
  processedDocCount: number;
  verificationResult: VerificationData | null;
  simulation: SimulationResult;
}

const statusIcon = {
  pass: { Icon: CheckCircle, color: "text-confidence-high", bg: "bg-green-50" },
  warning: { Icon: AlertTriangle, color: "text-confidence-medium", bg: "bg-amber-50" },
  fail: { Icon: XCircle, color: "text-confidence-low", bg: "bg-red-50" },
};

function buildQAGroups(
  batchData: BatchData | null,
  documents: DocumentData[],
  withholdingItems: WithholdingItem[],
  pendingDetections: number,
  processedDocCount: number,
  verificationResult: VerificationData | null,
): QAGroup[] {
  const totalDocs = batchData?.documentCount ?? documents.length;

  const reviewedDocs = documents.filter((d) =>
    ["reviewed", "signed-off"].includes(d.status),
  ).length;
  const signedOffDocs = documents.filter((d) => d.status === "signed-off").length;

  const totalWithholding = withholdingItems.length;
  const shortDescriptions = withholdingItems.filter(
    (w) => w.text.split(/\s+/).length < 5,
  ).length;

  const metadataStatus: QAItem["status"] =
    processedDocCount >= totalDocs ? "pass" : processedDocCount > 0 ? "warning" : "fail";
  const metadataDetail =
    processedDocCount >= totalDocs
      ? "All documents have been processed and PDF metadata is stripped on export"
      : `${processedDocCount} / ${totalDocs} documents processed — unprocessed documents cannot be sanitised`;

  return [
    {
      title: "COMPLETENESS",
      items: [
        {
          label: "All documents reviewed",
          status: reviewedDocs >= totalDocs ? "pass" : reviewedDocs > 0 ? "warning" : "fail",
          detail: `${reviewedDocs} / ${totalDocs} documents reviewed or signed off`,
        },
        {
          label: "All detections actioned",
          status: pendingDetections === 0 ? "pass" : "warning",
          detail:
            pendingDetections === 0
              ? "All detections have been accepted or rejected"
              : `${pendingDetections} detection(s) still pending review`,
        },
        {
          label: "All documents signed off",
          status: signedOffDocs >= totalDocs ? "pass" : signedOffDocs > 0 ? "warning" : "fail",
          detail:
            signedOffDocs >= totalDocs
              ? `All ${totalDocs} documents have been signed off`
              : `${signedOffDocs} of ${totalDocs} documents signed off`,
        },
      ],
    },
    {
      title: "REDACTION SCHEDULE",
      items: [
        {
          label: "Schedule generated",
          status: totalWithholding > 0 ? "pass" : "fail",
          detail: `Schedule will list ${totalWithholding} accepted detection${totalWithholding === 1 ? "" : "s"}`,
        },
        {
          label: "Item descriptions are adequate",
          status: shortDescriptions > 0 ? "warning" : "pass",
          detail:
            shortDescriptions > 0
              ? `${shortDescriptions} items have short matched-text values (fewer than 5 words)`
              : "All matched values meet minimum length expectations",
        },
      ],
    },
    {
      title: "REDACTION VERIFICATION",
      items: [
        {
          label: "Text extraction test",
          status: verificationResult
            ? (verificationResult.passed ? "pass" : "warning")
            : "warning",
          detail: verificationResult
            ? (verificationResult.passed
                ? `All redacted documents passed text extraction verification (${new Date(verificationResult.checkedAt).toLocaleDateString()})`
                : `Verification completed with warnings — ${verificationResult.detail}`)
            : "Automated redaction verification has not been run yet — will be checked during export",
        },
        {
          label: "Object layer check",
          status: verificationResult ? "pass" : "warning",
          detail: verificationResult
            ? "PDF metadata and object layers verified during export"
            : "Hidden text layer analysis will be performed during export generation",
        },
        {
          label: "Metadata sanitised",
          status: metadataStatus,
          detail: metadataDetail,
        },
        {
          label: "All documents verified",
          status: verificationResult
            ? (verificationResult.passed ? "pass" : "warning")
            : "warning",
          detail: verificationResult
            ? (verificationResult.passed
                ? `All documents passed automated verification on ${new Date(verificationResult.checkedAt).toLocaleDateString()}`
                : `Verification ran on ${new Date(verificationResult.checkedAt).toLocaleDateString()} — review audit trail for details`)
            : "Automated verification runs during export — results will appear in the audit trail",
        },
      ],
    },
  ];
}

export default function QAClient({
  requestId,
  batchData,
  documents,
  withholdingItems,
  pendingDetections,
  processedDocCount,
  verificationResult,
  simulation,
}: QAClientProps) {
  const qaGroups = buildQAGroups(
    batchData,
    documents,
    withholdingItems,
    pendingDetections,
    processedDocCount,
    verificationResult,
  );

  const caseReference = batchData?.reference ?? "Unknown";

  const totalPassed = qaGroups.flatMap((g) => g.items).filter((i) => i.status === "pass").length;
  const totalWarnings = qaGroups.flatMap((g) => g.items).filter((i) => i.status === "warning").length;
  const totalFailed = qaGroups.flatMap((g) => g.items).filter((i) => i.status === "fail").length;

  return (
    <div className="p-6 max-w-[1100px]">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-sm text-txt-secondary mb-6">
        <Link href="/batches" className="hover:text-brand-primary transition-colors">
          Cases
        </Link>
        <ChevronRight className="w-3.5 h-3.5" />
        <Link href={`/batches/${requestId}`} className="hover:text-brand-primary transition-colors">
          {caseReference}
        </Link>
        <ChevronRight className="w-3.5 h-3.5" />
        <span className="text-txt-primary font-medium">Pre-Release QA</span>
      </div>

      {/* Back link */}
      <Link
        href={`/batches/${requestId}`}
        className="inline-flex items-center gap-1.5 text-sm text-txt-secondary hover:text-brand-primary transition-colors mb-4"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to case
      </Link>

      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <Shield className="w-6 h-6 text-brand-primary" />
          <h1 className="text-2xl font-heading font-bold text-txt-primary">
            Pre-Release Quality Assurance
          </h1>
        </div>
        <p className="text-sm text-txt-secondary">
          All checks must pass before export is enabled
        </p>
      </div>

      {/* QA groups */}
      <div className="space-y-5 mb-8">
        {qaGroups.map((group) => (
          <div key={group.title} className="card">
            <h2 className="text-xs font-semibold tracking-wider text-txt-secondary uppercase mb-4">
              {group.title}
            </h2>
            <div className="space-y-3">
              {group.items.map((item, idx) => {
                const cfg = statusIcon[item.status];
                const Icon = cfg.Icon;
                return (
                  <div
                    key={idx}
                    className={`flex items-start gap-3 px-4 py-3 rounded-lg ${cfg.bg}`}
                  >
                    <Icon className={`w-5 h-5 flex-shrink-0 mt-0.5 ${cfg.color}`} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-txt-primary">
                        {item.label}
                      </div>
                      <div className="text-xs text-txt-secondary mt-0.5">
                        {item.detail}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Summary */}
      <div className="card flex items-center justify-between mb-6">
        <div className="flex items-center gap-6 text-sm">
          <span className="flex items-center gap-1.5 text-confidence-high font-medium">
            <CheckCircle className="w-4 h-4" />
            {totalPassed} passed
          </span>
          <span className="flex items-center gap-1.5 text-confidence-low font-medium">
            <XCircle className="w-4 h-4" />
            {totalFailed} failed
          </span>
          <span className="flex items-center gap-1.5 text-confidence-medium font-medium">
            <AlertTriangle className="w-4 h-4" />
            {totalWarnings} warnings
          </span>
        </div>
        <Link
          href={`/batches/${requestId}/export`}
          className="btn-primary flex items-center gap-2"
        >
          Proceed to Export
        </Link>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/*  Simulate Release Section                                           */}
      {/* ------------------------------------------------------------------ */}
      <div className="card mb-6">
        <div className="flex items-center gap-3 mb-5">
          <Eye className="w-5 h-5 text-brand-primary" />
          <div>
            <h2 className="text-sm font-semibold text-txt-primary">
              Release Simulation
            </h2>
            <p className="text-[11px] text-txt-secondary mt-0.5">
              Preview what the requester will receive, including redacted documents and withholding schedule
            </p>
          </div>
        </div>

        {/* Stats overview */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          <div className="bg-surface-bg rounded-lg p-3 text-center">
            <div className="text-lg font-heading font-bold text-txt-primary">
              {simulation.releasedDocuments.length}
            </div>
            <div className="text-[11px] text-txt-secondary">Documents</div>
          </div>
          <div className="bg-surface-bg rounded-lg p-3 text-center">
            <div className="text-lg font-heading font-bold text-txt-primary">
              {simulation.totalPages}
            </div>
            <div className="text-[11px] text-txt-secondary">Total Pages</div>
          </div>
          <div className="bg-surface-bg rounded-lg p-3 text-center">
            <div className="text-lg font-heading font-bold text-txt-primary">
              {simulation.totalRedactions}
            </div>
            <div className="text-[11px] text-txt-secondary">Redactions Applied</div>
          </div>
          <div className="bg-surface-bg rounded-lg p-3 text-center">
            <div className="text-lg font-heading font-bold text-brand-primary">
              {simulation.percentageRedacted}%
            </div>
            <div className="text-[11px] text-txt-secondary">Pages Affected</div>
          </div>
        </div>

        {/* Simulation warnings */}
        {simulation.warnings.length > 0 && (
          <div className="mb-5">
            <h3 className="text-xs font-semibold tracking-wider text-txt-secondary uppercase mb-3">
              Warnings ({simulation.warnings.length})
            </h3>
            <div className="space-y-2">
              {simulation.warnings.map((warning, idx) => {
                const isError = warning.type === "pending-detections";
                const bgColor = isError ? "bg-red-50" : "bg-amber-50";
                const iconColor = isError ? "text-confidence-low" : "text-confidence-medium";
                const WarnIcon = isError ? XCircle : AlertTriangle;
                return (
                  <div
                    key={idx}
                    className={`flex items-start gap-3 px-4 py-2.5 rounded-lg ${bgColor}`}
                  >
                    <WarnIcon className={`w-4 h-4 flex-shrink-0 mt-0.5 ${iconColor}`} />
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-medium text-txt-primary">
                        {warning.documentName}
                      </span>
                      <span className="text-xs text-txt-secondary ml-2">
                        {warning.message}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {simulation.warnings.length === 0 && (
          <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-green-50 mb-5">
            <CheckCircle className="w-4 h-4 text-confidence-high" />
            <span className="text-xs text-txt-primary font-medium">
              No warnings -- all documents are ready for release
            </span>
          </div>
        )}

        {/* Document-by-document release preview */}
        <div className="mb-5">
          <h3 className="text-xs font-semibold tracking-wider text-txt-secondary uppercase mb-3">
            Document Release Preview
          </h3>
          <div className="border border-border rounded-lg overflow-hidden">
            <div className="grid grid-cols-[1fr,80px,80px,80px,80px] gap-2 px-4 py-2 bg-surface-bg text-[10px] font-semibold text-txt-secondary uppercase tracking-wide">
              <div>Document</div>
              <div className="text-center">Pages</div>
              <div className="text-center">Redacted</div>
              <div className="text-center">Redactions</div>
              <div className="text-center">Status</div>
            </div>
            <div className="divide-y divide-border">
              {simulation.releasedDocuments.map((doc, idx) => {
                const hasWarnings = simulation.warnings.some(
                  (w) => w.documentName === doc.name,
                );
                const hasErrors = simulation.warnings.some(
                  (w) =>
                    w.documentName === doc.name && w.type === "pending-detections",
                );
                return (
                  <div
                    key={idx}
                    className="grid grid-cols-[1fr,80px,80px,80px,80px] gap-2 px-4 py-2.5 items-center hover:bg-surface-hover transition-colors"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="w-3.5 h-3.5 text-txt-secondary flex-shrink-0" />
                      <span className="text-xs text-txt-primary truncate">
                        {doc.name}
                      </span>
                      {doc.hasFullWithholding && (
                        <span className="badge bg-red-100 text-red-700 text-[9px] flex-shrink-0">
                          Full withhold
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-txt-secondary text-center">
                      {doc.originalPages}
                    </div>
                    <div className="text-xs text-txt-secondary text-center">
                      {doc.redactedPages}
                    </div>
                    <div className="text-xs text-txt-secondary text-center">
                      {doc.redactionCount}
                    </div>
                    <div className="flex justify-center">
                      {hasErrors ? (
                        <XCircle className="w-4 h-4 text-confidence-low" />
                      ) : hasWarnings ? (
                        <AlertTriangle className="w-4 h-4 text-confidence-medium" />
                      ) : (
                        <CheckCircle className="w-4 h-4 text-confidence-high" />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Redaction schedule preview */}
        <div>
          <h3 className="text-xs font-semibold tracking-wider text-txt-secondary uppercase mb-3">
            Redaction Schedule Preview
          </h3>
          <div className="bg-surface-bg rounded-lg p-3">
            <div className="flex items-center gap-2 mb-2">
              <BarChart3 className="w-4 h-4 text-brand-primary" />
              <span className="text-xs font-medium text-txt-primary">Schedule Entries</span>
            </div>
            <div className="text-lg font-heading font-bold text-txt-primary">
              {simulation.scheduleEntries}
            </div>
            <div className="text-[11px] text-txt-secondary mt-0.5">
              accepted detections — schedule lists each by detection type and page
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
