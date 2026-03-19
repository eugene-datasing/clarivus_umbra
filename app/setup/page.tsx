import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import {
  getSetupWizardState,
  getOrgIdentity,
  getOrgBranding,
  getOrgSignatory,
  getOrgOmbudsman,
  getLGOIMAConfig,
  getConfidenceThresholds,
} from "@/lib/data/org-config";
import { getDepartments } from "@/lib/data/departments";
import SetupWizardClient from "./setup-wizard-client";

export default async function SetupPage() {
  await requireUser();
  const [
    wizardState,
    orgIdentity,
    orgBranding,
    orgSignatory,
    orgOmbudsman,
    lgoimaConfig,
    thresholds,
    departments,
  ] = await Promise.all([
    getSetupWizardState(),
    getOrgIdentity(),
    getOrgBranding(),
    getOrgSignatory(),
    getOrgOmbudsman(),
    getLGOIMAConfig(),
    getConfidenceThresholds(),
    getDepartments(),
  ]);

  if (wizardState.completedAt) {
    redirect("/");
  }

  return (
    <SetupWizardClient
      initialStep={wizardState.currentStep}
      completedSteps={wizardState.completedSteps}
      orgIdentity={orgIdentity}
      orgBranding={orgBranding}
      orgSignatory={orgSignatory}
      orgOmbudsman={orgOmbudsman}
      lgoimaConfig={lgoimaConfig}
      thresholds={thresholds}
      departments={departments.map((d) => ({
        id: d.id,
        name: d.name,
        contactEmail: d.contactEmail,
        headName: d.headName,
      }))}
    />
  );
}
