import { getCase } from "@/lib/data/cases";
import {
  getUsersByDepartment,
  getPrivilegedUsers,
  getOtherDepartments,
  getCasePipeline,
  generateDefaultMilestones,
  PIPELINE_STAGES,
} from "@/lib/data/pipeline";
import { getCaseProcessingMetrics } from "@/lib/data/processing-metrics";
import { initializePipeline } from "@/lib/actions/pipeline-actions";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { authorizeForCase } from "@/lib/auth/authorize";
import PipelineClient from "./pipeline-client";
import ProcessingPerformance from "./processing-performance";

export default async function PipelineSetupPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  await authorizeForCase(user, id);
  const caseData = await getCase(id);
  if (!caseData) notFound();

  // Ensure milestones exist (auto-creates defaults if not)
  await initializePipeline(id);

  // Fetch everything in parallel
  const [departmentUsers, privilegedUsers, otherDepts, pipeline, processingMetrics] =
    await Promise.all([
      getUsersByDepartment(caseData.department),
      getPrivilegedUsers(),
      getOtherDepartments(caseData.department),
      getCasePipeline(id),
      getCaseProcessingMetrics(id),
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
    <>
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
      {/* Processing Performance Section */}
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 pb-8">
        <ProcessingPerformance
          documents={processingMetrics.documents}
          totalPages={processingMetrics.totalPages}
          avgTotalMs={processingMetrics.avgTotalMs}
          totalProcessingMs={processingMetrics.totalProcessingMs}
        />
      </div>
    </>
  );
}
