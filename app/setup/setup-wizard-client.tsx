"use client";

import { useState, useTransition, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  Building2,
  UserPlus,
  Palette,
  Upload,
  X,
  Shield,
  CheckCircle,
  ChevronRight,
  ChevronLeft,
  Plus,
  Loader2,
  Mail,
  RotateCw,
  XCircle,
} from "lucide-react";
import type {
  OrgIdentity,
  OrgBranding,
  OrgSignatory,
  ConfidenceThresholds,
} from "@/lib/data/settings";
import {
  saveOrgIdentity,
  saveOrgBranding,
  saveDetectionPolicies,
  completeSetup,
  saveSetupStep,
} from "@/lib/actions/setup-actions";
import {
  inviteUser,
  revokeInvitation,
  resendInvitation,
} from "@/lib/actions/invitation-actions";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Invitation {
  id: string;
  email: string;
  name: string | null;
  role: string;
  status: string;
  createdAt: string;
}

interface SetupWizardClientProps {
  initialStep: number;
  completedSteps: number[];
  orgIdentity: OrgIdentity;
  orgBranding: OrgBranding;
  orgSignatory: OrgSignatory;
  thresholds: ConfidenceThresholds;
  invitations: Invitation[];
}

/* ------------------------------------------------------------------ */
/*  Step configuration                                                 */
/* ------------------------------------------------------------------ */

const STEPS = [
  { label: "Organisation Identity", icon: Building2 },
  { label: "Document Branding", icon: Palette },
  { label: "Detection Policies", icon: Shield },
  { label: "Team Setup", icon: UserPlus },
  { label: "Review & Confirm", icon: CheckCircle },
] as const;

