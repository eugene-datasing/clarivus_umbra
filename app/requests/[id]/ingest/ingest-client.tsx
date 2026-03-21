"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  Upload,
  CheckCircle,
  Circle,
  XCircle,
  Loader,
  ChevronRight,
  FileText,
  ArrowRight,
  Cloud,
  FolderOpen,
  Settings,
} from "lucide-react";

type DocStatus = "queued" | "processing" | "ready" | "error" | "pending" | "in-review" | "submitted" | "approved" | "rejected" | "released" | "complete" | "signed-off" | "reviewed";

interface DocItem {
  id: string;
  name: string;
  fileType: string;
  sizeKB: number;
  status: DocStatus;
  detectionCount: number;
  pageCount: number;
  processingError?: string;
  duplicateGroup?: string | null;
  queueStep?: string;
  queueProgress?: number;
  queueAttempt?: number;
  totalProcessingMs?: number;
}

type IngestSource = "upload" | "sharepoint";

interface IngestClientProps {
  requestId: string;
  caseReference: string;
  existingDocs: DocItem[];
  m365Configured?: boolean;
}

function StatusIcon({ status }: { status: DocStatus }) {
  switch (status) {
    case "ready":
    case "approved":
    case "released":
    case "complete":
    case "signed-off":
      return <CheckCircle className="w-5 h-5 text-green-500" />;
    case "processing":
      return <Loader className="w-5 h-5 text-blue-500 animate-spin" />;
    case "queued":
    case "pending":
      return <Circle className="w-5 h-5 text-gray-300" />;
    case "in-review":
    case "submitted":
    case "reviewed":
      return <Loader className="w-5 h-5 text-amber-500" />;
    case "error":
    case "rejected":
      return <XCircle className="w-5 h-5 text-red-500" />;
    default:
      return <Circle className="w-5 h-5 text-gray-300" />;
  }
}

const statusLabel: Record<string, { text: string; color: string }> = {
  ready: { text: "Ready for Review", color: "text-amber-600" },
  processing: { text: "Processing", color: "text-blue-600" },
  queued: { text: "Queued", color: "text-gray-500" },
  error: { text: "Error", color: "text-red-600" },
  pending: { text: "Pending", color: "text-gray-500" },
  "in-review": { text: "In Review", color: "text-blue-600" },
  reviewed: { text: "Reviewed (Initial)", color: "text-purple-600" },
  "signed-off": { text: "Signed Off", color: "text-green-600" },
  submitted: { text: "Submitted", color: "text-amber-600" },
  approved: { text: "Approved", color: "text-green-600" },
  rejected: { text: "Rejected", color: "text-red-600" },
  released: { text: "Released", color: "text-purple-600" },
  complete: { text: "Complete", color: "text-green-600" },
};

function formatSize(kb: number): string {
  if (kb >= 1024) return `${(kb / 1024).toFixed(1)} MB`;
  return `${kb} KB`;
}

