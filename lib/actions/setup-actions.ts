"use server";

import { setSetting, SETTING_KEYS } from "@/lib/data/settings";
import type {
  OrgIdentity,
  OrgBranding,
  OrgSignatory,
  OrgOmbudsman,
  LGOIMAConfig,
  ConfidenceThresholds,
  SetupWizardState,
} from "@/lib/data/settings";
import { getSetupWizardState } from "@/lib/data/org-config";
import { requireUser } from "@/lib/auth/session";

// ---------------------------------------------------------------------------
// Save individual steps
// ---------------------------------------------------------------------------

export async function saveOrgIdentity(data: OrgIdentity) {
  const user = await requireUser();
  await setSetting(SETTING_KEYS.ORG_IDENTITY, data, user.name);
  await markStepCompleted(0);
  return { success: true };
}

export async function saveOrgBranding(data: OrgBranding & { signatory: OrgSignatory; ombudsman: OrgOmbudsman }) {
  const user = await requireUser();
  await setSetting(SETTING_KEYS.ORG_BRANDING, { logoStorageKey: data.logoStorageKey, footerText: data.footerText }, user.name);
  await setSetting(SETTING_KEYS.ORG_SIGNATORY, data.signatory, user.name);
  await setSetting(SETTING_KEYS.ORG_OMBUDSMAN, data.ombudsman, user.name);
  await markStepCompleted(2);
  return { success: true };
}

export async function saveLGOIMAConfig(data: LGOIMAConfig) {
  const user = await requireUser();
  await setSetting(SETTING_KEYS.LGOIMA_CONFIG, data, user.name);
  await markStepCompleted(3);
  return { success: true };
}

export async function saveDetectionPolicies(data: { thresholds: ConfidenceThresholds }) {
  const user = await requireUser();
  await setSetting(SETTING_KEYS.CONFIDENCE_THRESHOLDS, data.thresholds, user.name);
  await markStepCompleted(4);
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

export async function markDepartmentsStepCompleted() {
  await markStepCompleted(1);
  return { success: true };
}

export async function completeSetup() {
  const user = await requireUser();
  const state = await getSetupWizardState();
  state.completedAt = new Date().toISOString();
  state.completedSteps = [0, 1, 2, 3, 4, 5];
  await setSetting(SETTING_KEYS.SETUP_WIZARD_STATE, state, user.name);
  return { success: true };
}

export async function saveSetupStep(step: number) {
  const state = await getSetupWizardState();
  state.currentStep = step;
  await setSetting(SETTING_KEYS.SETUP_WIZARD_STATE, state, "system");
  return { success: true };
}
