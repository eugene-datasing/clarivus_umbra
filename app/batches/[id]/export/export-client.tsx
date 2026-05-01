"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  ChevronRight,
  CheckCircle,
  Download,
  FileText,
  Loader,
  Shield,
  AlertTriangle,
  XCircle,
  Info,
} from "lucide-react";

const tabs = [
  { label: "Documents", href: "" },
  { label: "Schedule", href: "schedule" },
  { label: "Audit Trail", href: "audit" },
  { label: "Export", href: "export" },
];

type PackageType = "requester" | "internal" | "ombudsman";

const packages: {
  id: PackageType;
  label: string;
  recommended?: boolean;
  description: string;
  includes: string[];
}[] = [
  {
    id: "requester",
    label: "Requester Package",
    description: "Documents and schedule for the LGOIMA requester",
    includes: [
      "Redacted documents (PDF/A)",
      "Withholding schedule",
      "Covering letter",
    ],
  },
  {
    id: "internal",
    label: "Internal Package",
    recommended: true,
    description: "Complete package for internal records and future reference",
    includes: [
      "Redacted documents (PDF/A)",
      "Withholding schedule with reasoning",
      "Covering letter",
      "Full audit trail",
    ],
  },
  {
    id: "ombudsman",
    label: "Ombudsman Package",
    description:
      "Full disclosure package for Ombudsman review",
    includes: [
      "Redacted documents (PDF/A)",
      "Unredacted originals",
      "Withholding schedule with full reasoning",
      "Complete audit trail",
    ],
  },
];

export interface ExportDocument {
  id: string;
  name: string;
  status: string;
  pageCount: number;
  sizeKB: number;
  fileType: string;
  detectionCount: number;
  acceptedCount: number;
  missingGrounds: number;
}

type ReadinessCategory = "exportable" | "warning" | "missing-grounds" | "blocked";

function getReadiness(doc: ExportDocument): ReadinessCategory {
  if (doc.missingGrounds > 0) return "missing-grounds";
  if (doc.status === "signed-off") return "exportable";
  if (doc.status === "reviewed" || doc.status === "in-review") return "warning";
  return "blocked";
}

function readinessLabel(cat: ReadinessCategory): { text: string; color: string; bg: string; icon: typeof CheckCircle } {
  switch (cat) {
    case "exportable":
      return { text: "Signed Off", color: "text-green-700", bg: "bg-green-50", icon: CheckCircle };
    case "warning":
      return { text: "Not Signed Off", color: "text-amber-700", bg: "bg-amber-50", icon: AlertTriangle };
    case "missing-grounds":
      return { text: "Missing Grounds", color: "text-red-700", bg: "bg-red-50", icon: XCircle };
    case "blocked":
      return { text: "Review Incomplete", color: "text-red-700", bg: "bg-red-50", icon: XCircle };
  }
}

interface ExportClientProps {
  requestId: string;
  caseReference: string;
  caseDescription: string;
  documents: ExportDocument[];
}

function formatSize(kb: number): string {
  if (kb >= 1024 * 1024) return `~${(kb / (1024 * 1024)).toFixed(1)} GB`;
  if (kb >= 1024) return `~${(kb / 1024).toFixed(0)} MB`;
  return `~${kb} KB`;
}

