"use client";

import { useState, useTransition, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  Building2,
  Users,
  UserPlus,
  Palette,
  Upload,
  X,
  Scale,
  Shield,
  CheckCircle,
  ChevronRight,
  ChevronLeft,
  Plus,
  Trash2,
  Edit,
  Loader2,
  Mail,
  RotateCw,
  XCircle,
} from "lucide-react";
import type {
  OrgIdentity,
  OrgBranding,
  OrgSignatory,
  OrgOmbudsman,
  LGOIMAConfig,
  ConfidenceThresholds,
} from "@/lib/data/settings";
import {
  saveOrgIdentity,
  saveOrgBranding,
  saveLGOIMAConfig,
  saveDetectionPolicies,
  markDepartmentsStepCompleted,
  completeSetup,
  saveSetupStep,
} from "@/lib/actions/setup-actions";
import {
  createDepartment,
  updateDepartment,
  deleteDepartment,
  seedDefaultDepartments,
} from "@/lib/actions/department-actions";
import {
  inviteUser,
  revokeInvitation,
  resendInvitation,
} from "@/lib/actions/invitation-actions";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Department {
  id: string;
  name: string;
  contactEmail: string | null;
  headName: string | null;
}

interface Invitation {
  id: string;
  email: string;
  name: string | null;
  role: string;
  departmentId: string | null;
  status: string;
  createdAt: string;
}

interface SetupWizardClientProps {
  initialStep: number;
  completedSteps: number[];
  orgIdentity: OrgIdentity;
  orgBranding: OrgBranding;
  orgSignatory: OrgSignatory;
  orgOmbudsman: OrgOmbudsman;
  lgoimaConfig: LGOIMAConfig;
  thresholds: ConfidenceThresholds;
  departments: Department[];
  invitations: Invitation[];
}

/* ------------------------------------------------------------------ */
/*  Step configuration                                                 */
/* ------------------------------------------------------------------ */

