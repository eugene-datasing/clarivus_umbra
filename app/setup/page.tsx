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
import { prisma } from "@/lib/db/prisma";
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
    invitations,
  ] = await Promise.all([
    getSetupWizardState(),
    getOrgIdentity(),
    getOrgBranding(),
    getOrgSignatory(),
    getOrgOmbudsman(),
    getLGOIMAConfig(),
    getConfidenceThresholds(),
    getDepartments(),
    prisma.userInvitation.findMany({ orderBy: { createdAt: "desc" } }),
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
      invitations={invitations.map((inv) => ({
        id: inv.id,
        email: inv.email,
        name: inv.name,
        role: inv.role,
        departmentId: inv.departmentId,
        status: inv.status,
        createdAt: inv.createdAt.toISOString(),
      }))}
    />
  );
}
