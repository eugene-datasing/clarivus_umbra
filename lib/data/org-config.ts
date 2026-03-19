/**
 * Typed getters for organisation configuration settings.
 *
 * Wraps the generic getSetting() with proper types and defaults for each
 * org-related setting key.
 */

import {
  getSetting,
  SETTING_KEYS,
  type OrgIdentity,
  type OrgBranding,
  type OrgSignatory,
  type OrgOmbudsman,
  type LGOIMAConfig,
  type ConfidenceThresholds,
  type SetupWizardState,
  DEFAULT_ORG_IDENTITY,
  DEFAULT_ORG_BRANDING,
  DEFAULT_ORG_SIGNATORY,
  DEFAULT_ORG_OMBUDSMAN,
  DEFAULT_LGOIMA_CONFIG,
  DEFAULT_CONFIDENCE_THRESHOLDS,
  DEFAULT_SETUP_WIZARD_STATE,
} from "./settings";

export async function getOrgIdentity(): Promise<OrgIdentity> {
  return getSetting<OrgIdentity>(SETTING_KEYS.ORG_IDENTITY, DEFAULT_ORG_IDENTITY);
}

export async function getOrgBranding(): Promise<OrgBranding> {
  return getSetting<OrgBranding>(SETTING_KEYS.ORG_BRANDING, DEFAULT_ORG_BRANDING);
}

export async function getOrgSignatory(): Promise<OrgSignatory> {
  return getSetting<OrgSignatory>(SETTING_KEYS.ORG_SIGNATORY, DEFAULT_ORG_SIGNATORY);
}

export async function getOrgOmbudsman(): Promise<OrgOmbudsman> {
  return getSetting<OrgOmbudsman>(SETTING_KEYS.ORG_OMBUDSMAN, DEFAULT_ORG_OMBUDSMAN);
}

export async function getLGOIMAConfig(): Promise<LGOIMAConfig> {
  return getSetting<LGOIMAConfig>(SETTING_KEYS.LGOIMA_CONFIG, DEFAULT_LGOIMA_CONFIG);
}

export async function getConfidenceThresholds(): Promise<ConfidenceThresholds> {
  return getSetting<ConfidenceThresholds>(
    SETTING_KEYS.CONFIDENCE_THRESHOLDS,
    DEFAULT_CONFIDENCE_THRESHOLDS,
  );
}

export async function getSetupWizardState(): Promise<SetupWizardState> {
  return getSetting<SetupWizardState>(
    SETTING_KEYS.SETUP_WIZARD_STATE,
    DEFAULT_SETUP_WIZARD_STATE,
  );
}

export async function isSetupComplete(): Promise<boolean> {
  const state = await getSetupWizardState();
  return !!state.completedAt;
}