export default function IngestClient({
  requestId,
  caseReference,
  existingDocs,
  m365Configured = false,
}: IngestClientProps) {
  const [activeSource, setActiveSource] = useState<IngestSource>("upload");
  const [dragActive, setDragActive] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [documents, setDocuments] = useState<DocItem[]>(existingDocs);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  // Counts
  const totalCount = documents.length;
  const readyCount = documents.filter((d) => d.status === "ready").length;
  const processingCount = documents.filter(
    (d) => d.status === "processing"
  ).length;
  const queuedCount = documents.filter((d) => d.status === "queued").length;
  const errorCount = documents.filter((d) => d.status === "error").length;
  const progressPct =
    totalCount > 0 ? Math.round((readyCount / totalCount) * 100) : 0;

  // Poll status for documents that are queued or processing
  const pollStatuses = useCallback(async () => {
    const pendingDocs = documents.filter(
      (d) => d.status === "queued" || d.status === "processing"
    );
    if (pendingDocs.length === 0) return;

    // Batch poll: fetch queue status + individual DB statuses
    const ids = pendingDocs.map((d) => d.id).join(",");
    const [queueRes, ...statusResults] = await Promise.allSettled([
      fetch(`/api/documents/queue-status?ids=${ids}`).then((r) =>
        r.ok ? r.json() : null
      ),
      ...pendingDocs.map((doc) =>
        fetch(`/api/documents/${doc.id}/status`).then((r) =>
          r.ok ? r.json() : null
        )
      ),
    ]);

    // Build a map of queue jobs by docId
    const queueJobs = new Map<string, { step: string; progress: number; attempt: number }>();
    if (queueRes.status === "fulfilled" && queueRes.value?.jobs) {
      for (const job of queueRes.value.jobs) {
        queueJobs.set(job.docId, {
          step: job.step,
          progress: job.progress,
          attempt: job.attempt,
        });
      }
    }

    setDocuments((prev) => {
      const next = [...prev];
      statusResults.forEach((result, i) => {
        if (result.status !== "fulfilled" || !result.value) return;
        const data = result.value;
        const idx = next.findIndex((d) => d.id === pendingDocs[i].id);
        if (idx === -1) return;
        const queueInfo = queueJobs.get(pendingDocs[i].id);
        next[idx] = {
          ...next[idx],
          status: data.status,
          pageCount: data.pageCount ?? next[idx].pageCount,
          detectionCount: data.detectionCount ?? next[idx].detectionCount,
          processingError: data.error ?? undefined,
          queueStep: queueInfo?.step,
          queueProgress: queueInfo?.progress,
          queueAttempt: queueInfo?.attempt,
        };
      });
      return next;
    });
  }, [documents]);

  // Start polling when there are pending docs
  useEffect(() => {
    const hasPending = documents.some(
      (d) => d.status === "queued" || d.status === "processing"
    );
    if (hasPending) {
      pollingRef.current = setInterval(pollStatuses, 2000);
    }
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [documents, pollStatuses]);

  // Upload files and trigger processing
  const uploadFiles = useCallback(
    async (files: FileList | File[]) => {
      setIsUploading(true);
      setUploadError("");

      try {
        const formData = new FormData();
        formData.append("caseId", requestId);
        Array.from(files).forEach((file) => {
          formData.append("files", file);
        });

        const res = await fetch("/api/documents/upload", {
          method: "POST",
          body: formData,
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Upload failed");
        }

        const uploaded: { id: string; name: string; status: string }[] =
          await res.json();

        // Add uploaded docs to local state
        const newDocs: DocItem[] = uploaded.map((u) => ({
          id: u.id,
          name: u.name,
          fileType:
            u.name.split(".").pop()?.toUpperCase() || "UNKNOWN",
          sizeKB: 0,
          status: "queued" as const,
          detectionCount: 0,
          pageCount: 0,
        }));
        setDocuments((prev) => [...newDocs, ...prev]);

        // Trigger processing for each document (fire-and-forget)
        for (const doc of uploaded) {
          fetch(`/api/documents/${doc.id}/process`, { method: "POST" }).catch(
            (err) => console.error(`Failed to trigger processing for ${doc.id}:`, err)
          );
        }
      } catch (err) {
        setUploadError(
          err instanceof Error ? err.message : "Upload failed"
        );
      } finally {
        setIsUploading(false);
      }
    },
    [requestId]
  );

  const handleFileDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragActive(false);
      if (e.dataTransfer.files.length > 0) {
        uploadFiles(e.dataTransfer.files);
      }
    },
    [uploadFiles]
  );

  const handleBrowseClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        uploadFiles(e.target.files);
      }
    },
    [uploadFiles]
  );

  return (
    <div className="p-6 max-w-[1000px]">
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
        <span className="text-txt-primary font-medium">Upload Documents</span>
      </div>

      <div className="mb-6">
        <h1 className="text-2xl font-heading font-bold text-txt-primary">
          Document Ingestion
        </h1>
        <p className="text-sm text-txt-secondary mt-1">
          Upload documents for processing, OCR, and AI-powered detection.
        </p>
      </div>

      {uploadError && (
        <div role="alert" aria-live="assertive" className="mb-4 p-3 bg-red-50 border border-red-200 rounded-card text-sm text-red-700">
          {uploadError}
        </div>
      )}

      {/* Source Tabs */}
      <div className="flex items-center gap-1 border-b border-border mb-6">
        <button
          onClick={() => setActiveSource("upload")}
          className={cn(
            "flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px",
            activeSource === "upload"
              ? "border-brand-primary text-brand-primary"
              : "border-transparent text-txt-secondary hover:text-txt-primary hover:border-gray-300",
          )}
        >
          <Upload className="w-4 h-4" />
          File Upload
        </button>
        <button
          onClick={() => m365Configured && setActiveSource("sharepoint")}
          disabled={!m365Configured}
          className={cn(
            "flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px",
            activeSource === "sharepoint"
              ? "border-brand-primary text-brand-primary"
              : !m365Configured
                ? "border-transparent text-gray-300 cursor-not-allowed"
                : "border-transparent text-txt-secondary hover:text-txt-primary hover:border-gray-300",
          )}
        >
          <Cloud className="w-4 h-4" />
          Import from SharePoint
          {!m365Configured && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-400 ml-1">
              Not configured
            </span>
          )}
        </button>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        accept=".pdf,.docx,.xlsx,.pptx,.eml,.msg,.txt,.png,.jpg,.jpeg,.zip"
        onChange={handleFileSelect}
        aria-label="Upload documents"
      />

      {/* Upload Zone */}
      {activeSource === "upload" && (
      <div
        role="button"
        tabIndex={0}
        aria-label="File upload dropzone. Drag and drop files or click to browse"
        className={cn(
          "card border-2 border-dashed text-center py-16 mb-6 transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-primary/60 focus:ring-offset-1",
          dragActive
            ? "border-brand-primary bg-purple-50/50"
            : "border-border hover:border-brand-primary/40 hover:bg-surface-hover"
        )}
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={handleFileDrop}
        onClick={handleBrowseClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleBrowseClick();
          }
        }}
      >
        <div className="flex flex-col items-center">
          <div className="w-16 h-16 rounded-full bg-purple-50 flex items-center justify-center mb-4">
            {isUploading ? (
              <Loader className="w-8 h-8 text-brand-primary animate-spin" />
            ) : (
              <Upload className="w-8 h-8 text-brand-primary" />
            )}
          </div>
          <h3 className="text-lg font-medium text-txt-primary mb-1">
            {isUploading
              ? "Uploading files..."
              : "Drag and drop files or folders here"}
          </h3>
          <p className="text-sm text-txt-secondary mb-4">
            {isUploading
              ? "Please wait while files are uploaded"
              : "or click to browse your computer"}
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2 text-xs text-txt-secondary">
            <span className="px-2 py-1 bg-surface-bg rounded-badge">PDF</span>
            <span className="px-2 py-1 bg-surface-bg rounded-badge">DOCX</span>
            <span className="px-2 py-1 bg-surface-bg rounded-badge">XLSX</span>
            <span className="px-2 py-1 bg-surface-bg rounded-badge">PPTX</span>
            <span className="px-2 py-1 bg-surface-bg rounded-badge">
              EML / MSG
            </span>
            <span className="px-2 py-1 bg-surface-bg rounded-badge">TXT</span>
            <span className="px-2 py-1 bg-surface-bg rounded-badge">
              Images
            </span>
            <span className="px-2 py-1 bg-surface-bg rounded-badge">ZIP</span>
          </div>
        </div>
      </div>
      )}

      {/* SharePoint Import Panel */}
      {activeSource === "sharepoint" && (
        <div className="mb-6">
          {m365Configured ? (
            <div className="card border-2 border-dashed border-blue-200 bg-blue-50/30">
              <div className="flex flex-col items-center py-8">
                <div className="w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center mb-4">
                  <FolderOpen className="w-8 h-8 text-blue-500" />
                </div>
                <h3 className="text-lg font-medium text-txt-primary mb-1">
                  SharePoint Document Browser
                </h3>
                <p className="text-sm text-txt-secondary mb-6 text-center max-w-md">
                  Browse your connected SharePoint site to select documents for import.
                  Files will be downloaded and processed through the standard ingestion pipeline.
                </p>
                <div className="w-full max-w-lg">
                  <div className="flex items-center gap-2 mb-4">
                    <input
                      type="text"
                      placeholder="Enter folder path (e.g., /Shared Documents/LGOIMA)"
                      className="flex-1 px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary"
                      disabled
                    />
                    <button
                      className="btn-primary text-sm flex items-center gap-1.5 opacity-50 cursor-not-allowed"
                      disabled
                    >
                      <FolderOpen className="w-4 h-4" />
                      Browse
                    </button>
                  </div>
                  <div className="text-xs text-center text-blue-600 bg-blue-50 rounded-lg p-3 border border-blue-200">
                    SharePoint browser will be available when connected to a Microsoft 365 tenant.
                    The folder tree and file selection interface will appear here.
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="card border-2 border-dashed border-gray-200 text-center py-12">
              <div className="flex flex-col items-center">
                <div className="w-16 h-16 rounded-full bg-gray-50 flex items-center justify-center mb-4">
                  <Cloud className="w-8 h-8 text-gray-300" />
                </div>
                <h3 className="text-lg font-medium text-txt-primary mb-1">
                  Microsoft 365 Not Connected
                </h3>
                <p className="text-sm text-txt-secondary mb-4 max-w-md">
                  To import documents from SharePoint or OneDrive, connect your
                  Microsoft 365 account in Admin Settings.
                </p>
                <Link
                  href="/admin/settings"
                  className="btn-secondary flex items-center gap-2 text-sm"
                >
                  <Settings className="w-4 h-4" />
                  Connect Microsoft 365 in Admin Settings
                </Link>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Overall Progress (only show when there are documents) */}
      {totalCount > 0 && (
        <div className="card mb-6" role="status" aria-live="polite">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-heading font-semibold text-txt-primary">
              Processing Progress
            </h2>
            <span className="text-sm font-mono text-txt-primary font-medium">
              {progressPct}% ({readyCount}/{totalCount})
            </span>
          </div>
          <div
            className="h-3 bg-gray-100 rounded-full overflow-hidden"
            role="progressbar"
            aria-valuenow={progressPct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Processing progress: ${progressPct}% complete`}
          >
            <div
              className="h-full bg-brand-primary rounded-full transition-all"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <div className="flex items-center gap-6 mt-3 text-xs text-txt-secondary">
            <div className="flex items-center gap-1.5">
              <CheckCircle className="w-3.5 h-3.5 text-green-500" />
              <span>{readyCount} complete</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Loader className="w-3.5 h-3.5 text-blue-500" />
              <span>{processingCount} processing</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Circle className="w-3.5 h-3.5 text-gray-300" />
              <span>{queuedCount} queued</span>
            </div>
            {errorCount > 0 && (
              <div className="flex items-center gap-1.5">
                <XCircle className="w-3.5 h-3.5 text-red-500" />
                <span>{errorCount} errors</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Processing Queue */}
      {totalCount > 0 && (
        <div className="card mb-6 p-0 overflow-hidden">
          <div className="px-6 py-4 border-b border-border">
            <h2 className="text-sm font-heading font-semibold text-txt-primary">
              Processing Queue
            </h2>
          </div>
          <div className="divide-y divide-border">
            {documents.map((item) => (
              <div
                key={item.id}
                className={cn(
                  "flex items-center gap-4 px-6 py-3 transition-colors duration-500",
                  item.status === "error" && "bg-red-50/50",
                  item.status === "ready" && "bg-green-50/30"
                )}
              >
                <StatusIcon status={item.status} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-txt-secondary flex-shrink-0" />
                    <span className="text-sm font-medium text-txt-primary truncate">
                      {item.name}
                    </span>
                    <span className="text-xs px-1.5 py-0.5 rounded bg-surface-bg text-txt-secondary flex-shrink-0">
                      {item.fileType}
                    </span>
                    {item.duplicateGroup && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-medium flex-shrink-0">
                        Duplicate
                      </span>
                    )}
                    {item.sizeKB > 0 && (
                      <span className="text-xs text-txt-secondary flex-shrink-0">
                        {formatSize(item.sizeKB)}
                      </span>
                    )}
                  </div>
                  {item.status === "processing" && item.queueStep && (
                    <div className="mt-1 ml-6">
                      <div className="flex items-center gap-2">
                        <div
                          className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden max-w-[200px]"
                          role="progressbar"
                          aria-valuenow={item.queueProgress ?? 0}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-label={`Processing ${item.name}: ${item.queueStep}`}
                        >
                          <div
                            className="h-full bg-blue-500 rounded-full transition-all duration-500"
                            style={{ width: `${item.queueProgress ?? 0}%` }}
                          />
                        </div>
                        <span className="text-xs text-txt-secondary">
                          {item.queueStep}
                          {(item.queueAttempt ?? 0) > 1 && ` (attempt ${item.queueAttempt})`}
                        </span>
                      </div>
                    </div>
                  )}
                  {item.status === "ready" && (
                    <p className="text-xs mt-0.5 ml-6 text-txt-secondary">
                      {item.pageCount} pages processed, {item.detectionCount}{" "}
                      detections found
                      {item.totalProcessingMs != null && (
                        <span className="ml-1 font-mono text-txt-secondary/70">
                          ({(item.totalProcessingMs / 1000).toFixed(1)}s)
                        </span>
                      )}
                    </p>
                  )}
                  {item.status === "error" && item.processingError && (
                    <p className="text-xs mt-0.5 ml-6 text-red-600">
                      {item.processingError}
                    </p>
                  )}
                </div>
                <span
                  className={cn(
                    "text-xs font-medium flex-shrink-0",
                    (statusLabel[item.status] ?? statusLabel.pending).color
                  )}
                >
                  {(statusLabel[item.status] ?? statusLabel.pending).text}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Continue button */}
      {totalCount > 0 && (
        <div className="flex items-center justify-end">
          <Link
            href={`/requests/${requestId}`}
            className="btn-primary flex items-center gap-2"
          >
            Continue to Review
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      )}
    </div>
  );
}
