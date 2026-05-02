"use server";

import { setSetting, SETTING_KEYS } from "@/lib/data/settings";
import type {
  OrgIdentity,
  OrgBranding,
  OrgSignatory,
  ConfidenceThresholds,
} from "@/lib/data/settings";
import { getSetupWizardState } from "@/lib/data/org-config";
import { requireUser } from "@/lib/auth/session";
import { requireAdmin } from "@/lib/auth/authorize";

/*
 * Phase 8 — wizard slimmed from 7 steps (Veil) to 5 steps (Umbra):
 *   0 Organisation Identity
 *   1 Document Branding (no Ombudsman block)
 *   2 Detection Policies (was step 4)
 *   3 Team Setup (was step 5; no department dropdown)
 *   4 Review & Confirm (was step 6)
 * Dropped: Departments & Teams (step 1), LGOIMA Workflow (step 3),
 * and the Ombudsman half of the Document Branding step.
 */

export async function saveOrgIdentity(data: OrgIdentity) {
  const user = await requireUser();
  await requireAdmin(user);
  await setSetting(SETTING_KEYS.ORG_IDENTITY, data, user.name);
  await markStepCompleted(0);
  return { success: true };
}

export async function saveOrgBranding(
  data: OrgBranding & { signatory: OrgSignatory },
) {
  const user = await requireUser();
  await requireAdmin(user);
  await setSetting(
    SETTING_KEYS.ORG_BRANDING,
    { logoStorageKey: data.logoStorageKey, footerText: data.footerText },
    user.name,
  );
  await setSetting(SETTING_KEYS.ORG_SIGNATORY, data.signatory, user.name);
  await markStepCompleted(1);
  return { success: true };
}

export async function saveDetectionPolicies(data: {
  thresholds: ConfidenceThresholds;
}) {
  const user = await requireUser();
  await requireAdmin(user);
  await setSetting(
    SETTING_KEYS.CONFIDENCE_THRESHOLDS,
    data.thresholds,
    user.name,
  );
  await markStepCompleted(2);
  return { success: true };
}

// ---------------------------------------------------------------------------
// Wizard state management
// ---------------------------------------------------------------------------

async function markStepCompleted(stepIndex: number) {
  const state = await getSetupWizardState();
  if (!state.completedSteps.includes(stepIndex)) {
    state.completedSteps.push(stepIndex);
  }
  state.currentStep = Math.max(state.currentStep, stepIndex + 1);
  await setSetting(SETTING_KEYS.SETUP_WIZARD_STATE, state, "system");
}

export async function completeSetup() {
  const user = await requireUser();
  await requireAdmin(user);
  const state = await getSetupWizardState();
  state.completedAt = new Date().toISOString();
  state.completedSteps = [0, 1, 2, 3, 4];
  await setSetting(SETTING_KEYS.SETUP_WIZARD_STATE, state, user.name);
  return { success: true };
}

export async function saveSetupStep(step: number) {
  await requireUser();
  const state = await getSetupWizardState();
  state.currentStep = step;
  await setSetting(SETTING_KEYS.SETUP_WIZARD_STATE, state, "system");
  return { success: true };
}