const LAST_STEP = STEPS.length - 1; // 4

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export default function SetupWizardClient({
  initialStep,
  completedSteps: initialCompleted,
  orgIdentity: initialIdentity,
  orgBranding: initialBranding,
  orgSignatory: initialSignatory,
  thresholds: initialThresholds,
  invitations: initialInvitations,
}: SetupWizardClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Wizard state
  const [currentStep, setCurrentStep] = useState(
    Math.min(initialStep, LAST_STEP),
  );
  const [completed, setCompleted] = useState<number[]>(initialCompleted);

  // Step 0: Organisation Identity
  const [identity, setIdentity] = useState<OrgIdentity>(initialIdentity);
  const orgNameLocked = !!initialIdentity.name;
  const orgAbbrLocked = !!initialIdentity.abbreviation;

  // Step 1: Branding
  const [signatory, setSignatory] = useState<OrgSignatory>(initialSignatory);
  const [footerText, setFooterText] = useState(initialBranding.footerText);
  const [logoStorageKey, setLogoStorageKey] = useState(
    initialBranding.logoStorageKey,
  );
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (initialBranding.logoStorageKey) {
      setLogoPreview("/api/logo");
    }
  }, [initialBranding.logoStorageKey]);

  // Step 2: Thresholds
  const [thresholds, setThresholds] =
    useState<ConfidenceThresholds>(initialThresholds);

  // Step 3: Team Setup
  const [invitations, setInvitations] =
    useState<Invitation[]>(initialInvitations);
  const [inviteForm, setInviteForm] = useState({
    email: "",
    name: "",
    role: "reviewer",
  });
  const [showInviteForm, setShowInviteForm] = useState(false);

  // Status
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        await saveOrgBranding({
          logoStorageKey,
          footerText,
          signatory,
        });
        markComplete(1);
      } else if (currentStep === 2) {
        await saveDetectionPolicies({ thresholds });
        markComplete(2);
      } else if (currentStep === 3) {
        markComplete(3);
      }

      const next = Math.min(currentStep + 1, LAST_STEP);
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

  return (
    <div className="min-h-screen flex items-start justify-center py-12 px-4">
      <div className="w-full max-w-5xl">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-full bg-brand-primary flex items-center justify-center mx-auto mb-4">
            <Shield className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-heading font-bold text-txt-primary">
            Umbra Setup Wizard
          </h1>
          <p className="text-sm text-txt-secondary mt-1">
            Configure your organisation before getting started
          </p>
        </div>

        <div className="card p-0 overflow-hidden">
          <div className="flex min-h-[560px]">
            {/* Left sidebar: step indicators */}
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
                        isCurrent &&
                          "bg-white border border-border shadow-sm font-medium text-brand-primary",
                        isCompleted &&
                          !isCurrent &&
                          "text-txt-primary hover:bg-surface-hover",
                        isUpcoming &&
                          "text-txt-secondary/60 hover:text-txt-secondary hover:bg-surface-hover",
                      )}
                    >
                      <span
                        className={cn(
                          "w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-xs font-medium",
                          isCurrent && "bg-brand-primary text-white",
                          isCompleted &&
                            !isCurrent &&
                            "bg-green-100 text-green-700",
                          isUpcoming && "bg-gray-100 text-gray-400",
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
                    style={{
                      width: `${(completed.length / STEPS.length) * 100}%`,
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Right content area */}
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
                      Basic information about your organisation for document
                      headers and correspondence.
                    </p>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                      <div className="col-span-2 sm:col-span-1">
                        <label className="block text-sm font-medium text-txt-primary mb-1.5">
                          Organisation Name <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          className={cn(
                            "input-field",
                            orgNameLocked &&
                              "bg-gray-100 text-txt-secondary cursor-not-allowed",
                          )}
                          placeholder="e.g. Awatere District Council"
                          value={identity.name}
                          onChange={(e) =>
                            !orgNameLocked &&
                            setIdentity({ ...identity, name: e.target.value })
                          }
                          readOnly={orgNameLocked}
                          title={
                            orgNameLocked
                              ? "Set during activation — contact DataSing to change"
                              : undefined
                          }
                        />
                      </div>

                      <div className="col-span-2 sm:col-span-1">
                        <label className="block text-sm font-medium text-txt-primary mb-1.5">
                          Te Reo Maori Name
                        </label>
                        <input
                          type="text"
                          className="input-field"
                          placeholder="e.g. Te Kaunihera o Awatere"
                          value={identity.maoriName}
                          onChange={(e) =>
                            setIdentity({ ...identity, maoriName: e.target.value })
                          }
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-txt-primary mb-1.5">
                          Abbreviation
                        </label>
                        <input
                          type="text"
                          className={cn(
                            "input-field",
                            orgAbbrLocked &&
                              "bg-gray-100 text-txt-secondary cursor-not-allowed",
                          )}
                          placeholder="e.g. ADC"
                          value={identity.abbreviation}
                          onChange={(e) =>
                            !orgAbbrLocked &&
                            setIdentity({
                              ...identity,
                              abbreviation: e.target.value,
                            })
                          }
                          readOnly={orgAbbrLocked}
                          title={
                            orgAbbrLocked
                              ? "Set during activation — contact DataSing to change"
                              : undefined
                          }
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-txt-primary mb-1.5">
                          Organisation Type
                        </label>
                        <select
                          className="input-field"
                          value={identity.orgType}
                          onChange={(e) =>
                            setIdentity({ ...identity, orgType: e.target.value })
                          }
                        >
                          <option value="District Council">District Council</option>
                          <option value="City Council">City Council</option>
                          <option value="Regional Council">Regional Council</option>
                          <option value="Unitary Authority">Unitary Authority</option>
                          <option value="Government Agency">Government Agency</option>
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
                          onChange={(e) =>
                            setIdentity({ ...identity, address: e.target.value })
                          }
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
                          onChange={(e) =>
                            setIdentity({ ...identity, phone: e.target.value })
                          }
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
                          onChange={(e) =>
                            setIdentity({ ...identity, email: e.target.value })
                          }
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
                          onChange={(e) =>
                            setIdentity({ ...identity, website: e.target.value })
                          }
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Step 1: Document Branding */}
                {currentStep === 1 && (
                  <div>
                    <h2 className="text-lg font-heading font-semibold text-txt-primary mb-1">
                      Document Branding
                    </h2>
                    <p className="text-sm text-txt-secondary mb-6">
                      Configure signatory details, logo, and document footer text
                      used in generated PDFs.
                    </p>

                    <h3 className="text-sm font-semibold text-txt-primary mb-3">
                      Signatory Details
                    </h3>
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
                          onChange={(e) =>
                            setSignatory({ ...signatory, name: e.target.value })
                          }
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
                          onChange={(e) =>
                            setSignatory({ ...signatory, title: e.target.value })
                          }
                        />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-sm font-medium text-txt-primary mb-1.5">
                          Department / Team
                        </label>
                        <input
                          type="text"
                          className="input-field"
                          placeholder="e.g. Corporate Services"
                          value={signatory.department}
                          onChange={(e) =>
                            setSignatory({
                              ...signatory,
                              department: e.target.value,
                            })
                          }
                        />
                      </div>
                    </div>

                    <h3 className="text-sm font-semibold text-txt-primary mb-3">
                      Organisation Logo
                    </h3>
                    {logoPreview ? (
                      <div className="border border-border rounded-card p-4 mb-6 flex items-center gap-4">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={logoPreview}
                          alt="Organisation logo"
                          className="h-10 w-auto object-contain"
                        />
                        <span className="text-sm text-txt-secondary flex-1">
                          Logo uploaded
                        </span>
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
                        <p className="text-sm">
                          {logoUploading ? "Uploading..." : "Click to upload your logo"}
                        </p>
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
                          const res = await fetch("/api/logo", {
                            method: "POST",
                            body: fd,
                          });
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

                    <h3 className="text-sm font-semibold text-txt-primary mb-3">
                      Footer Text
                    </h3>
                    <input
                      type="text"
                      className="input-field"
                      placeholder="Optional footer text for generated documents"
                      value={footerText}
                      onChange={(e) => setFooterText(e.target.value)}
                    />
                  </div>
                )}

                {/* Step 2: Detection Policies */}
                {currentStep === 2 && (
                  <div>
                    <h2 className="text-lg font-heading font-semibold text-txt-primary mb-1">
                      Detection Policies
                    </h2>
                    <p className="text-sm text-txt-secondary mb-6">
                      Configure the confidence thresholds used by the AI
                      detection engine to classify findings.
                    </p>

                    <div className="space-y-8">
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
                          Detections at or above this score are classified as
                          High confidence. Auto-applied if enabled.
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
                              high: Math.max(
                                Number(e.target.value),
                                thresholds.medium + 1,
                              ),
                            })
                          }
                        />
                        <div className="flex justify-between text-xs text-txt-secondary mt-1">
                          <span>50%</span>
                          <span>100%</span>
                        </div>
                      </div>

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
                          Detections at or above this score (but below High)
                          are classified as Medium confidence. Requires human
                          review.
                        </p>
                        <input
                          type="range"
                          className="w-full accent-amber-500"
                          min={10}
                          max={thresholds.high - 1}
                          value={thresholds.medium}
                          onChange={(e) =>
                            setThresholds({
                              ...thresholds,
                              medium: Number(e.target.value),
                            })
                          }
                        />
                        <div className="flex justify-between text-xs text-txt-secondary mt-1">
                          <span>10%</span>
                          <span>{thresholds.high - 1}%</span>
                        </div>
                      </div>

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
                              Medium: {thresholds.medium}% &ndash;{" "}
                              {thresholds.high - 1}%
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

                {/* Step 3: Team Setup */}
                {currentStep === 3 && (
                  <div>
                    <h2 className="text-lg font-heading font-semibold text-txt-primary mb-1">
                      Team Setup
                    </h2>
                    <p className="text-sm text-txt-secondary mb-6">
                      Invite team members to Umbra. They will receive an email
                      and can sign in with their organisation Azure AD
                      credentials. You can skip this and invite users later
                      from Admin Settings.
                    </p>

                    <div className="flex items-center gap-3 mb-4">
                      <button
                        className="btn-primary flex items-center gap-1.5"
                        onClick={() => {
                          setInviteForm({
                            email: "",
                            name: "",
                            role: "reviewer",
                          });
                          setShowInviteForm(true);
                        }}
                      >
                        <Plus className="w-4 h-4" />
                        Invite User
                      </button>
                    </div>

                    {showInviteForm && (
                      <div className="mb-4 p-4 bg-surface-bg border border-border rounded-card">
                        <h3 className="text-sm font-medium text-txt-primary mb-3">
                          New Invitation
                        </h3>
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
                              onChange={(e) =>
                                setInviteForm({
                                  ...inviteForm,
                                  email: e.target.value,
                                })
                              }
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
                              onChange={(e) =>
                                setInviteForm({
                                  ...inviteForm,
                                  name: e.target.value,
                                })
                              }
                            />
                          </div>
                          <div className="col-span-2">
                            <label className="block text-xs font-medium text-txt-secondary mb-1">
                              Role
                            </label>
                            <select
                              className="input-field"
                              value={inviteForm.role}
                              onChange={(e) =>
                                setInviteForm({
                                  ...inviteForm,
                                  role: e.target.value,
                                })
                              }
                            >
                              <option value="reviewer">Reviewer</option>
                              <option value="admin">Administrator</option>
                            </select>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 mt-3">
                          <button
                            className="btn-primary text-xs flex items-center gap-1.5"
                            disabled={
                              saving || !inviteForm.email || !inviteForm.name
                            }
                            onClick={async () => {
                              setSaving(true);
                              setError(null);
                              try {
                                const result = await inviteUser({
                                  email: inviteForm.email,
                                  name: inviteForm.name,
                                  role: inviteForm.role,
                                });
                                if (result.success && result.id) {
                                  setInvitations((prev) => [
                                    {
                                      id: result.id!,
                                      email: inviteForm.email.toLowerCase(),
                                      name: inviteForm.name,
                                      role: inviteForm.role,
                                      status: "pending",
                                      createdAt: new Date().toISOString(),
                                    },
                                    ...prev,
                                  ]);
                                  setInviteForm({
                                    email: "",
                                    name: "",
                                    role: "reviewer",
                                  });
                                  setShowInviteForm(false);
                                } else {
                                  setError(
                                    result.error || "Failed to send invitation.",
                                  );
                                }
                              } catch {
                                setError("Failed to send invitation.");
                              } finally {
                                setSaving(false);
                              }
                            }}
                          >
                            {saving ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Mail className="w-3.5 h-3.5" />
                            )}
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

                    {invitations.length > 0 ? (
                      <div className="border border-border rounded-card overflow-hidden">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-border bg-surface-bg">
                              <th className="text-left px-4 py-2.5 font-medium text-txt-secondary">
                                Name
                              </th>
                              <th className="text-left px-4 py-2.5 font-medium text-txt-secondary">
                                Email
                              </th>
                              <th className="text-left px-4 py-2.5 font-medium text-txt-secondary">
                                Role
                              </th>
                              <th className="text-left px-4 py-2.5 font-medium text-txt-secondary">
                                Status
                              </th>
                              <th className="text-right px-4 py-2.5 font-medium text-txt-secondary">
                                Actions
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {invitations.map((inv) => (
                              <tr
                                key={inv.id}
                                className="border-b border-border last:border-0 hover:bg-surface-hover transition-colors"
                              >
                                <td className="px-4 py-2.5 font-medium text-txt-primary">
                                  {inv.name || "--"}
                                </td>
                                <td className="px-4 py-2.5 text-txt-secondary text-xs font-mono">
                                  {inv.email}
                                </td>
                                <td className="px-4 py-2.5 text-txt-secondary capitalize">
                                  {inv.role.replace("-", " ")}
                                </td>
                                <td className="px-4 py-2.5">
                                  <span
                                    className={cn(
                                      "badge text-xs",
                                      inv.status === "pending" &&
                                        "bg-amber-50 text-amber-700",
                                      inv.status === "accepted" &&
                                        "bg-green-50 text-green-700",
                                      inv.status === "revoked" &&
                                        "bg-red-50 text-red-700",
                                    )}
                                  >
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
                                          const result = await revokeInvitation(
                                            inv.id,
                                          );
                                          if (result.success) {
                                            setInvitations((prev) =>
                                              prev.map((i) =>
                                                i.id === inv.id
                                                  ? { ...i, status: "revoked" }
                                                  : i,
                                              ),
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
                          Invite team members above, or skip this step and add
                          users later.
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Step 4: Review & Confirm */}
                {currentStep === 4 && (
                  <div>
                    <h2 className="text-lg font-heading font-semibold text-txt-primary mb-1">
                      Review & Confirm
                    </h2>
                    <p className="text-sm text-txt-secondary mb-6">
                      Review your configuration below. Click &quot;Edit&quot; to
                      return to any section, or &quot;Complete Setup&quot; to
                      finalise.
                    </p>

                    <div className="space-y-6">
                      <div className="card">
                        <div className="flex items-center justify-between mb-3">
                          <h3 className="text-sm font-semibold text-txt-primary flex items-center gap-2">
                            <Building2 className="w-4 h-4 text-brand-primary" />
                            Organisation Identity
                          </h3>
                          <button
                            className="btn-ghost text-xs"
                            onClick={() => goToStep(0)}
                          >
                            Edit
                          </button>
                        </div>
                        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                          <div>
                            <dt className="text-txt-secondary">Name</dt>
                            <dd className="font-medium text-txt-primary">
                              {identity.name || "--"}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-txt-secondary">Te Reo Name</dt>
                            <dd className="font-medium text-txt-primary">
                              {identity.maoriName || "--"}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-txt-secondary">Abbreviation</dt>
                            <dd className="font-medium text-txt-primary">
                              {identity.abbreviation || "--"}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-txt-secondary">Type</dt>
                            <dd className="font-medium text-txt-primary">
                              {identity.orgType}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-txt-secondary">Phone</dt>
                            <dd className="font-medium text-txt-primary">
                              {identity.phone || "--"}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-txt-secondary">Email</dt>
                            <dd className="font-medium text-txt-primary">
                              {identity.email || "--"}
                            </dd>
                          </div>
                        </dl>
                      </div>

                      <div className="card">
                        <div className="flex items-center justify-between mb-3">
                          <h3 className="text-sm font-semibold text-txt-primary flex items-center gap-2">
                            <Palette className="w-4 h-4 text-brand-primary" />
                            Document Branding
                          </h3>
                          <button
                            className="btn-ghost text-xs"
                            onClick={() => goToStep(1)}
                          >
                            Edit
                          </button>
                        </div>
                        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                          <div>
                            <dt className="text-txt-secondary">Signatory</dt>
                            <dd className="font-medium text-txt-primary">
                              {signatory.name || "--"}
                              {signatory.title ? `, ${signatory.title}` : ""}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-txt-secondary">Logo</dt>
                            <dd className="font-medium text-txt-primary">
                              {logoPreview ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={logoPreview}
                                  alt="Logo"
                                  className="h-6 w-auto object-contain"
                                />
                              ) : (
                                "--"
                              )}
                            </dd>
                          </div>
                          <div className="col-span-2">
                            <dt className="text-txt-secondary">Footer</dt>
                            <dd className="font-medium text-txt-primary">
                              {footerText || "--"}
                            </dd>
                          </div>
                        </dl>
                      </div>

                      <div className="card">
                        <div className="flex items-center justify-between mb-3">
                          <h3 className="text-sm font-semibold text-txt-primary flex items-center gap-2">
                            <Shield className="w-4 h-4 text-brand-primary" />
                            Detection Policies
                          </h3>
                          <button
                            className="btn-ghost text-xs"
                            onClick={() => goToStep(2)}
                          >
                            Edit
                          </button>
                        </div>
                        <div className="flex items-center gap-6 text-sm">
                          <div className="flex items-center gap-2">
                            <span className="w-3 h-3 rounded-full bg-green-500" />
                            <span className="text-txt-primary">
                              High: &ge; {thresholds.high}%
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="w-3 h-3 rounded-full bg-amber-400" />
                            <span className="text-txt-primary">
                              Medium: &ge; {thresholds.medium}%
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="w-3 h-3 rounded-full bg-red-400" />
                            <span className="text-txt-primary">
                              Low: &lt; {thresholds.medium}%
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="card">
                        <div className="flex items-center justify-between mb-3">
                          <h3 className="text-sm font-semibold text-txt-primary flex items-center gap-2">
                            <UserPlus className="w-4 h-4 text-brand-primary" />
                            Team Setup
                          </h3>
                          <button
                            className="btn-ghost text-xs"
                            onClick={() => goToStep(3)}
                          >
                            Edit
                          </button>
                        </div>
                        {invitations.length > 0 ? (
                          <div className="text-sm">
                            <p className="text-txt-primary mb-2">
                              {invitations.filter((i) => i.status === "pending")
                                .length}{" "}
                              pending invitation
                              {invitations.filter((i) => i.status === "pending")
                                .length !== 1
                                ? "s"
                                : ""}
                              {invitations.filter((i) => i.status === "accepted")
                                .length > 0 && (
                                <>
                                  ,{" "}
                                  {
                                    invitations.filter(
                                      (i) => i.status === "accepted",
                                    ).length
                                  }{" "}
                                  accepted
                                </>
                              )}
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {invitations
                                .filter((i) => i.status !== "revoked")
                                .map((inv) => (
                                  <span
                                    key={inv.id}
                                    className={cn(
                                      "badge text-xs",
                                      inv.status === "pending" &&
                                        "bg-amber-50 text-amber-700",
                                      inv.status === "accepted" &&
                                        "bg-green-50 text-green-700",
                                    )}
                                  >
                                    {inv.name || inv.email}
                                  </span>
                                ))}
                            </div>
                          </div>
                        ) : (
                          <p className="text-sm text-txt-secondary">
                            No team members invited yet. You can add users later
                            from Admin Settings.
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Footer with navigation */}
              <div className="border-t border-border px-8 py-4 flex items-center justify-between bg-white">
                <button
                  className="btn-ghost flex items-center gap-1.5"
                  onClick={handleBack}
                  disabled={currentStep === 0}
                >
                  <ChevronLeft className="w-4 h-4" />
                  Back
                </button>

                {currentStep < LAST_STEP ? (
                  <button
                    className="btn-primary flex items-center gap-1.5"
                    onClick={handleNext}
                    disabled={saving || isPending}
                  >
                    {saving ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        {currentStep === LAST_STEP - 1
                          ? "Continue to Review"
                          : "Save & Continue"}
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
