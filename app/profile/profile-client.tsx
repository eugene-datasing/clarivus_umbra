"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { User, Building2, Loader2, CheckCircle2 } from "lucide-react";
import { updateProfile } from "@/lib/actions/profile-actions";

interface ProfileClientProps {
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
    departmentId: string | null;
  };
  departments: { id: string; name: string }[];
}

function formatRole(role: string): string {
  return role
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export default function ProfileClient({ user, departments }: ProfileClientProps) {
  const router = useRouter();
  const { update: updateSession } = useSession();
  const [departmentId, setDepartmentId] = useState(user.departmentId || "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const result = await updateProfile({ departmentId: departmentId || null });
      if (result.success) {
        setSaved(true);
        // Refresh the JWT so the session picks up the new departmentId
        await updateSession();
        router.refresh();
        setTimeout(() => setSaved(false), 3000);
      } else {
        setError(result.error || "Failed to save.");
      }
    } catch {
      setError("An unexpected error occurred.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-full bg-brand-primary flex items-center justify-center">
          <User className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-heading font-bold text-txt-primary">Profile</h1>
          <p className="text-sm text-txt-secondary">Manage your account settings</p>
        </div>
      </div>

      <div className="card">
        <div className="space-y-6">
          {/* Read-only fields */}
          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-txt-secondary mb-1">Name</label>
              <p className="text-sm font-medium text-txt-primary">{user.name}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-txt-secondary mb-1">Email</label>
              <p className="text-sm font-medium text-txt-primary font-mono">{user.email}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-txt-secondary mb-1">Role</label>
              <p className="text-sm font-medium text-txt-primary">{formatRole(user.role)}</p>
            </div>
          </div>

          <hr className="border-border" />

          {/* Editable department */}
          <div>
            <label htmlFor="department" className="block text-sm font-medium text-txt-primary mb-1.5">
              <span className="flex items-center gap-1.5">
                <Building2 className="w-4 h-4" />
                Department
              </span>
            </label>
            <p className="text-xs text-txt-secondary mb-2">
              Select which department you belong to. This helps with request routing and review assignment.
            </p>
            <select
              id="department"
              className="input-field max-w-sm"
              value={departmentId}
              onChange={(e) => setDepartmentId(e.target.value)}
            >
              <option value="">-- Select department --</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-card text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              className="btn-primary flex items-center gap-1.5"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : saved ? (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  Saved
                </>
              ) : (
                "Save Changes"
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