export default function ExportClient({
  requestId,
  caseReference,
  caseDescription,
  documents,
}: ExportClientProps) {
  // Document selection — signed-off docs pre-selected
  const [selectedDocIds, setSelectedDocIds] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    for (const doc of documents) {
      if (getReadiness(doc) === "exportable") initial.add(doc.id);
    }
    return initial;
  });

  const [selectedPackage, setSelectedPackage] = useState<PackageType>("requester");
  const [includeCoverLetter, setIncludeCoverLetter] = useState(true);
  const [includeRightOfReview, setIncludeRightOfReview] = useState(true);
  const [warningAcknowledged, setWarningAcknowledged] = useState(false);

  // Batch export state
  const [batchMode, setBatchMode] = useState(false);
  const [batchGroupId, setBatchGroupId] = useState<string | null>(null);
  const [batchExportIds, setBatchExportIds] = useState<string[]>([]);
  const [batchStatuses, setBatchStatuses] = useState<{
    batchNumber: number;
    exportId: string;
    status: string;
    downloadKey?: string;
    sha256?: string;
    filename?: string;
    pageCount: number;
    docCount: number;
  }[]>([]);

  const [exportState, setExportState] = useState<
    "idle" | "generating" | "verifying" | "complete" | "error"
  >("idle");
  const [exportProgress, setExportProgress] = useState(0);
  const [exportStep, setExportStep] = useState("");
  const [exportError, setExportError] = useState("");
  const [exportId, setExportId] = useState<string | null>(null);
  const [sha256, setSha256] = useState<string | null>(null);
  const [exportFilename, setExportFilename] = useState<string | null>(null);

  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const batchPollingRef = useRef<NodeJS.Timeout | null>(null);

  // Derived readiness stats
  const selectedDocs = useMemo(
    () => documents.filter((d) => selectedDocIds.has(d.id)),
    [documents, selectedDocIds],
  );

  const readinessGroups = useMemo(() => {
    const groups = { exportable: [] as ExportDocument[], warning: [] as ExportDocument[], blocked: [] as ExportDocument[] };
    for (const doc of documents) {
      const r = getReadiness(doc);
      const bucket = r === "missing-grounds" ? "blocked" : r;
      groups[bucket].push(doc);
    }
    return groups;
  }, [documents]);

  const selectedWarnings = useMemo(
    () => selectedDocs.filter((d) => getReadiness(d) === "warning"),
    [selectedDocs],
  );

  const totalSelectedPages = useMemo(
    () => selectedDocs.reduce((sum, d) => sum + d.pageCount, 0),
    [selectedDocs],
  );
  const totalSelectedSize = useMemo(
    () => selectedDocs.reduce((sum, d) => sum + d.sizeKB, 0),
    [selectedDocs],
  );
  const totalAccepted = useMemo(
    () => selectedDocs.reduce((sum, d) => sum + d.acceptedCount, 0),
    [selectedDocs],
  );

  // Determine if batch export should be offered
  const showBatchOption = selectedDocs.length > 50 || totalSelectedPages > 500;

  const hasWarnings = selectedWarnings.length > 0;
  const canGenerate =
    selectedDocs.length > 0 &&
    selectedDocs.every((d) => { const r = getReadiness(d); return r !== "blocked" && r !== "missing-grounds"; }) &&
    (!hasWarnings || warningAcknowledged);

  // Reset warning acknowledgment when selection changes
  useEffect(() => {
    setWarningAcknowledged(false);
  }, [selectedDocIds]);

  // Toggle document selection
  const toggleDoc = (docId: string) => {
    const doc = documents.find((d) => d.id === docId);
    const r = doc ? getReadiness(doc) : null;
    if (!doc || r === "blocked" || r === "missing-grounds") return;
    setSelectedDocIds((prev) => {
      const next = new Set(prev);
      if (next.has(docId)) next.delete(docId);
      else next.add(docId);
      return next;
    });
  };

  const selectAllExportable = () => {
    setSelectedDocIds(new Set(readinessGroups.exportable.map((d) => d.id)));
  };

  // Poll export status
  const pollStatus = useCallback(async () => {
    if (!exportId) return;
    try {
      const res = await fetch(`/api/export/${requestId}/${exportId}/status`);
      if (!res.ok) return;
      const data = await res.json();

      setExportProgress(data.progress || 0);
      setExportStep(data.currentStep || "");

      if (data.status === "verifying") setExportState("verifying");
      if (data.status === "complete") {
        setExportState("complete");
        setSha256(data.sha256 || null);
        setExportFilename(data.filename || null);
        if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }
      }
      if (data.status === "error") {
        setExportState("error");
        setExportError(data.error || "Export failed");
        if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }
      }
    } catch {
      // Keep polling
    }
  }, [exportId, requestId]);

  useEffect(() => {
    if (exportState === "generating" || exportState === "verifying") {
      pollingRef.current = setInterval(pollStatus, 1500);
    }
    return () => {
      if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }
    };
  }, [exportState, pollStatus]);

  // Batch export polling
  const pollBatchStatus = useCallback(async () => {
    if (!batchGroupId) return;
    try {
      const res = await fetch(
        `/api/export/${requestId}/batch-status?batchGroupId=${batchGroupId}`,
      );
      if (!res.ok) return;
      const data = await res.json();

      setExportProgress(data.progress || 0);
      setExportStep(data.currentStep || "");
      setBatchStatuses(data.batches || []);

      if (data.status === "complete") {
        setExportState("complete");
        if (batchPollingRef.current) {
          clearInterval(batchPollingRef.current);
          batchPollingRef.current = null;
        }
      }
      if (data.status === "error") {
        setExportState("error");
        setExportError(data.error || "Batch export failed");
        if (batchPollingRef.current) {
          clearInterval(batchPollingRef.current);
          batchPollingRef.current = null;
        }
      }
    } catch {
      // Keep polling
    }
  }, [batchGroupId, requestId]);

  useEffect(() => {
    if (batchMode && batchGroupId && exportState === "generating") {
      batchPollingRef.current = setInterval(pollBatchStatus, 2000);
    }
    return () => {
      if (batchPollingRef.current) {
        clearInterval(batchPollingRef.current);
        batchPollingRef.current = null;
      }
    };
  }, [batchMode, batchGroupId, exportState, pollBatchStatus]);

  const handleGenerate = async () => {
    setExportState("generating");
    setExportProgress(0);
    setExportError("");
    setExportStep("Starting export...");
    setBatchStatuses([]);
    setBatchGroupId(null);
    setBatchExportIds([]);

    try {
      const res = await fetch(`/api/export/${requestId}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify({
          packageType: selectedPackage,
          includeCoverLetter,
          includeRightOfReview,
          documentIds: Array.from(selectedDocIds),
          batch: batchMode,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to start export");
      }

      const data = await res.json();

      if (data.batch) {
        setBatchGroupId(data.batchGroupId);
        setBatchExportIds(data.exportIds);
      } else {
        setExportId(data.exportId);
      }
    } catch (err) {
      setExportState("error");
      setExportError(err instanceof Error ? err.message : "Export failed");
    }
  };

  const handleDownload = () => {
    if (!exportId) return;
    window.open(`/api/export/${requestId}/${exportId}/download`, "_blank");
  };

  const handleReset = () => {
    setExportState("idle");
    setExportId(null);
    setSha256(null);
    setExportFilename(null);
    setWarningAcknowledged(false);
    setBatchMode(false);
    setBatchGroupId(null);
    setBatchExportIds([]);
    setBatchStatuses([]);
  };

  const handleBatchDownload = (batchExportId: string) => {
    window.open(`/api/export/${requestId}/${batchExportId}/download`, "_blank");
  };

  return (
    <div className="p-6 max-w-[1400px]">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-sm text-txt-secondary mb-6">
        <Link href="/batches" className="hover:text-brand-primary transition-colors">Cases</Link>
        <ChevronRight className="w-3.5 h-3.5" />
        <Link href={`/batches/${requestId}`} className="hover:text-brand-primary transition-colors font-mono">{caseReference}</Link>
        <ChevronRight className="w-3.5 h-3.5" />
        <span className="text-txt-primary font-medium">Export</span>
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-1 border-b border-border mb-6">
        {tabs.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href ? `/batches/${requestId}/${tab.href}` : `/batches/${requestId}`}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab.href === "export"
                ? "border-brand-primary text-brand-primary"
                : "border-transparent text-txt-secondary hover:text-txt-primary hover:border-gray-300"
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-heading font-bold text-txt-primary">Export &amp; Release</h1>
        <p className="text-sm text-txt-secondary mt-1">{caseReference} — {caseDescription}</p>
      </div>

      {/* ===== Document Readiness Summary ===== */}
      <div className="card mb-6">
        <h2 className="text-xs font-semibold tracking-wider text-txt-secondary uppercase mb-3">
          Document Readiness
        </h2>
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div className="flex items-center gap-3 p-3 rounded-lg bg-green-50/60">
            <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
            <div>
              <div className="text-lg font-semibold text-green-700 font-mono">{readinessGroups.exportable.length}</div>
              <div className="text-xs text-green-600">Signed off — ready to export</div>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 rounded-lg bg-amber-50/60">
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" />
            <div>
              <div className="text-lg font-semibold text-amber-700 font-mono">{readinessGroups.warning.length}</div>
              <div className="text-xs text-amber-600">Reviewed — awaiting sign-off</div>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 rounded-lg bg-red-50/60">
            <XCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
            <div>
              <div className="text-lg font-semibold text-red-700 font-mono">{readinessGroups.blocked.length}</div>
              <div className="text-xs text-red-600">Review incomplete — cannot export</div>
            </div>
          </div>
        </div>

        {documents.length === 0 && (
          <div className="text-center py-6 text-sm text-txt-secondary">
            No documents in this case. Upload documents before exporting.
          </div>
        )}
      </div>

      {/* ===== Document Selection Table ===== */}
      {documents.length > 0 && (
        <div className="card !p-0 overflow-hidden mb-6">
          <div className="px-5 py-3 border-b border-border bg-surface-bg flex items-center justify-between">
            <h2 className="text-sm font-semibold text-txt-primary">
              Select Documents to Export
            </h2>
            <div className="flex items-center gap-3">
              <button onClick={selectAllExportable} className="text-xs text-brand-primary hover:underline">
                Select all signed-off
              </button>
              <button onClick={() => setSelectedDocIds(new Set())} className="text-xs text-txt-secondary hover:text-txt-primary">
                Clear selection
              </button>
            </div>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-bg/60">
                <th className="w-10 px-4 py-2.5" />
                <th className="text-left px-4 py-2.5 font-medium text-txt-secondary">Document</th>
                <th className="text-left px-4 py-2.5 font-medium text-txt-secondary">Status</th>
                <th className="text-center px-4 py-2.5 font-medium text-txt-secondary">Readiness</th>
                <th className="text-center px-4 py-2.5 font-medium text-txt-secondary">Detections</th>
                <th className="text-center px-4 py-2.5 font-medium text-txt-secondary">Accepted</th>
                <th className="text-center px-4 py-2.5 font-medium text-txt-secondary">Pages</th>
              </tr>
            </thead>
            <tbody>
              {documents.map((doc) => {
                const readiness = getReadiness(doc);
                const rl = readinessLabel(readiness);
                const isBlocked = readiness === "blocked" || readiness === "missing-grounds";
                const isSelected = selectedDocIds.has(doc.id);
                const Icon = rl.icon;

                return (
                  <tr
                    key={doc.id}
                    className={cn(
                      "border-b border-border last:border-0 transition-colors",
                      isBlocked ? "opacity-50 cursor-not-allowed" : "hover:bg-surface-hover cursor-pointer",
                      isSelected && !isBlocked && "bg-purple-50/30",
                    )}
                    onClick={() => !isBlocked && toggleDoc(doc.id)}
                  >
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        disabled={isBlocked}
                        onChange={() => toggleDoc(doc.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="rounded border-border text-brand-primary focus:ring-brand-primary/30 disabled:opacity-30"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-txt-secondary flex-shrink-0" />
                        <span className="font-medium text-txt-primary">{doc.name}</span>
                        <span className="text-xs px-1.5 py-0.5 rounded bg-surface-bg text-txt-secondary">{doc.fileType}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn(
                        "text-xs font-medium",
                        doc.status === "signed-off" ? "text-green-600" :
                        doc.status === "reviewed" ? "text-purple-600" :
                        doc.status === "in-review" ? "text-blue-600" :
                        "text-amber-600"
                      )}>
                        {doc.status === "signed-off" ? "Signed Off" :
                         doc.status === "reviewed" ? "Reviewed (Initial)" :
                         doc.status === "in-review" ? "In Review" :
                         doc.status === "ready" ? "Ready for Review" :
                         doc.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={cn("badge text-xs inline-flex items-center gap-1", rl.bg, rl.color)}>
                        <Icon className="w-3 h-3" />
                        {rl.text}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center font-mono text-sm">
                      {doc.detectionCount > 0 ? doc.detectionCount : "--"}
                    </td>
                    <td className="px-4 py-3 text-center font-mono text-sm">
                      {doc.acceptedCount > 0 ? doc.acceptedCount : "--"}
                      {doc.missingGrounds > 0 && (
                        <Link
                          href={`/batches/${requestId}/review/${doc.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="ml-1.5 inline-flex items-center gap-0.5 text-[11px] font-sans font-medium text-red-600 bg-red-50 px-1.5 py-0.5 rounded hover:bg-red-100 transition-colors"
                          title="Open review page to assign grounds"
                        >
                          <AlertTriangle className="w-3 h-3" />
                          {doc.missingGrounds} no ground
                        </Link>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center font-mono text-sm">
                      {doc.pageCount}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ===== Warnings ===== */}
      {hasWarnings && selectedDocs.length > 0 && (
        <div className="card mb-6 border-amber-200 bg-amber-50/50">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="text-sm font-semibold text-amber-800 mb-1">
                {selectedWarnings.length} document{selectedWarnings.length > 1 ? "s have" : " has"} not been signed off
              </div>
              <div className="text-xs text-amber-700 mb-2">
                The following documents have been reviewed but not yet given final approval.
                Including them means redaction decisions have not received sign-off.
              </div>
              <ul className="text-xs text-amber-700 mb-3 space-y-0.5">
                {selectedWarnings.map((d) => (
                  <li key={d.id} className="flex items-center gap-1.5">
                    <span className="text-amber-500">-</span>
                    <span className="font-medium">{d.name}</span>
                    <span className="text-amber-600/70">({d.status === "reviewed" ? "Reviewed — awaiting senior sign-off" : "In Review — not yet complete"})</span>
                  </li>
                ))}
              </ul>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={warningAcknowledged}
                  onChange={(e) => setWarningAcknowledged(e.target.checked)}
                  className="w-4 h-4 rounded border-amber-400 text-amber-600 focus:ring-amber-500/30"
                />
                <span className="text-xs font-medium text-amber-800">
                  I confirm that {selectedWarnings.length === 1 ? "this document has" : "these documents have"} not received senior sign-off and I accept responsibility for including {selectedWarnings.length === 1 ? "it" : "them"}
                </span>
              </label>
            </div>
          </div>
        </div>
      )}

      {/* ===== Package selection ===== */}
      {selectedDocs.length > 0 && (
        <>
          <div className="mb-6">
            <h2 className="text-xs font-semibold tracking-wider text-txt-secondary uppercase mb-3">
              Select Export Package
            </h2>
            <div className="grid grid-cols-3 gap-4">
              {packages.map((pkg) => (
                <button
                  key={pkg.id}
                  onClick={() => setSelectedPackage(pkg.id)}
                  className={`card text-left transition-all cursor-pointer ${
                    selectedPackage === pkg.id
                      ? "ring-2 ring-brand-primary border-brand-primary"
                      : "hover:border-gray-300"
                  }`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-txt-primary">{pkg.label}</h3>
                        {pkg.recommended && (
                          <span className="badge bg-brand-primary/10 text-brand-primary text-[10px]">Recommended</span>
                        )}
                      </div>
                      <p className="text-xs text-txt-secondary mt-0.5">{pkg.description}</p>
                    </div>
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                      selectedPackage === pkg.id ? "border-brand-primary bg-brand-primary" : "border-gray-300"
                    }`}>
                      {selectedPackage === pkg.id && <div className="w-2 h-2 rounded-full bg-white" />}
                    </div>
                  </div>
                  <div className="mt-3 pt-3 border-t border-border">
                    <div className="text-[10px] uppercase tracking-wider text-txt-secondary font-semibold mb-1.5">Includes</div>
                    <ul className="space-y-1">
                      {pkg.includes.map((item) => (
                        <li key={item} className="flex items-center gap-1.5 text-xs text-txt-secondary">
                          <CheckCircle className="w-3 h-3 text-confidence-high flex-shrink-0" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Export options */}
          <div className="card mb-6">
            <h2 className="text-xs font-semibold tracking-wider text-txt-secondary uppercase mb-4">
              Export Options
            </h2>
            <div className="flex items-center gap-6 flex-wrap">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeCoverLetter}
                  onChange={(e) => setIncludeCoverLetter(e.target.checked)}
                  className="w-4 h-4 rounded border-border text-brand-primary focus:ring-brand-primary/30"
                />
                <span className="text-sm text-txt-primary">Include covering letter</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeRightOfReview}
                  onChange={(e) => setIncludeRightOfReview(e.target.checked)}
                  className="w-4 h-4 rounded border-border text-brand-primary focus:ring-brand-primary/30"
                />
                <span className="text-sm text-txt-primary">Include right-of-review statement</span>
              </label>
              {showBatchOption && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={batchMode}
                    onChange={(e) => setBatchMode(e.target.checked)}
                    className="w-4 h-4 rounded border-border text-brand-primary focus:ring-brand-primary/30"
                  />
                  <span className="text-sm text-txt-primary">Batch export</span>
                  <span className="text-xs text-txt-secondary">(split into ~500-page ZIPs)</span>
                </label>
              )}
            </div>
            {batchMode && (
              <div className="mt-3 p-3 rounded-lg bg-blue-50/60 border border-blue-200">
                <div className="flex items-start gap-2">
                  <Info className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
                  <div className="text-xs text-blue-700">
                    <span className="font-semibold">Batch mode enabled.</span> Documents will be
                    split into batches of approximately 500 pages each. Each batch will produce
                    a separate ZIP file with an export manifest listing all batches.
                    Estimated batches: <span className="font-mono font-semibold">{Math.max(1, Math.ceil(totalSelectedPages / 500))}</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Export summary */}
          <div className="card mb-6 bg-surface-bg">
            <h2 className="text-xs font-semibold tracking-wider text-txt-secondary uppercase mb-3">
              Export Summary
            </h2>
            <div className="grid grid-cols-4 gap-4">
              <div>
                <div className="text-xs text-txt-secondary">Documents</div>
                <div className="text-lg font-semibold text-txt-primary font-mono">{selectedDocs.length}</div>
              </div>
              <div>
                <div className="text-xs text-txt-secondary">Pages</div>
                <div className="text-lg font-semibold text-txt-primary font-mono">{totalSelectedPages.toLocaleString()}</div>
              </div>
              <div>
                <div className="text-xs text-txt-secondary">Est. Size</div>
                <div className="text-lg font-semibold text-txt-primary font-mono">{formatSize(totalSelectedSize)}</div>
              </div>
              <div>
                <div className="text-xs text-txt-secondary">Withholdings</div>
                <div className="text-lg font-semibold text-txt-primary font-mono">{totalAccepted}</div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ===== Generate / Progress / Success / Error ===== */}
      <div className="mb-8">
        {exportState === "idle" && (
          <div>
            {selectedDocs.length === 0 ? (
              <div className="flex items-center gap-2 text-sm text-txt-secondary">
                <Info className="w-4 h-4" />
                Select at least one document above to generate an export package.
              </div>
            ) : (
              <button
                onClick={handleGenerate}
                disabled={!canGenerate}
                className={cn(
                  "flex items-center gap-2 text-base !px-6 !py-3",
                  canGenerate ? "btn-primary" : "btn-secondary opacity-50 cursor-not-allowed",
                )}
              >
                <Download className="w-5 h-5" />
                Generate Export Package
              </button>
            )}
            {selectedDocs.length > 0 && !canGenerate && hasWarnings && !warningAcknowledged && (
              <p className="text-xs text-amber-600 mt-2">
                Acknowledge the warning above to proceed.
              </p>
            )}
          </div>
        )}

        {(exportState === "generating" || exportState === "verifying") && (
          <div className="card border-brand-primary/20">
            <div className="flex items-center gap-3 mb-3">
              <Loader className="w-5 h-5 text-brand-primary animate-spin" />
              <div>
                <div className="text-sm font-semibold text-txt-primary">
                  {batchMode
                    ? `Generating batch export...`
                    : exportState === "generating"
                      ? "Generating export package..."
                      : "Verifying redactions are permanent..."}
                </div>
                <div className="text-xs text-txt-secondary">
                  {exportStep || (exportState === "generating"
                    ? "Burning redactions into documents and assembling package"
                    : "Automated check: confirming all redactions are irreversible")}
                </div>
              </div>
            </div>
            <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-brand-primary rounded-full transition-all duration-200" style={{ width: `${exportProgress}%` }} />
            </div>
            <div className="text-xs text-txt-secondary text-right mt-1">{exportProgress}%</div>

            {/* Batch progress details */}
            {batchMode && batchStatuses.length > 0 && (
              <div className="mt-4 space-y-2">
                <div className="text-xs font-semibold text-txt-secondary uppercase tracking-wider">
                  Batch Progress
                </div>
                {batchStatuses.map((batch) => (
                  <div
                    key={batch.batchNumber}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg bg-surface-bg text-sm"
                  >
                    <span className="font-mono font-semibold text-txt-primary w-20">
                      Batch {batch.batchNumber}
                    </span>
                    <span className="text-xs text-txt-secondary">
                      {batch.docCount} docs, {batch.pageCount.toLocaleString()} pages
                    </span>
                    <span className="ml-auto">
                      {batch.status === "complete" ? (
                        <span className="badge bg-green-50 text-green-700 text-xs">Complete</span>
                      ) : batch.status === "generating" ? (
                        <span className="badge bg-blue-50 text-blue-700 text-xs flex items-center gap-1">
                          <Loader className="w-3 h-3 animate-spin" />
                          Generating
                        </span>
                      ) : batch.status === "error" ? (
                        <span className="badge bg-red-50 text-red-700 text-xs">Error</span>
                      ) : (
                        <span className="badge bg-gray-50 text-gray-500 text-xs">Pending</span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {exportState === "complete" && (
          <div className="card border-green-200 bg-green-50/50">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                <CheckCircle className="w-6 h-6 text-confidence-high" />
              </div>
              <div className="flex-1">
                <div className="text-sm font-semibold text-txt-primary mb-1">
                  {batchMode && batchStatuses.length > 1
                    ? `Batch Export Complete (${batchStatuses.length} packages)`
                    : "Export Package Ready"}
                </div>
                <div className="text-xs text-txt-secondary mb-3">
                  {selectedDocs.length} document{selectedDocs.length !== 1 ? "s" : ""} exported with {totalAccepted} withholding{totalAccepted !== 1 ? "s" : ""}.
                  {batchMode && batchStatuses.length > 1
                    ? ` Split across ${batchStatuses.length} batch packages.`
                    : " Package assembled and integrity hash generated."}
                </div>
                <div className="flex items-center gap-2 mb-2">
                  <Shield className="w-4 h-4 text-confidence-high" />
                  <span className="text-xs font-medium text-confidence-high">Redaction verification: PASSED</span>
                </div>

                {/* Single export download */}
                {!batchMode && sha256 && (
                  <div className="text-xs text-txt-secondary mb-3">
                    SHA-256: <span className="font-mono text-[10px]">{sha256.slice(0, 16)}...{sha256.slice(-4)}</span>
                  </div>
                )}
                {!batchMode && (
                  <div className="flex items-center gap-3">
                    <button onClick={handleDownload} className="btn-primary flex items-center gap-2">
                      <Download className="w-4 h-4" />
                      Download Package
                    </button>
                    <button onClick={handleReset} className="btn-secondary text-sm">
                      Generate Another
                    </button>
                  </div>
                )}

                {/* Batch export download links */}
                {batchMode && batchStatuses.length > 0 && (
                  <div className="space-y-2 mb-4">
                    {batchStatuses.map((batch) => (
                      <div
                        key={batch.batchNumber}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-white border border-green-200"
                      >
                        <FileText className="w-4 h-4 text-green-600 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-txt-primary">
                            {batch.filename || `Batch ${batch.batchNumber}`}
                          </div>
                          <div className="text-xs text-txt-secondary">
                            {batch.docCount} documents, {batch.pageCount.toLocaleString()} pages
                            {batch.sha256 && (
                              <span className="ml-2 font-mono text-[10px]">
                                SHA-256: {batch.sha256.slice(0, 12)}...
                              </span>
                            )}
                          </div>
                        </div>
                        {batch.status === "complete" && (
                          <button
                            onClick={() => handleBatchDownload(batch.exportId)}
                            className="btn-primary text-xs flex items-center gap-1.5 !px-3 !py-1.5"
                          >
                            <Download className="w-3.5 h-3.5" />
                            Download
                          </button>
                        )}
                        {batch.status === "error" && (
                          <span className="text-xs text-red-600 font-medium">Failed</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {batchMode && (
                  <button onClick={handleReset} className="btn-secondary text-sm">
                    Generate Another
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {exportState === "error" && (
          <div className="card border-red-200 bg-red-50/50">
            <div className="text-sm font-semibold text-red-700 mb-1">Export Failed</div>
            <div className="text-xs text-red-600 mb-3">{exportError}</div>
            <button onClick={handleReset} className="btn-secondary text-sm">Try Again</button>
          </div>
        )}
      </div>

      {/* Export History */}
      <div className="card !p-0 overflow-hidden">
        <div className="px-5 py-3 border-b border-border bg-surface-bg">
          <h2 className="text-sm font-semibold text-txt-primary">Export History</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-bg/60">
                <th className="text-left px-4 py-2.5 font-medium text-txt-secondary">Timestamp</th>
                <th className="text-left px-4 py-2.5 font-medium text-txt-secondary">Type</th>
                <th className="text-left px-4 py-2.5 font-medium text-txt-secondary">Documents</th>
                <th className="text-left px-4 py-2.5 font-medium text-txt-secondary">Download</th>
                <th className="text-left px-4 py-2.5 font-medium text-txt-secondary">SHA-256</th>
              </tr>
            </thead>
            <tbody>
              {exportState === "complete" && exportFilename && (
                <tr className="border-b border-border hover:bg-surface-hover transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-txt-secondary">
                    {new Date().toLocaleDateString("en-NZ", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </td>
                  <td className="px-4 py-3">
                    <span className="badge bg-blue-50 text-blue-700">
                      {selectedPackage === "requester" ? "Requester" : selectedPackage === "internal" ? "Internal" : "Ombudsman"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-txt-primary font-mono">
                    {selectedDocs.length}
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={handleDownload} className="text-brand-primary hover:underline text-xs flex items-center gap-1">
                      <FileText className="w-3 h-3" />
                      {exportFilename}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-mono text-[10px] text-txt-secondary">
                      {sha256 ? `${sha256.slice(0, 12)}...${sha256.slice(-4)}` : "--"}
                    </span>
                  </td>
                </tr>
              )}
              {exportState !== "complete" && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-txt-secondary">
                    No exports generated yet for this case.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
