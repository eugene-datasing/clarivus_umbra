import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import {
  getSetupWizardState,
  getOrgIdentity,
  getOrgBranding,
  getOrgSignatory,
  getConfidenceThresholds,
} from "@/lib/data/org-config";
import { prisma } from "@/lib/db/prisma";
import SetupWizardClient from "./setup-wizard-client";

export default async function SetupPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string }>;
}) {
  await requireUser();
  const params = await searchParams;
  const [
    wizardState,
    orgIdentity,
    orgBranding,
    orgSignatory,
    thresholds,
    invitations,
  ] = await Promise.all([
    getSetupWizardState(),
    getOrgIdentity(),
    getOrgBranding(),
    getOrgSignatory(),
    getConfidenceThresholds(),
    prisma.userInvitation.findMany({ orderBy: { createdAt: "desc" } }),
  ]);

  // Allow re-entry when navigating from Settings (?edit=true)
  if (wizardState.completedAt && params.edit !== "true") {
    redirect("/");
  }

  return (
    <SetupWizardClient
      initialStep={wizardState.currentStep}
      completedSteps={wizardState.completedSteps}
      orgIdentity={orgIdentity}
      orgBranding={orgBranding}
      orgSignatory={orgSignatory}
      thresholds={thresholds}
      invitations={invitations.map((inv) => ({
        id: inv.id,
        email: inv.email,
        name: inv.name,
        role: inv.role,
        status: inv.status,
        createdAt: inv.createdAt.toISOString(),
      }))}
    />
  );
}