const STEPS = [
  { label: "Organisation Identity", icon: Building2 },
  { label: "Departments & Teams", icon: Users },
  { label: "Document Branding", icon: Palette },
  { label: "LGOIMA Workflow", icon: Scale },
  { label: "Detection Policies", icon: Shield },
  { label: "Team Setup", icon: UserPlus },
  { label: "Review & Confirm", icon: CheckCircle },
] as const;

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export default function SetupWizardClient({
  initialStep,
  completedSteps: initialCompleted,
  orgIdentity: initialIdentity,
  orgBranding: initialBranding,
  orgSignatory: initialSignatory,
  orgOmbudsman: initialOmbudsman,
  lgoimaConfig: initialLgoima,
  thresholds: initialThresholds,
  departments: initialDepartments,
  invitations: initialInvitations,
}: SetupWizardClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Wizard state
  const [currentStep, setCurrentStep] = useState(Math.min(initialStep, 6));
  const [completed, setCompleted] = useState<number[]>(initialCompleted);

  // Step 0: Organisation Identity
  const [identity, setIdentity] = useState<OrgIdentity>(initialIdentity);
  // Fields pre-seeded from activation code are read-only
  const orgNameLocked = !!initialIdentity.name;
  const orgAbbrLocked = !!initialIdentity.abbreviation;

  // Step 1: Departments
  const [departments, setDepartments] = useState<Department[]>(initialDepartments);
  const [deptForm, setDeptForm] = useState<{ name: string; contactEmail: string; headName: string }>({
    name: "",
    contactEmail: "",
    headName: "",
  });
  const [showDeptForm, setShowDeptForm] = useState(false);
  const [editingDeptId, setEditingDeptId] = useState<string | null>(null);

  // Step 2: Branding
  const [signatory, setSignatory] = useState<OrgSignatory>(initialSignatory);
  const [ombudsman, setOmbudsman] = useState<OrgOmbudsman>(initialOmbudsman);
  const [footerText, setFooterText] = useState(initialBranding.footerText);
  const [logoStorageKey, setLogoStorageKey] = useState(initialBranding.logoStorageKey);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  // Load existing logo preview on mount
  useEffect(() => {
    if (initialBranding.logoStorageKey) {
      setLogoPreview("/api/logo");
    }
  }, [initialBranding.logoStorageKey]);

  // Step 3: LGOIMA
  const [lgoima, setLgoima] = useState<LGOIMAConfig>(initialLgoima);

  // Step 4: Thresholds
  const [thresholds, setThresholds] = useState<ConfidenceThresholds>(initialThresholds);

  // Step 5: Team Setup
  const [invitations, setInvitations] = useState<Invitation[]>(initialInvitations);
  const [inviteForm, setInviteForm] = useState({ email: "", name: "", role: "reviewer", departmentId: "" });
  const [showInviteForm, setShowInviteForm] = useState(false);

  // Status
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* ---------------------------------------------------------------- */
  /*  Helpers                                                          */
  /* ---------------------------------------------------------------- */

  function markComplete(step: number) {
    setCompleted((prev) => (prev.includes(step) ? prev : [...prev, step]));
  }

  async function goToStep(step: number) {
    setError(null);
    setCurrentStep(step);
    startTransition(async () => {
      await saveSetupStep(step);
    });
  }

  async function handleNext() {
    setError(null);
    setSaving(true);
    try {
      if (currentStep === 0) {
        if (!identity.name.trim()) {
          setError("Organisation name is required.");
          setSaving(false);
          return;
        }
        await saveOrgIdentity(identity);
        markComplete(0);
      } else if (currentStep === 1) {
        await markDepartmentsStepCompleted();
        markComplete(1);
      } else if (currentStep === 2) {
        await saveOrgBranding({
          logoStorageKey,
          footerText,
          signatory,
          ombudsman,
        });
        markComplete(2);
      } else if (currentStep === 3) {
        await saveLGOIMAConfig(lgoima);
        markComplete(3);
      } else if (currentStep === 4) {
        await saveDetectionPolicies({ thresholds });
        markComplete(4);
      } else if (currentStep === 5) {
        // Team Setup — mark complete (invitations already sent inline)
        markComplete(5);
      }

      const next = Math.min(currentStep + 1, 6);
      setCurrentStep(next);
      startTransition(async () => {
        await saveSetupStep(next);
      });
    } catch {
      setError("Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  function handleBack() {
    setError(null);
    const prev = Math.max(currentStep - 1, 0);
    goToStep(prev);
  }

  async function handleCompleteSetup() {
    setSaving(true);
    setError(null);
    try {
      await completeSetup();
      router.push("/");
      router.refresh();
    } catch {
      setError("Failed to complete setup. Please try again.");
      setSaving(false);
    }
  }

  /* ---------------------------------------------------------------- */
  /*  Department helpers                                               */
  /* ---------------------------------------------------------------- */

  async function handleAddDepartment() {
    if (!deptForm.name.trim()) return;
    setSaving(true);
    try {
      const result = await createDepartment({
        name: deptForm.name,
        contactEmail: deptForm.contactEmail || undefined,
        headName: deptForm.headName || undefined,
      });
      if (result.success && result.id) {
        setDepartments((prev) => [
          ...prev,
          {
            id: result.id!,
            name: deptForm.name,
            contactEmail: deptForm.contactEmail || null,
            headName: deptForm.headName || null,
          },
        ]);
        setDeptForm({ name: "", contactEmail: "", headName: "" });
        setShowDeptForm(false);
      }
    } catch {
      setError("Failed to add department.");
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdateDepartment() {
    if (!editingDeptId || !deptForm.name.trim()) return;
    setSaving(true);
    try {
      await updateDepartment(editingDeptId, {
        name: deptForm.name,
        contactEmail: deptForm.contactEmail || undefined,
        headName: deptForm.headName || undefined,
      });
      setDepartments((prev) =>
        prev.map((d) =>
          d.id === editingDeptId
            ? {
                ...d,
                name: deptForm.name,
                contactEmail: deptForm.contactEmail || null,
                headName: deptForm.headName || null,
              }
            : d
        )
      );
      setDeptForm({ name: "", contactEmail: "", headName: "" });
      setEditingDeptId(null);
      setShowDeptForm(false);
    } catch {
      setError("Failed to update department.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteDepartment(id: string) {
    setSaving(true);
    try {
      await deleteDepartment(id);
      setDepartments((prev) => prev.filter((d) => d.id !== id));
    } catch {
      setError("Failed to delete department.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSeedDepartments() {
    setSaving(true);
    try {
      const result = await seedDefaultDepartments();
      if (result.success && result.seeded && result.seeded > 0) {
        // Refresh to get the fresh department list from the server component
        router.refresh();
      }
    } catch {
      setError("Failed to seed departments.");
    } finally {
      setSaving(false);
    }
  }

  function startEditDepartment(dept: Department) {
    setEditingDeptId(dept.id);
    setDeptForm({
      name: dept.name,
      contactEmail: dept.contactEmail || "",
      headName: dept.headName || "",
    });
    setShowDeptForm(true);
  }

  /* ---------------------------------------------------------------- */
  /*  Render                                                           */
  /* ---------------------------------------------------------------- */

  return (
    <div className="min-h-screen flex items-start justify-center py-12 px-4">
      <div className="w-full max-w-5xl">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-full bg-brand-primary flex items-center justify-center mx-auto mb-4">
            <Shield className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-heading font-bold text-txt-primary">
            Veil Setup Wizard
          </h1>
          <p className="text-sm text-txt-secondary mt-1">
            Configure your organisation before getting started
          </p>
        </div>

        {/* Main card */}
        <div className="card p-0 overflow-hidden">
          <div className="flex min-h-[560px]">
            {/* ---- Left sidebar: step indicators ---- */}
            <div className="w-64 shrink-0 bg-surface-bg border-r border-border p-6">
              <nav className="space-y-1">
                {STEPS.map((step, idx) => {
                  const Icon = step.icon;
                  const isCompleted = completed.includes(idx);
                  const isCurrent = currentStep === idx;
                  const isUpcoming = !isCompleted && !isCurrent;

                  return (
                    <button
                      key={idx}
                      onClick={() => goToStep(idx)}
                      className={cn(
                        "w-full flex items-center gap-3 px-3 py-2.5 rounded-card text-left text-sm transition-colors",
                        isCurrent && "bg-white border border-border shadow-sm font-medium text-brand-primary",
                        isCompleted && !isCurrent && "text-txt-primary hover:bg-surface-hover",
                        isUpcoming && "text-txt-secondary/60 hover:text-txt-secondary hover:bg-surface-hover"
                      )}
                    >
                      <span
                        className={cn(
                          "w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-xs font-medium",
                          isCurrent && "bg-brand-primary text-white",
                          isCompleted && !isCurrent && "bg-green-100 text-green-700",
                          isUpcoming && "bg-gray-100 text-gray-400"
                        )}
                      >
                        {isCompleted && !isCurrent ? (
                          <CheckCircle className="w-4 h-4" />
                        ) : (
                          <Icon className="w-3.5 h-3.5" />
                        )}
                      </span>
                      <span className="truncate">{step.label}</span>
                    </button>
                  );
                })}
              </nav>

              <div className="mt-8 pt-6 border-t border-border">
                <p className="text-xs text-txt-secondary">
                  {completed.length} of {STEPS.length} steps completed
                </p>
                <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-brand-primary rounded-full transition-all duration-300"
                    style={{ width: `${(completed.length / STEPS.length) * 100}%` }}
                  />
                </div>
              </div>
            </div>

            {/* ---- Right content area ---- */}
            <div className="flex-1 flex flex-col">
              <div className="flex-1 p-8 overflow-y-auto">
                {error && (
                  <div className="mb-6 p-3 bg-red-50 border border-red-200 rounded-card text-sm text-red-700">
                    {error}
                  </div>
                )}

                {/* Step 0: Organisation Identity */}
                {currentStep === 0 && (
                  <div>
                    <h2 className="text-lg font-heading font-semibold text-txt-primary mb-1">
                      Organisation Identity
                    </h2>
                    <p className="text-sm text-txt-secondary mb-6">
                      Basic information about your organisation for document headers and correspondence.
                    </p>

                    <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                      <div className="col-span-2 sm:col-span-1">
                        <label className="block text-sm font-medium text-txt-primary mb-1.5">
                          Organisation Name <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          className={cn("input-field", orgNameLocked && "bg-gray-100 text-txt-secondary cursor-not-allowed")}
                          placeholder="e.g. Taranaki District Council"
                          value={identity.name}
                          onChange={(e) => !orgNameLocked && setIdentity({ ...identity, name: e.target.value })}
                          readOnly={orgNameLocked}
                          title={orgNameLocked ? "Set during activation — contact DataSing to change" : undefined}
                        />
                      </div>

                      <div className="col-span-2 sm:col-span-1">
                        <label className="block text-sm font-medium text-txt-primary mb-1.5">
                          Te Reo Maori Name
                        </label>
                        <input
                          type="text"
                          className="input-field"
                          placeholder="e.g. Te Kaunihera o Ngamotu"
                          value={identity.maoriName}
                          onChange={(e) => setIdentity({ ...identity, maoriName: e.target.value })}
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-txt-primary mb-1.5">
                          Abbreviation
                        </label>
                        <input
                          type="text"
                          className={cn("input-field", orgAbbrLocked && "bg-gray-100 text-txt-secondary cursor-not-allowed")}
                          placeholder="e.g. TDC"
                          value={identity.abbreviation}
                          onChange={(e) => !orgAbbrLocked && setIdentity({ ...identity, abbreviation: e.target.value })}
                          readOnly={orgAbbrLocked}
                          title={orgAbbrLocked ? "Set during activation — contact DataSing to change" : undefined}
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-txt-primary mb-1.5">
                          Organisation Type
                        </label>
                        <select
                          className="input-field"
                          value={identity.orgType}
                          onChange={(e) => setIdentity({ ...identity, orgType: e.target.value })}
                        >
                          <option value="District Council">District Council</option>
                          <option value="City Council">City Council</option>
                          <option value="Regional Council">Regional Council</option>
                          <option value="Unitary Authority">Unitary Authority</option>
                        </select>
                      </div>

                      <div className="col-span-2">
                        <label className="block text-sm font-medium text-txt-primary mb-1.5">
                          Address
                        </label>
                        <textarea
                          className="input-field min-h-[72px]"
                          placeholder="Street address, city, postcode"
                          value={identity.address}
                          onChange={(e) => setIdentity({ ...identity, address: e.target.value })}
                          rows={2}
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-txt-primary mb-1.5">
                          Phone
                        </label>
                        <input
                          type="tel"
                          className="input-field"
                          placeholder="e.g. 06 759 6060"
                          value={identity.phone}
                          onChange={(e) => setIdentity({ ...identity, phone: e.target.value })}
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-txt-primary mb-1.5">
                          Email
                        </label>
                        <input
                          type="email"
                          className="input-field"
                          placeholder="e.g. enquiries@council.govt.nz"
                          value={identity.email}
                          onChange={(e) => setIdentity({ ...identity, email: e.target.value })}
                        />
                      </div>

                      <div className="col-span-2">
                        <label className="block text-sm font-medium text-txt-primary mb-1.5">
                          Website
                        </label>
                        <input
                          type="url"
                          className="input-field"
                          placeholder="e.g. https://www.council.govt.nz"
                          value={identity.website}
                          onChange={(e) => setIdentity({ ...identity, website: e.target.value })}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Step 1: Departments & Teams */}
                {currentStep === 1 && (
                  <div>
                    <h2 className="text-lg font-heading font-semibold text-txt-primary mb-1">
                      Departments & Teams
                    </h2>
                    <p className="text-sm text-txt-secondary mb-6">
                      Add the departments and teams within your organisation. These are used
                      for assigning requests and routing reviews.
                    </p>

                    <div className="flex items-center gap-3 mb-4">
                      <button
                        className="btn-primary flex items-center gap-1.5"
                        onClick={() => {
                          setEditingDeptId(null);
                          setDeptForm({ name: "", contactEmail: "", headName: "" });
                          setShowDeptForm(true);
                        }}
                      >
                        <Plus className="w-4 h-4" />
                        Add Department
                      </button>
                      {departments.length === 0 && (
                        <button
                          className="btn-secondary flex items-center gap-1.5"
                          onClick={handleSeedDepartments}
                          disabled={saving}
                        >
                          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Users className="w-4 h-4" />}
                          Seed Default Departments
                        </button>
                      )}
                    </div>

                    {/* Inline add/edit form */}
                    {showDeptForm && (
                      <div className="mb-4 p-4 bg-surface-bg border border-border rounded-card">
                        <h3 className="text-sm font-medium text-txt-primary mb-3">
                          {editingDeptId ? "Edit Department" : "New Department"}
                        </h3>
                        <div className="grid grid-cols-3 gap-4">
                          <div>
                            <label className="block text-xs font-medium text-txt-secondary mb-1">
                              Name <span className="text-red-500">*</span>
                            </label>
                            <input
                              type="text"
                              className="input-field"
                              placeholder="Department name"
                              value={deptForm.name}
                              onChange={(e) => setDeptForm({ ...deptForm, name: e.target.value })}
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-txt-secondary mb-1">
                              Contact Email
                            </label>
                            <input
                              type="email"
                              className="input-field"
                              placeholder="dept@org.govt.nz"
                              value={deptForm.contactEmail}
                              onChange={(e) => setDeptForm({ ...deptForm, contactEmail: e.target.value })}
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-txt-secondary mb-1">
                              Head Person
                            </label>
                            <input
                              type="text"
                              className="input-field"
                              placeholder="Full name"
                              value={deptForm.headName}
                              onChange={(e) => setDeptForm({ ...deptForm, headName: e.target.value })}
                            />
                          </div>
                        </div>
                        <div className="flex items-center gap-2 mt-3">
                          <button
                            className="btn-primary text-xs"
                            onClick={editingDeptId ? handleUpdateDepartment : handleAddDepartment}
                            disabled={saving || !deptForm.name.trim()}
                          >
                            {saving ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : editingDeptId ? (
                              "Update"
                            ) : (
                              "Add"
                            )}
                          </button>
                          <button
                            className="btn-ghost text-xs"
                            onClick={() => {
                              setShowDeptForm(false);
                              setEditingDeptId(null);
                              setDeptForm({ name: "", contactEmail: "", headName: "" });
                            }}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Department table */}
                    {departments.length > 0 ? (
                      <div className="border border-border rounded-card overflow-hidden">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-border bg-surface-bg">
                              <th className="text-left px-4 py-2.5 font-medium text-txt-secondary">Name</th>
                              <th className="text-left px-4 py-2.5 font-medium text-txt-secondary">Contact Email</th>
                              <th className="text-left px-4 py-2.5 font-medium text-txt-secondary">Head Person</th>
                              <th className="text-right px-4 py-2.5 font-medium text-txt-secondary">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {departments.map((dept) => (
                              <tr
                                key={dept.id}
                                className="border-b border-border last:border-0 hover:bg-surface-hover transition-colors"
                              >
                                <td className="px-4 py-2.5 font-medium text-txt-primary">{dept.name}</td>
                                <td className="px-4 py-2.5 text-txt-secondary text-xs font-mono">
                                  {dept.contactEmail || "--"}
                                </td>
                                <td className="px-4 py-2.5 text-txt-secondary">
                                  {dept.headName || "--"}
                                </td>
                                <td className="px-4 py-2.5 text-right">
                                  <button
                                    className="btn-ghost p-1"
                                    title="Edit"
                                    onClick={() => startEditDepartment(dept)}
                                  >
                                    <Edit className="w-4 h-4" />
                                  </button>
                                  <button
                                    className="btn-ghost p-1 text-red-500 hover:text-red-700"
                                    title="Delete"
                                    onClick={() => handleDeleteDepartment(dept.id)}
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="text-center py-12 text-txt-secondary">
                        <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
                        <p className="text-sm">No departments added yet.</p>
                        <p className="text-xs mt-1">
                          Add departments manually or use the seed button above.
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Step 2: Document Branding */}
                {currentStep === 2 && (
                  <div>
                    <h2 className="text-lg font-heading font-semibold text-txt-primary mb-1">
                      Document Branding
                    </h2>
                    <p className="text-sm text-txt-secondary mb-6">
                      Configure signatory details, Ombudsman contact information, and document footer text
                      used in LGOIMA response letters.
                    </p>

                    {/* Signatory */}
                    <h3 className="text-sm font-semibold text-txt-primary mb-3">Signatory Details</h3>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-4 mb-8">
                      <div>
                        <label className="block text-sm font-medium text-txt-primary mb-1.5">
                          Signatory Name
                        </label>
                        <input
                          type="text"
                          className="input-field"
                          placeholder="Full name"
                          value={signatory.name}
                          onChange={(e) => setSignatory({ ...signatory, name: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-txt-primary mb-1.5">
                          Title
                        </label>
                        <input
                          type="text"
                          className="input-field"
                          placeholder="e.g. Information and Privacy Officer"
                          value={signatory.title}
                          onChange={(e) => setSignatory({ ...signatory, title: e.target.value })}
                        />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-sm font-medium text-txt-primary mb-1.5">
                          Department
                        </label>
                        <input
                          type="text"
                          className="input-field"
                          placeholder="e.g. Corporate Services"
                          value={signatory.department}
                          onChange={(e) => setSignatory({ ...signatory, department: e.target.value })}
                        />
                      </div>
                    </div>

                    {/* Ombudsman */}
                    <h3 className="text-sm font-semibold text-txt-primary mb-3">
                      Ombudsman Contact{" "}
                      <span className="font-normal text-txt-secondary">(pre-populated)</span>
                    </h3>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-4 mb-8">
                      <div>
                        <label className="block text-sm font-medium text-txt-primary mb-1.5">
                          Address Line 1
                        </label>
                        <input
                          type="text"
                          className="input-field"
                          value={ombudsman.line1}
                          onChange={(e) => setOmbudsman({ ...ombudsman, line1: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-txt-primary mb-1.5">
                          Address Line 2
                        </label>
                        <input
                          type="text"
                          className="input-field"
                          value={ombudsman.line2}
                          onChange={(e) => setOmbudsman({ ...ombudsman, line2: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-txt-primary mb-1.5">
                          City
                        </label>
                        <input
                          type="text"
                          className="input-field"
                          value={ombudsman.city}
                          onChange={(e) => setOmbudsman({ ...ombudsman, city: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-txt-primary mb-1.5">
                          Phone
                        </label>
                        <input
                          type="tel"
                          className="input-field"
                          value={ombudsman.phone}
                          onChange={(e) => setOmbudsman({ ...ombudsman, phone: e.target.value })}
                        />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-sm font-medium text-txt-primary mb-1.5">
                          Email
                        </label>
                        <input
                          type="email"
                          className="input-field"
                          value={ombudsman.email}
                          onChange={(e) => setOmbudsman({ ...ombudsman, email: e.target.value })}
                        />
                      </div>
                    </div>

                    {/* Logo upload */}
                    <h3 className="text-sm font-semibold text-txt-primary mb-3">Organisation Logo</h3>
                    {logoPreview ? (
                      <div className="border border-border rounded-card p-4 mb-6 flex items-center gap-4">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={logoPreview}
                          alt="Organisation logo"
                          className="h-10 w-auto object-contain"
                        />
                        <span className="text-sm text-txt-secondary flex-1">Logo uploaded</span>
                        <button
                          type="button"
                          className="p-1.5 rounded hover:bg-red-50 text-txt-secondary hover:text-red-600 transition-colors"
                          onClick={async () => {
                            await fetch("/api/logo", { method: "DELETE" });
                            setLogoPreview(null);
                            setLogoStorageKey("");
                          }}
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <div
                        className="border-2 border-dashed border-border rounded-card p-6 text-center text-txt-secondary mb-6 cursor-pointer hover:border-brand-primary/40 hover:bg-brand-primary/5 transition-colors"
                        onClick={() => logoInputRef.current?.click()}
                      >
                        {logoUploading ? (
                          <Loader2 className="w-8 h-8 mx-auto mb-2 opacity-30 animate-spin" />
                        ) : (
                          <Upload className="w-8 h-8 mx-auto mb-2 opacity-30" />
                        )}
                        <p className="text-sm">{logoUploading ? "Uploading..." : "Click to upload your logo"}</p>
                        <p className="text-xs mt-1 opacity-60">PNG or JPEG, max 2 MB</p>
                      </div>
                    )}
                    <input
                      ref={logoInputRef}
                      type="file"
                      accept="image/png,image/jpeg"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        setLogoUploading(true);
                        try {
                          const fd = new FormData();
                          fd.append("logo", file);
                          const res = await fetch("/api/logo", { method: "POST", body: fd });
                          const json = await res.json();
                          if (json.success) {
                            setLogoStorageKey(json.storageKey);
                            setLogoPreview(URL.createObjectURL(file));
                          } else {
                            setError(json.error || "Logo upload failed.");
                          }
                        } catch {
                          setError("Logo upload failed.");
                        } finally {
                          setLogoUploading(false);
                          e.target.value = "";
                        }
                      }}
                    />

                    {/* Footer Text */}
                    <h3 className="text-sm font-semibold text-txt-primary mb-3">Footer Text</h3>
                    <input
                      type="text"
                      className="input-field"
                      placeholder="Optional footer text for generated documents"
                      value={footerText}
                      onChange={(e) => setFooterText(e.target.value)}
                    />
                  </div>
                )}

                {/* Step 3: LGOIMA Workflow */}
                {currentStep === 3 && (
                  <div>
                    <h2 className="text-lg font-heading font-semibold text-txt-primary mb-1">
                      LGOIMA Workflow Configuration
                    </h2>
                    <p className="text-sm text-txt-secondary mb-6">
                      Set statutory response timeframes and escalation triggers for LGOIMA requests.
                    </p>

                    <div className="space-y-6">
                      <div className="card bg-surface-bg">
                        <label className="block text-sm font-medium text-txt-primary mb-1.5">
                          Default Response Days
                        </label>
                        <p className="text-xs text-txt-secondary mb-2">
                          The standard number of working days to respond to an LGOIMA request (statutory default: 20).
                        </p>
                        <input
                          type="number"
                          className="input-field w-32"
                          value={lgoima.defaultResponseDays}
                          onChange={(e) =>
                            setLgoima({ ...lgoima, defaultResponseDays: Number(e.target.value) })
                          }
                          min={1}
                          max={60}
                        />
                      </div>

                      <div className="card bg-surface-bg">
                        <label className="block text-sm font-medium text-txt-primary mb-1.5">
                          Maximum Extension Days
                        </label>
                        <p className="text-xs text-txt-secondary mb-2">
                          The maximum number of working days allowed when extending a response deadline.
                        </p>
                        <input
                          type="number"
                          className="input-field w-32"
                          value={lgoima.extensionMaxDays}
                          onChange={(e) =>
                            setLgoima({ ...lgoima, extensionMaxDays: Number(e.target.value) })
                          }
                          min={1}
                          max={120}
                        />
                      </div>

                      <div className="card bg-surface-bg">
                        <label className="block text-sm font-medium text-txt-primary mb-1.5">
                          Escalation Threshold Days
                        </label>
                        <p className="text-xs text-txt-secondary mb-2">
                          Number of working days remaining before automatic escalation alerts are triggered.
                        </p>
                        <input
                          type="number"
                          className="input-field w-32"
                          value={lgoima.escalationThresholdDays}
                          onChange={(e) =>
                            setLgoima({ ...lgoima, escalationThresholdDays: Number(e.target.value) })
                          }
                          min={1}
                          max={30}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Step 4: Detection Policies */}
                {currentStep === 4 && (
                  <div>
                    <h2 className="text-lg font-heading font-semibold text-txt-primary mb-1">
                      Detection Policies
                    </h2>
                    <p className="text-sm text-txt-secondary mb-6">
                      Configure the confidence thresholds used by the AI detection engine to classify findings.
                    </p>

                    <div className="space-y-8">
                      {/* High threshold */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <label className="text-sm font-medium text-txt-primary">
                            High Confidence Threshold
                          </label>
                          <span className="text-sm font-mono font-medium text-green-700">
                            {thresholds.high}%
                          </span>
                        </div>
                        <p className="text-xs text-txt-secondary mb-3">
                          Detections at or above this score are classified as High confidence. Auto-applied if enabled.
                        </p>
                        <input
                          type="range"
                          className="w-full accent-green-600"
                          min={50}
                          max={100}
                          value={thresholds.high}
                          onChange={(e) =>
                            setThresholds({
                              ...thresholds,
                              high: Math.max(Number(e.target.value), thresholds.medium + 1),
                            })
                          }
                        />
                        <div className="flex justify-between text-xs text-txt-secondary mt-1">
                          <span>50%</span>
                          <span>100%</span>
                        </div>
                      </div>

                      {/* Medium threshold */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <label className="text-sm font-medium text-txt-primary">
                            Medium Confidence Threshold
                          </label>
                          <span className="text-sm font-mono font-medium text-amber-600">
                            {thresholds.medium}%
                          </span>
                        </div>
                        <p className="text-xs text-txt-secondary mb-3">
                          Detections at or above this score (but below High) are classified as Medium confidence. Requires human review.
                        </p>
                        <input
                          type="range"
                          className="w-full accent-amber-500"
                          min={10}
                          max={thresholds.high - 1}
                          value={thresholds.medium}
                          onChange={(e) =>
                            setThresholds({ ...thresholds, medium: Number(e.target.value) })
                          }
                        />
                        <div className="flex justify-between text-xs text-txt-secondary mt-1">
                          <span>10%</span>
                          <span>{thresholds.high - 1}%</span>
                        </div>
                      </div>

                      {/* Display summary */}
                      <div className="card bg-surface-bg">
                        <h3 className="text-sm font-semibold text-txt-primary mb-3">
                          Resulting Classification
                        </h3>
                        <div className="space-y-2">
                          <div className="flex items-center gap-3">
                            <span className="w-3 h-3 rounded-full bg-green-500" />
                            <span className="text-sm text-txt-primary">
                              High: {thresholds.high}% &ndash; 100%
                            </span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="w-3 h-3 rounded-full bg-amber-400" />
                            <span className="text-sm text-txt-primary">
                              Medium: {thresholds.medium}% &ndash; {thresholds.high - 1}%
                            </span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="w-3 h-3 rounded-full bg-red-400" />
                            <span className="text-sm text-txt-primary">
                              Low: below {thresholds.medium}%
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Step 5: Team Setup */}
                {currentStep === 5 && (
                  <div>
                    <h2 className="text-lg font-heading font-semibold text-txt-primary mb-1">
                      Team Setup
                    </h2>
                    <p className="text-sm text-txt-secondary mb-6">
                      Invite team members to Veil. They will receive an email and can sign in with their
                      organisation Azure AD credentials. You can skip this and invite users later from Admin Settings.
                    </p>

                    <div className="flex items-center gap-3 mb-4">
                      <button
                        className="btn-primary flex items-center gap-1.5"
                        onClick={() => {
                          setInviteForm({ email: "", name: "", role: "reviewer", departmentId: "" });
                          setShowInviteForm(true);
                        }}
                      >
                        <Plus className="w-4 h-4" />
                        Invite User
                      </button>
                    </div>

                    {/* Invite form */}
                    {showInviteForm && (
                      <div className="mb-4 p-4 bg-surface-bg border border-border rounded-card">
                        <h3 className="text-sm font-medium text-txt-primary mb-3">New Invitation</h3>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs font-medium text-txt-secondary mb-1">
                              Email <span className="text-red-500">*</span>
                            </label>
                            <input
                              type="email"
                              className="input-field"
                              placeholder="user@org.govt.nz"
                              value={inviteForm.email}
                              onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-txt-secondary mb-1">
                              Display Name <span className="text-red-500">*</span>
                            </label>
                            <input
                              type="text"
                              className="input-field"
                              placeholder="Full name"
                              value={inviteForm.name}
                              onChange={(e) => setInviteForm({ ...inviteForm, name: e.target.value })}
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-txt-secondary mb-1">Role</label>
                            <select
                              className="input-field"
                              value={inviteForm.role}
                              onChange={(e) => setInviteForm({ ...inviteForm, role: e.target.value })}
                            >
                              <option value="reviewer">Reviewer</option>
                              <option value="senior-reviewer">Senior Reviewer</option>
                              <option value="request-manager">Request Manager</option>
                              <option value="admin">Administrator</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-txt-secondary mb-1">Department</label>
                            <select
                              className="input-field"
                              value={inviteForm.departmentId}
                              onChange={(e) => setInviteForm({ ...inviteForm, departmentId: e.target.value })}
                            >
                              <option value="">-- None --</option>
                              {departments.map((d) => (
                                <option key={d.id} value={d.id}>{d.name}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 mt-3">
                          <button
                            className="btn-primary text-xs flex items-center gap-1.5"
                            disabled={saving || !inviteForm.email || !inviteForm.name}
                            onClick={async () => {
                              setSaving(true);
                              setError(null);
                              try {
                                const result = await inviteUser({
                                  email: inviteForm.email,
                                  name: inviteForm.name,
                                  role: inviteForm.role,
                                  departmentId: inviteForm.departmentId || undefined,
                                });
                                if (result.success && result.id) {
                                  setInvitations((prev) => [
                                    {
                                      id: result.id!,
                                      email: inviteForm.email.toLowerCase(),
                                      name: inviteForm.name,
                                      role: inviteForm.role,
                                      departmentId: inviteForm.departmentId || null,
                                      status: "pending",
                                      createdAt: new Date().toISOString(),
                                    },
                                    ...prev,
                                  ]);
                                  setInviteForm({ email: "", name: "", role: "reviewer", departmentId: "" });
                                  setShowInviteForm(false);
                                } else {
                                  setError(result.error || "Failed to send invitation.");
                                }
                              } catch {
                                setError("Failed to send invitation.");
                              } finally {
                                setSaving(false);
                              }
                            }}
                          >
                            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />}
                            Send Invitation
                          </button>
                          <button
                            className="btn-ghost text-xs"
                            onClick={() => setShowInviteForm(false)}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Invitations table */}
                    {invitations.length > 0 ? (
                      <div className="border border-border rounded-card overflow-hidden">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-border bg-surface-bg">
                              <th className="text-left px-4 py-2.5 font-medium text-txt-secondary">Name</th>
                              <th className="text-left px-4 py-2.5 font-medium text-txt-secondary">Email</th>
                              <th className="text-left px-4 py-2.5 font-medium text-txt-secondary">Role</th>
                              <th className="text-left px-4 py-2.5 font-medium text-txt-secondary">Status</th>
                              <th className="text-right px-4 py-2.5 font-medium text-txt-secondary">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {invitations.map((inv) => (
                              <tr key={inv.id} className="border-b border-border last:border-0 hover:bg-surface-hover transition-colors">
                                <td className="px-4 py-2.5 font-medium text-txt-primary">{inv.name || "--"}</td>
                                <td className="px-4 py-2.5 text-txt-secondary text-xs font-mono">{inv.email}</td>
                                <td className="px-4 py-2.5 text-txt-secondary capitalize">{inv.role.replace("-", " ")}</td>
                                <td className="px-4 py-2.5">
                                  <span className={cn(
                                    "badge text-xs",
                                    inv.status === "pending" && "bg-amber-50 text-amber-700",
                                    inv.status === "accepted" && "bg-green-50 text-green-700",
                                    inv.status === "revoked" && "bg-red-50 text-red-700",
                                  )}>
                                    {inv.status}
                                  </span>
                                </td>
                                <td className="px-4 py-2.5 text-right">
                                  {inv.status === "pending" && (
                                    <>
                                      <button
                                        className="btn-ghost p-1"
                                        title="Resend"
                                        onClick={async () => {
                                          await resendInvitation(inv.id);
                                        }}
                                      >
                                        <RotateCw className="w-4 h-4" />
                                      </button>
                                      <button
                                        className="btn-ghost p-1 text-red-500 hover:text-red-700"
                                        title="Revoke"
                                        onClick={async () => {
                                          const result = await revokeInvitation(inv.id);
                                          if (result.success) {
                                            setInvitations((prev) =>
                                              prev.map((i) => i.id === inv.id ? { ...i, status: "revoked" } : i)
                                            );
                                          }
                                        }}
                                      >
                                        <XCircle className="w-4 h-4" />
                                      </button>
                                    </>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="text-center py-12 text-txt-secondary">
                        <UserPlus className="w-10 h-10 mx-auto mb-3 opacity-30" />
                        <p className="text-sm">No invitations sent yet.</p>
                        <p className="text-xs mt-1">
                          Invite team members above, or skip this step and add users later.
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Step 6: Review & Confirm */}
                {currentStep === 6 && (
                  <div>
                    <h2 className="text-lg font-heading font-semibold text-txt-primary mb-1">
                      Review & Confirm
                    </h2>
                    <p className="text-sm text-txt-secondary mb-6">
                      Review your configuration below. Click &quot;Edit&quot; to return to any section, or
                      &quot;Complete Setup&quot; to finalise.
                    </p>

                    <div className="space-y-6">
                      {/* Organisation Identity summary */}
                      <div className="card">
                        <div className="flex items-center justify-between mb-3">
                          <h3 className="text-sm font-semibold text-txt-primary flex items-center gap-2">
                            <Building2 className="w-4 h-4 text-brand-primary" />
                            Organisation Identity
                          </h3>
                          <button className="btn-ghost text-xs" onClick={() => goToStep(0)}>
                            Edit
                          </button>
                        </div>
                        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                          <div>
                            <dt className="text-txt-secondary">Name</dt>
                            <dd className="font-medium text-txt-primary">{identity.name || "--"}</dd>
                          </div>
                          <div>
                            <dt className="text-txt-secondary">Te Reo Name</dt>
                            <dd className="font-medium text-txt-primary">{identity.maoriName || "--"}</dd>
                          </div>
                          <div>
                            <dt className="text-txt-secondary">Abbreviation</dt>
                            <dd className="font-medium text-txt-primary">{identity.abbreviation || "--"}</dd>
                          </div>
                          <div>
                            <dt className="text-txt-secondary">Type</dt>
                            <dd className="font-medium text-txt-primary">{identity.orgType}</dd>
                          </div>
                          <div>
                            <dt className="text-txt-secondary">Phone</dt>
                            <dd className="font-medium text-txt-primary">{identity.phone || "--"}</dd>
                          </div>
                          <div>
                            <dt className="text-txt-secondary">Email</dt>
                            <dd className="font-medium text-txt-primary">{identity.email || "--"}</dd>
                          </div>
                        </dl>
                      </div>

                      {/* Departments summary */}
                      <div className="card">
                        <div className="flex items-center justify-between mb-3">
                          <h3 className="text-sm font-semibold text-txt-primary flex items-center gap-2">
                            <Users className="w-4 h-4 text-brand-primary" />
                            Departments
                          </h3>
                          <button className="btn-ghost text-xs" onClick={() => goToStep(1)}>
                            Edit
                          </button>
                        </div>
                        {departments.length > 0 ? (
                          <div className="flex flex-wrap gap-2">
                            {departments.map((d) => (
                              <span key={d.id} className="badge bg-purple-50 text-purple-700">
                                {d.name}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-txt-secondary">No departments configured.</p>
                        )}
                      </div>

                      {/* Branding summary */}
                      <div className="card">
                        <div className="flex items-center justify-between mb-3">
                          <h3 className="text-sm font-semibold text-txt-primary flex items-center gap-2">
                            <Palette className="w-4 h-4 text-brand-primary" />
                            Document Branding
                          </h3>
                          <button className="btn-ghost text-xs" onClick={() => goToStep(2)}>
                            Edit
                          </button>
                        </div>
                        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                          <div>
                            <dt className="text-txt-secondary">Signatory</dt>
                            <dd className="font-medium text-txt-primary">
                              {signatory.name || "--"}{signatory.title ? `, ${signatory.title}` : ""}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-txt-secondary">Ombudsman Email</dt>
                            <dd className="font-medium text-txt-primary">{ombudsman.email}</dd>
                          </div>
                          <div>
                            <dt className="text-txt-secondary">Logo</dt>
                            <dd className="font-medium text-txt-primary">
                              {logoPreview ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={logoPreview} alt="Logo" className="h-6 w-auto object-contain" />
                              ) : "--"}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-txt-secondary">Footer</dt>
                            <dd className="font-medium text-txt-primary">{footerText || "--"}</dd>
                          </div>
                        </dl>
                      </div>

                      {/* LGOIMA summary */}
                      <div className="card">
                        <div className="flex items-center justify-between mb-3">
                          <h3 className="text-sm font-semibold text-txt-primary flex items-center gap-2">
                            <Scale className="w-4 h-4 text-brand-primary" />
                            LGOIMA Workflow
                          </h3>
                          <button className="btn-ghost text-xs" onClick={() => goToStep(3)}>
                            Edit
                          </button>
                        </div>
                        <dl className="grid grid-cols-3 gap-x-6 gap-y-2 text-sm">
                          <div>
                            <dt className="text-txt-secondary">Response Days</dt>
                            <dd className="font-medium text-txt-primary">{lgoima.defaultResponseDays}</dd>
                          </div>
                          <div>
                            <dt className="text-txt-secondary">Max Extension</dt>
                            <dd className="font-medium text-txt-primary">{lgoima.extensionMaxDays} days</dd>
                          </div>
                          <div>
                            <dt className="text-txt-secondary">Escalation Threshold</dt>
                            <dd className="font-medium text-txt-primary">{lgoima.escalationThresholdDays} days</dd>
                          </div>
                        </dl>
                      </div>

                      {/* Detection summary */}
                      <div className="card">
                        <div className="flex items-center justify-between mb-3">
                          <h3 className="text-sm font-semibold text-txt-primary flex items-center gap-2">
                            <Shield className="w-4 h-4 text-brand-primary" />
                            Detection Policies
                          </h3>
                          <button className="btn-ghost text-xs" onClick={() => goToStep(4)}>
                            Edit
                          </button>
                        </div>
                        <div className="flex items-center gap-6 text-sm">
                          <div className="flex items-center gap-2">
                            <span className="w-3 h-3 rounded-full bg-green-500" />
                            <span className="text-txt-primary">High: &ge; {thresholds.high}%</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="w-3 h-3 rounded-full bg-amber-400" />
                            <span className="text-txt-primary">Medium: &ge; {thresholds.medium}%</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="w-3 h-3 rounded-full bg-red-400" />
                            <span className="text-txt-primary">Low: &lt; {thresholds.medium}%</span>
                          </div>
                        </div>
                      </div>

                      {/* Team Setup summary */}
                      <div className="card">
                        <div className="flex items-center justify-between mb-3">
                          <h3 className="text-sm font-semibold text-txt-primary flex items-center gap-2">
                            <UserPlus className="w-4 h-4 text-brand-primary" />
                            Team Setup
                          </h3>
                          <button className="btn-ghost text-xs" onClick={() => goToStep(5)}>
                            Edit
                          </button>
                        </div>
                        {invitations.length > 0 ? (
                          <div className="text-sm">
                            <p className="text-txt-primary mb-2">
                              {invitations.filter((i) => i.status === "pending").length} pending invitation{invitations.filter((i) => i.status === "pending").length !== 1 ? "s" : ""}
                              {invitations.filter((i) => i.status === "accepted").length > 0 && (
                                <>, {invitations.filter((i) => i.status === "accepted").length} accepted</>
                              )}
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {invitations.filter((i) => i.status !== "revoked").map((inv) => (
                                <span key={inv.id} className={cn(
                                  "badge text-xs",
                                  inv.status === "pending" && "bg-amber-50 text-amber-700",
                                  inv.status === "accepted" && "bg-green-50 text-green-700",
                                )}>
                                  {inv.name || inv.email}
                                </span>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <p className="text-sm text-txt-secondary">No team members invited yet. You can add users later from Admin Settings.</p>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* ---- Footer with navigation ---- */}
              <div className="border-t border-border px-8 py-4 flex items-center justify-between bg-white">
                <button
                  className="btn-ghost flex items-center gap-1.5"
                  onClick={handleBack}
                  disabled={currentStep === 0}
                >
                  <ChevronLeft className="w-4 h-4" />
                  Back
                </button>

                {currentStep < 6 ? (
                  <button
                    className="btn-primary flex items-center gap-1.5"
                    onClick={handleNext}
                    disabled={saving || isPending}
                  >
                    {saving ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        {currentStep === 5 ? "Continue to Review" : "Save & Continue"}
                        <ChevronRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                ) : (
                  <button
                    className="btn-primary flex items-center gap-1.5 bg-green-600 hover:bg-green-700"
                    onClick={handleCompleteSetup}
                    disabled={saving}
                  >
                    {saving ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <CheckCircle className="w-4 h-4" />
                        Complete Setup
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
