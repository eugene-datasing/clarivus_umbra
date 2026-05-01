"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronRight, CheckCircle, Loader } from "lucide-react";
import { createCase } from "@/lib/actions/case-actions";
import { addWorkingDays } from "@/lib/utils";

export default function NewRequestClient({
  nextReference,
  departments,
  defaultResponseDays = 20,
}: {
  nextReference: string;
  departments: string[];
  defaultResponseDays?: number;
}) {
  const router = useRouter();
  const today = new Date().toISOString().split("T")[0];

  const [requesterName, setRequesterName] = useState("");
  const [requesterType, setRequesterType] = useState("Individual");
  const [dateReceived, setDateReceived] = useState(today);
  const [priority, setPriority] = useState("Standard");
  const [selectedDepartments, setSelectedDepartments] = useState<string[]>([]);
  const [description, setDescription] = useState("");

  const statutoryDeadline = addWorkingDays(
    new Date(dateReceived || today),
    defaultResponseDays,
  );
  const deadlineFormatted = statutoryDeadline.toLocaleDateString("en-NZ", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  const toggleDepartment = (dept: string) => {
    setSelectedDepartments((prev) =>
      prev.includes(dept)
        ? prev.filter((d) => d !== dept)
        : [...prev, dept]
    );
  };

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [createdRef, setCreatedRef] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError("");

    if (selectedDepartments.length === 0) {
      setError("Please select at least one department.");
      setIsSubmitting(false);
      return;
    }

    try {
      const result = await createCase({
        requesterName,
        requesterType,
        dateReceived,
        deadline: statutoryDeadline.toISOString().split("T")[0],
        priority,
        departments: selectedDepartments,
        description,
      });

      setCreatedRef(result.reference);
      setShowSuccess(true);
      setTimeout(() => {
        router.push(`/requests/${result.id}/pipeline`);
      }, 1200);
    } catch {
      setError("Failed to create case. Please try again.");
      setIsSubmitting(false);
    }
  };

  return (
    <div className="p-6 max-w-[800px]">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-sm text-txt-secondary mb-6">
        <Link href="/requests" className="hover:text-brand-primary transition-colors">
          Cases
        </Link>
        <ChevronRight className="w-3.5 h-3.5" />
        <span className="text-txt-primary font-medium">New Case</span>
      </div>

      <div className="mb-6">
        <h1 className="text-2xl font-heading font-bold text-txt-primary">New LGOIMA Request</h1>
        <p className="text-sm text-txt-secondary mt-1">
          Create a new case to begin the disclosure workflow.
        </p>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-card text-sm text-red-700">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="card space-y-6">
        {/* Reference */}
        <div>
          <label className="block text-sm font-medium text-txt-primary mb-1.5">
            Reference
          </label>
          <input
            type="text"
            value={nextReference}
            readOnly
            className="input-field bg-surface-bg text-txt-secondary cursor-not-allowed"
          />
          <p className="text-xs text-txt-secondary mt-1">Auto-generated. Cannot be changed.</p>
        </div>

        {/* Requester Name */}
        <div>
          <label className="block text-sm font-medium text-txt-primary mb-1.5">
            Requester Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            placeholder="Full name of the requester"
            className="input-field"
            value={requesterName}
            onChange={(e) => setRequesterName(e.target.value)}
            required
          />
        </div>

        {/* Requester Type */}
        <div>
          <label className="block text-sm font-medium text-txt-primary mb-1.5">
            Requester Type <span className="text-red-500">*</span>
          </label>
          <select
            className="input-field"
            value={requesterType}
            onChange={(e) => setRequesterType(e.target.value)}
          >
            <option value="Individual">Individual</option>
            <option value="Media">Media</option>
            <option value="Organisation">Organisation</option>
            <option value="Political">Political</option>
            <option value="Government">Government</option>
            <option value="Other">Other</option>
          </select>
        </div>

        {/* Date Received + Statutory Deadline side-by-side */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-txt-primary mb-1.5">
              Date Received <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              className="input-field"
              value={dateReceived}
              onChange={(e) => setDateReceived(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-txt-primary mb-1.5">
              Statutory Deadline
            </label>
            <input
              type="text"
              value={`${deadlineFormatted} (+20 working days)`}
              readOnly
              className="input-field bg-surface-bg text-txt-secondary cursor-not-allowed"
            />
            <p className="text-xs text-txt-secondary mt-1">
              Calculated per LGOIMA s12 (20 working days).
            </p>
          </div>
        </div>

        {/* Priority */}
        <div>
          <label className="block text-sm font-medium text-txt-primary mb-1.5">
            Priority
          </label>
          <select
            className="input-field"
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
          >
            <option value="Standard">Standard</option>
            <option value="Urgent">Urgent</option>
            <option value="Extended">Extended</option>
          </select>
        </div>

        {/* Department */}
        <div>
          <label className="block text-sm font-medium text-txt-primary mb-1.5">
            Department(s) <span className="text-red-500">*</span>
          </label>
          <p className="text-xs text-txt-secondary mb-2">
            Select all departments relevant to this request.
          </p>
          <div className="grid grid-cols-2 gap-2">
            {departments.map((dept) => (
              <label
                key={dept}
                className="flex items-center gap-2 p-2 rounded-input border border-border hover:bg-surface-hover cursor-pointer transition-colors text-sm"
              >
                <input
                  type="checkbox"
                  checked={selectedDepartments.includes(dept)}
                  onChange={() => toggleDepartment(dept)}
                  className="rounded border-border text-brand-primary focus:ring-brand-primary/30"
                />
                <span className="text-txt-primary">{dept}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Request Description */}
        <div>
          <label className="block text-sm font-medium text-txt-primary mb-1.5">
            Request Description <span className="text-red-500">*</span>
          </label>
          <textarea
            rows={5}
            placeholder="Full text of the LGOIMA request as received..."
            className="input-field resize-y"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
          />
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
          <Link href="/requests" className="btn-secondary">
            Cancel
          </Link>
          <button type="submit" className="btn-primary flex items-center gap-2" disabled={isSubmitting}>
            {isSubmitting && <Loader className="w-4 h-4 animate-spin" />}
            {isSubmitting ? "Creating..." : "Create Case"}
          </button>
        </div>
      </form>

      {/* Success Toast */}
      {showSuccess && (
        <div className="fixed top-6 right-6 z-50 flex items-center gap-3 bg-white border border-green-200 shadow-lg rounded-card px-5 py-4 animate-[slideIn_0.3s_ease-out]">
          <CheckCircle className="w-5 h-5 text-confidence-high" />
          <div>
            <div className="text-sm font-semibold text-txt-primary">Case Created</div>
            <div className="text-xs text-txt-secondary">{createdRef} — Redirecting to document upload...</div>
          </div>
        </div>
      )}
    </div>
  );
}
