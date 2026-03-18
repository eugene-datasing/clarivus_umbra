"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import {
  ChevronRight,
  CheckCircle,
  Download,
  FileText,
  Loader,
  Shield,
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
      "Withholding schedule",
      "Covering letter",
      "Original source files",
      "Full audit trail",
      "Decision summary",
    ],
  },
  {
    id: "ombudsman",
    label: "Ombudsman Package",
    description:
      "Full disclosure package in secure format for Ombudsman review",
    includes: [
      "Redacted documents (PDF/A)",
      "Unredacted originals (secure)",
      "Withholding schedule with full reasoning",
      "Complete audit trail (WORM verified)",
      "AI detection reports",
      "Chain-of-custody report",
    ],
  },
];

interface ExportClientProps {
  requestId: string;
  caseReference: string;
  caseDescription: string;
  documentCount: number;
  totalPages: number;
  acceptedDetections: number;
  estimatedSizeKB: number;
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
  documentCount,
  totalPages,
  acceptedDetections,
  estimatedSizeKB,
}: ExportClientProps) {
  const [selectedPackage, setSelectedPackage] =
    useState<PackageType>("internal");
  const [format, setFormat] = useState("pdfa");
  const [batchSize, setBatchSize] = useState("500");
  const [includeCoverLetter, setIncludeCoverLetter] = useState(true);
  const [includeRightOfReview, setIncludeRightOfReview] = useState(true);

  const [exportState, setExportState] = useState<
    "idle" | "generating" | "verifying" | "complete" | "error"
  >("idle");
  const [exportProgress, setExportProgress] = useState(0);
  const [exportStep, setExportStep] = useState("");
  const [exportError, setExportError] = useState("");
  const [exportId, setExportId] = useState<string | null>(null);
  const [downloadKey, setDownloadKey] = useState<string | null>(null);
  const [sha256, setSha256] = useState<string | null>(null);
  const [exportFilename, setExportFilename] = useState<string | null>(null);

  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  // Poll export status
  const pollStatus = useCallback(async () => {
    if (!exportId) return;

    try {
      const res = await fetch(
        `/api/export/${requestId}/${exportId}/status`
      );
      if (!res.ok) return;
      const data = await res.json();

      setExportProgress(data.progress || 0);
      setExportStep(data.currentStep || "");

      if (data.status === "verifying") {
        setExportState("verifying");
      }

      if (data.status === "complete") {
        setExportState("complete");
        setDownloadKey(data.downloadKey || null);
        setSha256(data.sha256 || null);
        setExportFilename(data.filename || null);
        if (pollingRef.current) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
        }
      }

      if (data.status === "error") {
        setExportState("error");
        setExportError(data.error || "Export failed");
        if (pollingRef.current) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
        }
      }
    } catch {
      // Keep polling
    }
  }, [exportId, requestId]);

  useEffect(() => {
    if (
      exportState === "generating" ||
      exportState === "verifying"
    ) {
      pollingRef.current = setInterval(pollStatus, 1500);
    }
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [exportState, pollStatus]);

  const handleGenerate = async () => {
    setExportState("generating");
    setExportProgress(0);
    setExportError("");
    setExportStep("Starting export...");

    try {
      const res = await fetch(`/api/export/${requestId}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          packageType: selectedPackage,
          includeCoverLetter,
          includeRightOfReview,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to start export");
      }

      const data = await res.json();
      setExportId(data.exportId);
    } catch (err) {
      setExportState("error");
      setExportError(
        err instanceof Error ? err.message : "Export failed"
      );
    }
  };

  const handleDownload = () => {
    if (!exportId) return;
    window.open(
      `/api/export/${requestId}/${exportId}/download`,
      "_blank"
    );
  };

  return (
    <div className="p-6 max-w-[1400px]">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-sm text-txt-secondary mb-6">
        <Link
          href="/requests"
          className="hover:text-brand-primary transition-colors"
        >
          Cases
        </Link>
        <ChevronRight className="w-3.5 h-3.5" />
        <Link
          href={`/requests/${requestId}`}
          className="hover:text-brand-primary transition-colors font-mono"
        >
          {caseReference}
        </Link>
        <ChevronRight className="w-3.5 h-3.5" />
        <span className="text-txt-primary font-medium">Export</span>
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-1 border-b border-border mb-6">
        {tabs.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href ? `/requests/${requestId}/${tab.href}` : `/requests/${requestId}`}
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
        <h1 className="text-2xl font-heading font-bold text-txt-primary">
          Export &amp; Release
        </h1>
        <p className="text-sm text-txt-secondary mt-1">
          {caseReference} — {caseDescription}
        </p>
      </div>

      {/* QA Status */}
      <div className="flex items-center gap-2 mb-6">
        <span className="badge bg-green-50 text-confidence-high">
          <CheckCircle className="w-3.5 h-3.5" />
          All checks passed
        </span>
        <Link
          href={`/requests/${requestId}/qa`}
          className="text-xs text-brand-primary hover:underline"
        >
          View QA report
        </Link>
      </div>

      {/* Package selection */}
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
                    <h3 className="text-sm font-semibold text-txt-primary">
                      {pkg.label}
                    </h3>
                    {pkg.recommended && (
                      <span className="badge bg-brand-primary/10 text-brand-primary text-[10px]">
                        Recommended
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-txt-secondary mt-0.5">
                    {pkg.description}
                  </p>
                </div>
                <div
                  className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                    selectedPackage === pkg.id
                      ? "border-brand-primary bg-brand-primary"
                      : "border-gray-300"
                  }`}
                >
                  {selectedPackage === pkg.id && (
                    <div className="w-2 h-2 rounded-full bg-white" />
                  )}
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-border">
                <div className="text-[10px] uppercase tracking-wider text-txt-secondary font-semibold mb-1.5">
                  Includes
                </div>
                <ul className="space-y-1">
                  {pkg.includes.map((item) => (
                    <li
                      key={item}
                      className="flex items-center gap-1.5 text-xs text-txt-secondary"
                    >
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
        <div className="grid grid-cols-2 gap-6">
          <div>
            <label className="block text-xs font-medium text-txt-primary mb-1.5">
              Format
            </label>
            <select
              className="input-field"
              value={format}
              onChange={(e) => setFormat(e.target.value)}
            >
              <option value="pdfa">PDF/A (archival, recommended)</option>
              <option value="pdf">PDF (standard)</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-txt-primary mb-1.5">
              Page Batch Size
            </label>
            <select
              className="input-field"
              value={batchSize}
              onChange={(e) => setBatchSize(e.target.value)}
            >
              <option value="250">250 pages per file</option>
              <option value="500">500 pages per file</option>
              <option value="1000">1,000 pages per file</option>
              <option value="all">All pages in one file</option>
            </select>
          </div>
          <div className="col-span-2 flex items-center gap-6">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={includeCoverLetter}
                onChange={(e) => setIncludeCoverLetter(e.target.checked)}
                className="w-4 h-4 rounded border-border text-brand-primary focus:ring-brand-primary/30"
              />
              <span className="text-sm text-txt-primary">
                Include covering letter
              </span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={includeRightOfReview}
                onChange={(e) =>
                  setIncludeRightOfReview(e.target.checked)
                }
                className="w-4 h-4 rounded border-border text-brand-primary focus:ring-brand-primary/30"
              />
              <span className="text-sm text-txt-primary">
                Include right-of-review statement
              </span>
            </label>
          </div>
        </div>
      </div>

      {/* Export summary */}
      <div className="card mb-6 bg-surface-bg">
        <h2 className="text-xs font-semibold tracking-wider text-txt-secondary uppercase mb-3">
          Export Summary
        </h2>
        <div className="grid grid-cols-4 gap-4">
          <div>
            <div className="text-xs text-txt-secondary">Documents</div>
            <div className="text-lg font-semibold text-txt-primary font-mono">
              {documentCount}
            </div>
          </div>
          <div>
            <div className="text-xs text-txt-secondary">Pages (est.)</div>
            <div className="text-lg font-semibold text-txt-primary font-mono">
              ~{totalPages.toLocaleString()}
            </div>
          </div>
          <div>
            <div className="text-xs text-txt-secondary">Est. Size</div>
            <div className="text-lg font-semibold text-txt-primary font-mono">
              {formatSize(estimatedSizeKB)}
            </div>
          </div>
          <div>
            <div className="text-xs text-txt-secondary">Withholdings</div>
            <div className="text-lg font-semibold text-txt-primary font-mono">
              {acceptedDetections}
            </div>
          </div>
        </div>
      </div>

      {/* Generate button / Progress / Success / Error */}
      <div className="mb-8">
        {exportState === "idle" && (
          <button
            onClick={handleGenerate}
            className="btn-primary flex items-center gap-2 text-base !px-6 !py-3"
          >
            <Download className="w-5 h-5" />
            Generate Export Package
          </button>
        )}

        {(exportState === "generating" || exportState === "verifying") && (
          <div className="card border-brand-primary/20">
            <div className="flex items-center gap-3 mb-3">
              <Loader className="w-5 h-5 text-brand-primary animate-spin" />
              <div>
                <div className="text-sm font-semibold text-txt-primary">
                  {exportState === "generating"
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
              <div
                className="h-full bg-brand-primary rounded-full transition-all duration-200"
                style={{ width: `${exportProgress}%` }}
              />
            </div>
            <div className="text-xs text-txt-secondary text-right mt-1">
              {exportProgress}%
            </div>
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
                  Export Package Ready
                </div>
                <div className="text-xs text-txt-secondary mb-3">
                  All redactions verified as permanent and irreversible.
                  Package assembled and integrity hash generated.
                </div>
                <div className="flex items-center gap-2 mb-2">
                  <Shield className="w-4 h-4 text-confidence-high" />
                  <span className="text-xs font-medium text-confidence-high">
                    Redaction verification: PASSED
                  </span>
                </div>
                {sha256 && (
                  <div className="text-xs text-txt-secondary mb-3">
                    SHA-256:{" "}
                    <span className="font-mono text-[10px]">
                      {sha256.slice(0, 16)}...{sha256.slice(-4)}
                    </span>
                  </div>
                )}
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleDownload}
                    className="btn-primary flex items-center gap-2"
                  >
                    <Download className="w-4 h-4" />
                    Download Package
                  </button>
                  <button
                    onClick={() => {
                      setExportState("idle");
                      setExportId(null);
                      setDownloadKey(null);
                      setSha256(null);
                      setExportFilename(null);
                    }}
                    className="btn-secondary text-sm"
                  >
                    Generate Another
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {exportState === "error" && (
          <div className="card border-red-200 bg-red-50/50">
            <div className="text-sm font-semibold text-red-700 mb-1">
              Export Failed
            </div>
            <div className="text-xs text-red-600 mb-3">
              {exportError}
            </div>
            <button
              onClick={() => setExportState("idle")}
              className="btn-secondary text-sm"
            >
              Try Again
            </button>
          </div>
        )}
      </div>

      {/* Export History */}
      <div className="card !p-0 overflow-hidden">
        <div className="px-5 py-3 border-b border-border bg-surface-bg">
          <h2 className="text-sm font-semibold text-txt-primary">
            Export History
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-bg/60">
                <th className="text-left px-4 py-2.5 font-medium text-txt-secondary">
                  Timestamp
                </th>
                <th className="text-left px-4 py-2.5 font-medium text-txt-secondary">
                  Type
                </th>
                <th className="text-left px-4 py-2.5 font-medium text-txt-secondary">
                  User
                </th>
                <th className="text-left px-4 py-2.5 font-medium text-txt-secondary">
                  Download
                </th>
                <th className="text-left px-4 py-2.5 font-medium text-txt-secondary">
                  SHA-256
                </th>
              </tr>
            </thead>
            <tbody>
              {exportState === "complete" && exportFilename && (
                <tr className="border-b border-border hover:bg-surface-hover transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-txt-secondary">
                    {new Date().toLocaleDateString("en-NZ", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="px-4 py-3">
                    <span className="badge bg-blue-50 text-blue-700">
                      {selectedPackage === "requester"
                        ? "Requester Package"
                        : selectedPackage === "internal"
                          ? "Internal Package"
                          : "Ombudsman Package"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-txt-primary">
                    System
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={handleDownload}
                      className="text-brand-primary hover:underline text-xs flex items-center gap-1"
                    >
                      <FileText className="w-3 h-3" />
                      {exportFilename}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-mono text-[10px] text-txt-secondary">
                      {sha256
                        ? `${sha256.slice(0, 12)}...${sha256.slice(-4)}`
                        : "—"}
                    </span>
                  </td>
                </tr>
              )}
              {exportState !== "complete" && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-8 text-center text-sm text-txt-secondary"
                  >
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
