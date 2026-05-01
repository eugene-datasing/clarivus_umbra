"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronRight, CheckCircle, Loader } from "lucide-react";
import { createBatch } from "@/lib/actions/batch-actions";

export default function NewBatchClient({
  nextReference,
}: {
  nextReference: string;
}) {
  const router = useRouter();

  const [name, setName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [createdRef, setCreatedRef] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!name.trim()) {
      setError("Please enter a batch name.");
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await createBatch({ name: name.trim() });

      setCreatedRef(result.reference);
      setShowSuccess(true);
      setTimeout(() => {
        router.push(`/batches/${result.id}/ingest`);
      }, 1200);
    } catch {
      setError("Failed to create batch. Please try again.");
      setIsSubmitting(false);
    }
  };

  return (
    <div className="p-6 max-w-[640px]">
      <div className="flex items-center gap-1.5 text-sm text-txt-secondary mb-6">
        <Link href="/batches" className="hover:text-brand-primary transition-colors">
          Batches
        </Link>
        <ChevronRight className="w-3.5 h-3.5" />
        <span className="text-txt-primary font-medium">New Batch</span>
      </div>

      <div className="mb-6">
        <h1 className="text-2xl font-heading font-bold text-txt-primary">New Batch</h1>
        <p className="text-sm text-txt-secondary mt-1">
          Create a new batch to group documents for redaction.
        </p>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-card text-sm text-red-700">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="card space-y-6">
        <div>
          <label className="block text-sm font-medium text-txt-primary mb-1.5">Reference</label>
          <input
            type="text"
            value={nextReference}
            readOnly
            className="input-field bg-surface-bg text-txt-secondary cursor-not-allowed"
          />
          <p className="text-xs text-txt-secondary mt-1">Auto-generated. Cannot be changed.</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-txt-primary mb-1.5">
            Batch Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            placeholder="e.g. May submission responses"
            className="input-field"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            required
          />
          <p className="text-xs text-txt-secondary mt-1">
            Up to 80 characters. Use a name that helps you identify the batch later.
          </p>
        </div>

        <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
          <Link href="/batches" className="btn-secondary">
            Cancel
          </Link>
          <button type="submit" className="btn-primary flex items-center gap-2" disabled={isSubmitting}>
            {isSubmitting && <Loader className="w-4 h-4 animate-spin" />}
            {isSubmitting ? "Creating..." : "Create Batch"}
          </button>
        </div>
      </form>

      {showSuccess && (
        <div className="fixed top-6 right-6 z-50 flex items-center gap-3 bg-white border border-green-200 shadow-lg rounded-card px-5 py-4 animate-[slideIn_0.3s_ease-out]">
          <CheckCircle className="w-5 h-5 text-confidence-high" />
          <div>
            <div className="text-sm font-semibold text-txt-primary">Batch Created</div>
            <div className="text-xs text-txt-secondary">{createdRef} — Redirecting to upload…</div>
          </div>
        </div>
      )}
    </div>
  );
}
