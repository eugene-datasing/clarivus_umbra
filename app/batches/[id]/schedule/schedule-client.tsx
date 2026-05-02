"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ChevronRight,
  FileText,
  Eye,
  CheckCircle,
  Edit,
} from "lucide-react";

interface WithholdingItem {
  id: string;
  documentName: string;
  type: string;
  text: string;
  reasoning: string | null;
  note: string | null;
  page: number;
}

interface BatchData {
  id: string;
  reference: string;
  name: string;
}

interface ScheduleClientProps {
  requestId: string;
  batchData: BatchData | null;
  withholdingItems: WithholdingItem[];
}

const tabs = [
  { label: "Documents", href: "" },
  { label: "Schedule", href: "schedule" },
  { label: "Audit Trail", href: "audit" },
  { label: "Export", href: "export" },
];

export default function ScheduleClient({ requestId, batchData, withholdingItems }: ScheduleClientProps) {
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const caseReference = batchData?.reference ?? "Unknown";
  const batchName = batchData?.name ?? "";

  // Detection-type counts (replaces the Veil-era ground breakdown).
  const typeCounts: Record<string, number> = {};
  for (const item of withholdingItems) {
    typeCounts[item.type] = (typeCounts[item.type] || 0) + 1;
  }
  const sortedTypes = Object.entries(typeCounts).sort((a, b) => b[1] - a[1]);

  const [coveringStatement, setCoveringStatement] = useState(
    `Redaction schedule for batch ${caseReference}${batchName ? ` ("${batchName}")` : ""}.

The following detection types were applied during review:

${sortedTypes.map(([t, c]) => `- ${t} (${c})`).join("\n")}

Per-row context is set out in the schedule below.`
  );

  return (
    <div className="p-6 max-w-[1400px]">
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
        <span className="text-txt-primary font-medium">Withholding Schedule</span>
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-1 border-b border-border mb-6">
        {tabs.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href ? `/batches/${requestId}/${tab.href}` : `/batches/${requestId}`}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab.href === "schedule"
                ? "border-brand-primary text-brand-primary"
                : "border-transparent text-txt-secondary hover:text-txt-primary hover:border-gray-300"
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-heading font-bold text-txt-primary">
            Withholding Schedule
          </h1>
          <p className="text-sm text-txt-secondary mt-1">
            {caseReference} — {batchName}
          </p>
        </div>
        <span className="badge bg-amber-50 text-amber-700">
          Draft — awaiting review
        </span>
      </div>

      {/* Stats */}
      <div className="card mb-6 !py-3 !px-5">
        <div className="flex items-center gap-6 text-sm">
          <span className="text-txt-primary font-medium">{withholdingItems.length} items</span>
          <span className="text-txt-secondary">|</span>
          <span className="text-txt-secondary">
            Types:{" "}
            {sortedTypes.map(([type, count], idx) => (
              <span key={type}>
                <span className="font-mono text-xs bg-purple-50 text-brand-primary px-1.5 py-0.5 rounded">
                  {type}
                </span>
                {" "}x {count}
                {idx < sortedTypes.length - 1 ? ", " : ""}
              </span>
            ))}
          </span>
        </div>
      </div>

      {/* Covering statement */}
      <div className="card mb-6">
        <div className="flex items-center gap-2 mb-3">
          <FileText className="w-4 h-4 text-txt-secondary" />
          <h2 className="text-sm font-semibold text-txt-primary">
            Covering Statement
          </h2>
          <span className="text-xs text-txt-secondary">(editable)</span>
        </div>
        <textarea
          className="input-field min-h-[200px] font-body text-sm leading-relaxed"
          value={coveringStatement}
          onChange={(e) => setCoveringStatement(e.target.value)}
        />
      </div>

      {/* Withholding table */}
      <div className="card mb-6 !p-0 overflow-hidden">
        <div className="px-5 py-3 border-b border-border bg-surface-bg">
          <h2 className="text-sm font-semibold text-txt-primary">
            Schedule of Withheld Information
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-bg/60">
                <th className="text-left px-4 py-2.5 font-medium text-txt-secondary w-12">
                  #
                </th>
                <th className="text-left px-4 py-2.5 font-medium text-txt-secondary">
                  Document
                </th>
                <th className="text-left px-4 py-2.5 font-medium text-txt-secondary w-32">
                  Location
                </th>
                <th className="text-left px-4 py-2.5 font-medium text-txt-secondary">
                  Description
                </th>
                <th className="text-left px-4 py-2.5 font-medium text-txt-secondary w-36">
                  Type
                </th>
                <th className="text-left px-4 py-2.5 font-medium text-txt-secondary w-24">
                  Reason
                </th>
              </tr>
            </thead>
            <tbody>
              {withholdingItems.map((item, idx) => (
                <tr
                  key={item.id}
                  className="border-b border-border last:border-0 hover:bg-surface-hover transition-colors"
                >
                  <td className="px-4 py-3 font-mono text-xs text-txt-secondary align-top">
                    {idx + 1}
                  </td>
                  <td className="px-4 py-3 align-top">
                    <span className="text-xs text-txt-primary font-medium">
                      {item.documentName}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-txt-secondary align-top">
                    Page {item.page}
                  </td>
                  <td className="px-4 py-3 align-top">
                    <div className="flex items-start gap-1.5">
                      <span className="text-xs text-txt-primary leading-relaxed">
                        {item.text}
                      </span>
                      <button className="flex-shrink-0 text-txt-secondary hover:text-brand-primary mt-0.5">
                        <Edit className="w-3 h-3" />
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-3 align-top">
                    <span className="font-mono text-[10px] bg-purple-50 text-brand-primary px-1.5 py-0.5 rounded whitespace-nowrap">
                      {item.type}
                    </span>
                  </td>
                  <td className="px-4 py-3 align-top">
                    <button
                      onClick={() =>
                        setExpandedRow(
                          expandedRow === item.id ? null : item.id
                        )
                      }
                      className="text-brand-primary hover:underline text-xs flex items-center gap-1"
                    >
                      <Eye className="w-3 h-3" />
                      {expandedRow === item.id ? "Hide" : "View"}
                    </button>
                    {expandedRow === item.id && (
                      <div className="mt-2 p-2.5 bg-surface-bg rounded text-xs text-txt-secondary leading-relaxed max-w-[300px]">
                        {item.reasoning || "No reasoning provided."}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-2.5 border-t border-border bg-surface-bg text-xs text-txt-secondary">
          Showing {withholdingItems.length} of {withholdingItems.length} items
        </div>
      </div>

      {/* Right of review */}
      <div className="card mb-6 bg-surface-bg">
        <div className="flex items-center gap-2 mb-3">
          <CheckCircle className="w-4 h-4 text-txt-secondary" />
          <h2 className="text-sm font-semibold text-txt-primary">
            Right of Review (Standard Text)
          </h2>
        </div>
        <div className="text-xs text-txt-secondary leading-relaxed space-y-2 select-none">
          <p>
            If you are dissatisfied with this decision, you have the right under
            section 27(3) of the LGOIMA to make a complaint to the Ombudsman
            requesting an investigation and review of this decision.
          </p>
          <p>
            The Ombudsman may be contacted at: Office of the Ombudsman, PO Box
            10-152, Wellington 6143. Phone: 0800 802 602. Email:
            info@ombudsman.parliament.nz
          </p>
          <p className="italic text-txt-secondary/60">
            This text is standard and cannot be edited.
          </p>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-3">
        <button
          className="btn-secondary flex items-center gap-2"
          onClick={() => {
            window.open(`/api/schedule/${requestId}`, "_blank");
          }}
        >
          <Eye className="w-4 h-4" />
          Preview as PDF
        </button>
        <button className="btn-primary flex items-center gap-2">
          <CheckCircle className="w-4 h-4" />
          Mark as Reviewed
        </button>
      </div>
    </div>
  );
}
