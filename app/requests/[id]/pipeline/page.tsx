import { getCase } from "@/lib/data/cases";
import {
  getUsersByDepartment,
  getPrivilegedUsers,
  getOtherDepartments,
  getCasePipeline,
  generateDefaultMilestones,
  PIPELINE_STAGES,
} from "@/lib/data/pipeline";
import { initializePipeline } from "@/lib/actions/pipeline-actions";
import { notFound } from "next/navigation";
import PipelineClient from "./pipeline-client";

export default async function PipelineSetupPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const caseData = await getCase(id);
  if (!caseData) notFound();

  // Ensure milestones exist (auto-creates defaults if not)
  await initializePipeline(id);

  // Fetch everything in parallel
  const [departmentUsers, privilegedUsers, otherDepts, pipeline] =
    await Promise.all([
      getUsersByDepartment(caseData.department),
      getPrivilegedUsers(),
      getOtherDepartments(caseData.department),
      getCasePipeline(id),
    ]);

  // Build stage definitions with metadata for the client
  const stages = PIPELINE_STAGES.map((s) => {
    const milestone = pipeline.find((m) => m.stage === s.stage);
    return {
      stage: s.stage,
      label: s.label,
      sortOrder: s.sortOrder,
      accepts: s.accepts as "departments" | "users" | "none",
      auto: s.auto as boolean,
      targetDate: milestone?.targetDate ?? new Date().toISOString(),
      completedAt: milestone?.completedAt ?? null,
      assignments: (milestone?.assignments ?? []).map((a) => ({
        ...a,
        type: a.type as "user" | "department",
      })),
    };
  });

  return (
    <PipelineClient
      caseId={id}
      caseReference={caseData.reference}
      casePriority={caseData.priority}
      departmentUsers={departmentUsers}
      privilegedUsers={privilegedUsers}
      otherDepartments={otherDepts.map((d) => ({
        id: d.id,
        name: d.name,
        users: d.users,
      }))}
      stages={stages}
    />
  );
}
