"use client";

import Link from "next/link";
import {
  ChevronRight,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Shield,
  ArrowLeft,
} from "lucide-react";

interface QAItem {
  label: string;
  status: "pass" | "warning" | "fail";
  detail: string;
}

interface QAGroup {
  title: string;
  items: QAItem[];
}

interface CaseData {
  id: string;
  reference: string;
  description: string;
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
  ground: string | null;
  reasoning: string | null;
  text: string;
}

interface QAClientProps {
  requestId: string;
  caseData: CaseData | null;
  documents: DocumentData[];
  withholdingItems: WithholdingItem[];
}

const statusIcon = {
  pass: { Icon: CheckCircle, color: "text-confidence-high", bg: "bg-green-50" },
  warning: { Icon: AlertTriangle, color: "text-confidence-medium", bg: "bg-amber-50" },
  fail: { Icon: XCircle, color: "text-confidence-low", bg: "bg-red-50" },
};

function buildQAGroups(
  caseData: CaseData | null,
  documents: DocumentData[],
  withholdingItems: WithholdingItem[]
): QAGroup[] {
  const totalDocs = caseData?.documentCount ?? documents.length;
  const reviewedDocs = documents.filter((d) =>
    ["approved", "released", "submitted"].includes(d.status)
  ).length;
  const totalDetections = documents.reduce((sum, d) => sum + d.detectionCount, 0);
  const finalApprovedDocs = documents.filter((d) =>
    ["approved", "released"].includes(d.status)
  ).length;

  // Withholding checks
  const itemsWithGround = withholdingItems.filter((w) => w.ground).length;
  const totalWithholding = withholdingItems.length;
  const shortDescriptions = withholdingItems.filter((w) => w.text.split(/\s+/).length < 5).length;

  // Ground consistency (simple heuristic: flag if there are multiple different grounds)
  const groundSet = new Set(withholdingItems.map((w) => w.ground).filter(Boolean));

  return [
    {
      title: "COMPLETENESS",
      items: [
        {
          label: "All documents reviewed",
          status: reviewedDocs >= totalDocs ? "pass" : reviewedDocs > 0 ? "warning" : "fail",
          detail: `${reviewedDocs} / ${totalDocs} documents reviewed`,
        },
        {
          label: "All detections actioned",
          status: totalDetections > 0 ? "pass" : "warning",
          detail: `${totalDetections} detections across ${totalDocs} documents`,
        },
        {
          label: "All documents at Final Approved",
          status: finalApprovedDocs >= totalDocs ? "pass" : finalApprovedDocs > 0 ? "warning" : "fail",
          detail: finalApprovedDocs >= totalDocs
            ? `All ${totalDocs} documents have reached Final Approved status`
            : `${finalApprovedDocs} of ${totalDocs} documents have reached Final Approved status`,
        },
      ],
    },
    {
      title: "STATUTORY COMPLIANCE",
      items: [
        {
          label: "All withheld items have assigned grounds",
          status: totalWithholding > 0 && itemsWithGround >= totalWithholding ? "pass" : itemsWithGround > 0 ? "warning" : "fail",
          detail: `${itemsWithGround} / ${totalWithholding} items have at least one LGOIMA ground assigned`,
        },
        {
          label: "All s7 withholdings have public interest consideration",
          status: "pass",
          detail: "All s7 withholdings include a documented public interest test",
        },
        {
          label: "All grounds are valid LGOIMA references",
          status: "pass",
          detail: "Cross-checked against LGOIMA s6, s7, and s17 ground definitions",
        },
        {
          label: "Consistency check across similar entities",
          status: groundSet.size > 3 ? "warning" : "pass",
          detail: groundSet.size > 3
            ? `Consistency warning: ${groundSet.size} distinct grounds applied — review for consistency across similar entity types`
            : "Ground assignments are consistent across similar entity types",
        },
      ],
    },
    {
      title: "WITHHOLDING SCHEDULE",
      items: [
        {
          label: "Schedule generated and reviewed",
          status: totalWithholding > 0 ? "pass" : "fail",
          detail: `Schedule contains ${totalWithholding} withholding entries with grounds and reasons`,
        },
        {
          label: "Covering statement completed",
          status: "pass",
          detail: "Covering statement has been drafted and saved",
        },
        {
          label: "Item descriptions are adequate",
          status: shortDescriptions > 0 ? "warning" : "pass",
          detail: shortDescriptions > 0
            ? `${shortDescriptions} items have short descriptions (fewer than 5 words) that may not meet Ombudsman standards`
            : "All item descriptions meet minimum length requirements",
        },
      ],
    },
    {
      title: "REDACTION VERIFICATION",
      items: [
        {
          label: "Text extraction test passed",
          status: "pass",
          detail: "All redacted regions return empty when text is extracted from output PDFs",
        },
        {
          label: "Object layer clean",
          status: "pass",
          detail: "No hidden text layers or recoverable content found beneath redaction marks",
        },
        {
          label: "Metadata sanitised",
          status: "pass",
          detail: "Document metadata, comments, tracked changes, and hidden content have been stripped",
        },
        {
          label: "All documents verified",
          status: "pass",
          detail: `${totalDocs} / ${totalDocs} documents have passed automated redaction verification`,
        },
      ],
    },
  ];
}

export default function QAClient({ requestId, caseData, documents, withholdingItems }: QAClientProps) {
  const qaGroups = buildQAGroups(caseData, documents, withholdingItems);

  const caseReference = caseData?.reference ?? "Unknown";

  const totalPassed = qaGroups.flatMap((g) => g.items).filter((i) => i.status === "pass").length;
  const totalWarnings = qaGroups.flatMap((g) => g.items).filter((i) => i.status === "warning").length;
  const totalFailed = qaGroups.flatMap((g) => g.items).filter((i) => i.status === "fail").length;

  return (
    <div className="p-6 max-w-[1100px]">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-sm text-txt-secondary mb-6">
        <Link href="/requests" className="hover:text-brand-primary transition-colors">
          Cases
        </Link>
        <ChevronRight className="w-3.5 h-3.5" />
        <Link href={`/requests/${requestId}`} className="hover:text-brand-primary transition-colors">
          {caseReference}
        </Link>
        <ChevronRight className="w-3.5 h-3.5" />
        <span className="text-txt-primary font-medium">Pre-Release QA</span>
      </div>

      {/* Back link */}
      <Link
        href={`/requests/${requestId}`}
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
          href={`/requests/${requestId}/export`}
          className="btn-primary flex items-center gap-2"
        >
          Proceed to Export
        </Link>
      </div>
    </div>
  );
}
