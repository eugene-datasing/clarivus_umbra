"use client";

import { useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  DndContext,
  DragOverlay,
  useSensor,
  useSensors,
  PointerSensor,
  useDroppable,
  useDraggable,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { savePipeline } from "@/lib/actions/pipeline-actions";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  Building2,
  User,
  GripVertical,
  X,
  ChevronDown,
  ChevronRight,
  Cpu,
  Send,
  CheckCircle,
  Calendar,
  Save,
  Users,
  Shield,
  Award,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DeptUser {
  id: string;
  name: string;
  role: string;
  departmentId: string | null;
}

interface DeptGroup {
  id: string;
  name: string;
  users: DeptUser[];
}

interface PrivilegedUser {
  id: string;
  name: string;
  role: string;
  departmentId: string | null;
  department: { name: string } | null;
}

interface StageAssignment {
  id: string;
  type: "user" | "department";
  role: string | null;
  userId: string | null;
  userName: string | null;
  userRole: string | null;
  departmentId: string | null;
  departmentName: string | null;
}

interface StageData {
  stage: string;
  label: string;
  sortOrder: number;
  accepts: "departments" | "users" | "none";
  auto: boolean;
  targetDate: string;
  completedAt: string | null;
  assignments: StageAssignment[];
}

interface PipelineClientProps {
  caseId: string;
  caseReference: string;
  casePriority: string;
  departmentUsers: DeptGroup[];
  privilegedUsers: PrivilegedUser[];
  otherDepartments: DeptGroup[];
  stages: StageData[];
}

interface Assignment {
  key: string;
  type: "user" | "department";
  userId?: string;
  userName?: string;
  userRole?: string;
  departmentId?: string;
  departmentName?: string;
}

interface DragData {
  type: "user" | "department";
  userId?: string;
  userName?: string;
  userRole?: string;
  departmentId?: string;
  departmentName?: string;
}

// ---------------------------------------------------------------------------
// Role config
// ---------------------------------------------------------------------------

const ROLE_FOR_STAGE: Record<string, string> = {
  "initial-review": "reviewer",
  "senior-review": "senior-reviewer",
  "final-approval": "final-approver",
};

const STAGE_ICONS: Record<string, typeof Building2> = {
  collection: Building2,
  processing: Cpu,
  "initial-review": Users,
  "senior-review": Shield,
  "final-approval": Award,
  release: Send,
};

const STAGE_COLORS: Record<string, { border: string; bg: string; text: string; accent: string }> = {
  collection: { border: "border-amber-200", bg: "bg-amber-50", text: "text-amber-800", accent: "bg-amber-500" },
  processing: { border: "border-blue-200", bg: "bg-blue-50", text: "text-blue-800", accent: "bg-blue-500" },
  "initial-review": { border: "border-indigo-200", bg: "bg-indigo-50", text: "text-indigo-800", accent: "bg-indigo-500" },
  "senior-review": { border: "border-purple-200", bg: "bg-purple-50", text: "text-purple-800", accent: "bg-purple-500" },
  "final-approval": { border: "border-emerald-200", bg: "bg-emerald-50", text: "text-emerald-800", accent: "bg-emerald-500" },
  release: { border: "border-green-200", bg: "bg-green-50", text: "text-green-800", accent: "bg-green-500" },
};

// ---------------------------------------------------------------------------
// Sub-components: Draggable palette items
// ---------------------------------------------------------------------------

function DraggableDepartment({ dept }: { dept: DeptGroup }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `palette-dept-${dept.id}`,
    data: { type: "department", departmentId: dept.id, departmentName: dept.name } as DragData,
  });

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={cn(
        "flex items-center gap-2 px-3 py-2 rounded-lg border cursor-grab active:cursor-grabbing transition-all",
        "bg-white border-gray-200 hover:border-blue-300 hover:shadow-sm",
        isDragging && "opacity-40 shadow-lg",
      )}
    >
      <GripVertical className="w-3.5 h-3.5 text-gray-400 shrink-0" />
      <Building2 className="w-4 h-4 text-amber-600 shrink-0" />
      <span className="text-sm font-medium text-gray-700 truncate">{dept.name}</span>
      <span className="text-xs text-gray-400 ml-auto">{dept.users.length}</span>
    </div>
  );
}

function DraggableUser({ user, deptName }: { user: DeptUser | PrivilegedUser; deptName?: string }) {
  const department = "department" in user ? user.department?.name : deptName;
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `palette-user-${user.id}`,
    data: {
      type: "user",
      userId: user.id,
      userName: user.name,
      userRole: user.role,
    } as DragData,
  });

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  const roleLabel =
    user.role === "senior-reviewer" ? "Senior" :
    user.role === "final-approver" ? "Approver" :
    user.role === "admin" ? "Admin" :
    user.role === "request-manager" ? "Manager" :
    "Reviewer";

  const roleColor =
    user.role === "senior-reviewer" ? "bg-purple-100 text-purple-700" :
    user.role === "final-approver" ? "bg-emerald-100 text-emerald-700" :
    user.role === "admin" ? "bg-red-100 text-red-700" :
    "bg-gray-100 text-gray-600";

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={cn(
        "flex items-center gap-2 px-3 py-2 rounded-lg border cursor-grab active:cursor-grabbing transition-all",
        "bg-white border-gray-200 hover:border-blue-300 hover:shadow-sm",
        isDragging && "opacity-40 shadow-lg",
      )}
    >
      <GripVertical className="w-3.5 h-3.5 text-gray-400 shrink-0" />
      <User className="w-4 h-4 text-blue-600 shrink-0" />
      <div className="min-w-0 flex-1">
        <span className="text-sm font-medium text-gray-700 block truncate">{user.name}</span>
        {department && (
          <span className="text-xs text-gray-400 block truncate">{department}</span>
        )}
      </div>
      <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0", roleColor)}>
        {roleLabel}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: Droppable stage zone
// ---------------------------------------------------------------------------

function StageDropZone({
  stageId,
  accepts,
  activeDragType,
  children,
}: {
  stageId: string;
  accepts: "departments" | "users" | "none";
  activeDragType: string | null;
  children: React.ReactNode;
}) {
  const { isOver, setNodeRef } = useDroppable({ id: `stage-${stageId}` });

  const canDrop =
    activeDragType !== null &&
    ((accepts === "departments" && activeDragType === "department") ||
      (accepts === "users" && activeDragType === "user"));

  const showHighlight = activeDragType !== null && accepts !== "none";

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "min-h-[56px] rounded-lg border-2 border-dashed p-2 transition-all duration-200",
        isOver && canDrop && "border-blue-400 bg-blue-50/80 scale-[1.01]",
        isOver && !canDrop && "border-red-300 bg-red-50/50",
        !isOver && showHighlight && canDrop && "border-blue-200 bg-blue-50/30",
        !isOver && showHighlight && !canDrop && "border-gray-200 bg-gray-50",
        !showHighlight && "border-gray-200 bg-gray-50/50",
      )}
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: Assignment chip (removable)
// ---------------------------------------------------------------------------

function AssignmentChip({
  assignment,
  onRemove,
}: {
  assignment: Assignment;
  onRemove: () => void;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors",
        assignment.type === "department"
          ? "bg-amber-100 text-amber-800 border border-amber-200"
          : "bg-blue-100 text-blue-800 border border-blue-200",
      )}
    >
      {assignment.type === "department" ? (
        <Building2 className="w-3 h-3" />
      ) : (
        <User className="w-3 h-3" />
      )}
      {assignment.type === "department" ? assignment.departmentName : assignment.userName}
      <button
        onClick={onRemove}
        className="ml-0.5 p-0.5 rounded-full hover:bg-black/10 transition-colors"
        aria-label="Remove"
      >
        <X className="w-3 h-3" />
      </button>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function PipelineClient({
  caseId,
  caseReference,
  casePriority,
  departmentUsers,
  privilegedUsers,
  otherDepartments,
  stages,
}: PipelineClientProps) {
  const router = useRouter();

  // ---- State ----
  const [stageAssignments, setStageAssignments] = useState<Record<string, Assignment[]>>(() => {
    // Check if there are existing assignments from DB
    const hasExisting = stages.some((s) => s.assignments.length > 0);

    if (hasExisting) {
      const loaded: Record<string, Assignment[]> = {};
      for (const s of stages) {
        loaded[s.stage] = s.assignments.map((a) => ({
          key: `${a.type}-${a.userId || a.departmentId}-${s.stage}`,
          type: a.type as "user" | "department",
          userId: a.userId ?? undefined,
          userName: a.userName ?? undefined,
          userRole: a.userRole ?? undefined,
          departmentId: a.departmentId ?? undefined,
          departmentName: a.departmentName ?? undefined,
        }));
      }
      return loaded;
    }

    // Smart defaults
    const defaults: Record<string, Assignment[]> = {};

    // Collection: case departments
    defaults["collection"] = departmentUsers.map((d) => ({
      key: `dept-${d.id}-collection`,
      type: "department" as const,
      departmentId: d.id,
      departmentName: d.name,
    }));

    // Initial Review: all users from case departments
    defaults["initial-review"] = departmentUsers.flatMap((d) =>
      d.users.map((u) => ({
        key: `user-${u.id}-initial-review`,
        type: "user" as const,
        userId: u.id,
        userName: u.name,
        userRole: u.role,
      })),
    );

    // Senior Review: senior-reviewer + admin privileged users
    defaults["senior-review"] = privilegedUsers
      .filter((u) => u.role === "senior-reviewer" || u.role === "admin")
      .map((u) => ({
        key: `user-${u.id}-senior-review`,
        type: "user" as const,
        userId: u.id,
        userName: u.name,
        userRole: u.role,
      }));

    // Final Approval: final-approver + admin privileged users
    defaults["final-approval"] = privilegedUsers
      .filter((u) => u.role === "final-approver" || u.role === "admin")
      .map((u) => ({
        key: `user-${u.id}-final-approval`,
        type: "user" as const,
        userId: u.id,
        userName: u.name,
        userRole: u.role,
      }));

    return defaults;
  });

  const [stageDates, setStageDates] = useState<Record<string, string>>(() => {
    const dates: Record<string, string> = {};
    for (const s of stages) {
      dates[s.stage] = s.targetDate.split("T")[0]; // YYYY-MM-DD
    }
    return dates;
  });

  const [activeDrag, setActiveDrag] = useState<DragData | null>(null);
  const [saving, setSaving] = useState(false);
  const [expandedPalette, setExpandedPalette] = useState<Record<string, boolean>>({
    caseDepts: true,
    otherDepts: false,
    reviewers: true,
    approvers: true,
  });

  // ---- Sensors ----
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  // ---- All reviewable users (from all departments) for the palette ----
  const allReviewers = useMemo(() => {
    const seen = new Set<string>();
    const users: (DeptUser & { deptName: string })[] = [];

    for (const dept of [...departmentUsers, ...otherDepartments]) {
      for (const u of dept.users) {
        if (!seen.has(u.id)) {
          seen.add(u.id);
          users.push({ ...u, deptName: dept.name });
        }
      }
    }
    return users.sort((a, b) => a.name.localeCompare(b.name));
  }, [departmentUsers, otherDepartments]);

  // ---- Approvers (unique privileged users not already in reviewers) ----
  const approvers = useMemo(() => {
    return privilegedUsers.filter(
      (u) => u.role === "senior-reviewer" || u.role === "final-approver" || u.role === "admin",
    );
  }, [privilegedUsers]);

  // ---- DnD handlers ----
  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveDrag(event.active.data.current as DragData);
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveDrag(null);

      if (!over) return;

      const overId = over.id as string;
      if (!overId.startsWith("stage-")) return;
      const stageId = overId.replace("stage-", "");

      const stage = stages.find((s) => s.stage === stageId);
      if (!stage || stage.auto || stage.accepts === "none") return;

      const data = active.data.current as DragData;

      // Type check
      if (stage.accepts === "departments" && data.type !== "department") return;
      if (stage.accepts === "users" && data.type !== "user") return;

      // Role constraints for specific stages
      if (
        stageId === "senior-review" &&
        data.type === "user" &&
        data.userRole !== "senior-reviewer" &&
        data.userRole !== "admin"
      ) {
        return;
      }
      if (
        stageId === "final-approval" &&
        data.type === "user" &&
        data.userRole !== "final-approver" &&
        data.userRole !== "admin"
      ) {
        return;
      }

      // Duplicate check
      const existing = stageAssignments[stageId] || [];
      const isDuplicate =
        data.type === "user"
          ? existing.some((a) => a.userId === data.userId)
          : existing.some((a) => a.departmentId === data.departmentId);
      if (isDuplicate) return;

      const newAssignment: Assignment = {
        key: `${data.type}-${data.userId || data.departmentId}-${stageId}`,
        type: data.type,
        userId: data.userId,
        userName: data.userName,
        userRole: data.userRole,
        departmentId: data.departmentId,
        departmentName: data.departmentName,
      };

      setStageAssignments((prev) => ({
        ...prev,
        [stageId]: [...(prev[stageId] || []), newAssignment],
      }));
    },
    [stages, stageAssignments],
  );

  // ---- Remove assignment ----
  const removeAssignment = useCallback((stageId: string, key: string) => {
    setStageAssignments((prev) => ({
      ...prev,
      [stageId]: (prev[stageId] || []).filter((a) => a.key !== key),
    }));
  }, []);

  // ---- Save ----
  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const milestones = stages.map((s) => ({
        stage: s.stage,
        label: s.label,
        targetDate: stageDates[s.stage] || s.targetDate,
        sortOrder: s.sortOrder,
      }));

      const assignments = Object.entries(stageAssignments).flatMap(([stage, items]) =>
        items.map((a) => ({
          stage,
          type: a.type,
          userId: a.userId,
          departmentId: a.departmentId,
          role: ROLE_FOR_STAGE[stage] ?? undefined,
        })),
      );

      await savePipeline(caseId, milestones, assignments);
      router.push(`/requests/${caseId}`);
    } catch (err) {
      console.error("Failed to save pipeline:", err);
      setSaving(false);
    }
  }, [caseId, stages, stageDates, stageAssignments, router]);

  // ---- Stats ----
  const totalAssignments = Object.values(stageAssignments).reduce((sum, arr) => sum + arr.length, 0);
  const manualStages = stages.filter((s) => !s.auto);
  const configuredStages = manualStages.filter(
    (s) => (stageAssignments[s.stage] || []).length > 0,
  ).length;

  // ---- Toggle palette section ----
  const toggleSection = (key: string) =>
    setExpandedPalette((prev) => ({ ...prev, [key]: !prev[key] }));

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 sticky top-0 z-20">
          <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-3 sm:py-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                <Link
                  href={`/requests/${caseId}`}
                  className="text-gray-400 hover:text-gray-600 transition-colors shrink-0"
                >
                  <ArrowLeft className="w-5 h-5" />
                </Link>
                <div className="min-w-0">
                  <h1 className="text-base sm:text-lg font-semibold text-gray-900 truncate">Review Pipeline Setup</h1>
                  <p className="text-xs sm:text-sm text-gray-500">{caseReference}</p>
                </div>
              </div>

              <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                <div className="hidden md:block text-sm text-gray-500">
                  {configuredStages}/{manualStages.length} stages
                  <span className="mx-1.5 text-gray-300">|</span>
                  {totalAssignments} assignment{totalAssignments !== 1 ? "s" : ""}
                </div>
                <Link
                  href={`/requests/${caseId}`}
                  className="hidden sm:block px-3 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
                >
                  Skip
                </Link>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className={cn(
                    "flex items-center gap-2 px-3 sm:px-5 py-2 rounded-lg text-sm font-medium transition-all",
                    "bg-brand-primary text-white hover:bg-purple-700 active:bg-purple-800",
                    "disabled:opacity-50 disabled:cursor-not-allowed",
                  )}
                >
                  <Save className="w-4 h-4" />
                  <span className="hidden sm:inline">{saving ? "Saving..." : "Save Pipeline"}</span>
                  <span className="sm:hidden">{saving ? "..." : "Save"}</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Two-panel layout */}
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-4 sm:py-6 flex flex-col lg:flex-row gap-4 sm:gap-6">
          {/* Left: Palette */}
          <div className="w-full lg:w-[300px] shrink-0">
            <div className="lg:sticky lg:top-[80px] space-y-3">
              <div className="text-xs font-semibold uppercase tracking-wider text-gray-400 px-1">
                Drag to assign
              </div>

              {/* Case Departments */}
              <PaletteSection
                title="Case Departments"
                count={departmentUsers.length}
                expanded={expandedPalette.caseDepts}
                onToggle={() => toggleSection("caseDepts")}
                accent="amber"
              >
                <div className="space-y-1.5">
                  {departmentUsers.map((dept) => (
                    <DraggableDepartment key={dept.id} dept={dept} />
                  ))}
                </div>
              </PaletteSection>

              {/* Other Departments */}
              {otherDepartments.length > 0 && (
                <PaletteSection
                  title="Other Departments"
                  count={otherDepartments.length}
                  expanded={expandedPalette.otherDepts}
                  onToggle={() => toggleSection("otherDepts")}
                  accent="gray"
                >
                  <div className="space-y-1.5">
                    {otherDepartments.map((dept) => (
                      <DraggableDepartment key={dept.id} dept={dept} />
                    ))}
                  </div>
                </PaletteSection>
              )}

              {/* Reviewers */}
              <PaletteSection
                title="Reviewers"
                count={allReviewers.length}
                expanded={expandedPalette.reviewers}
                onToggle={() => toggleSection("reviewers")}
                accent="blue"
              >
                <div className="space-y-1.5">
                  {allReviewers.map((u) => (
                    <DraggableUser key={u.id} user={u} deptName={u.deptName} />
                  ))}
                </div>
              </PaletteSection>

              {/* Approvers */}
              <PaletteSection
                title="Approvers"
                count={approvers.length}
                expanded={expandedPalette.approvers}
                onToggle={() => toggleSection("approvers")}
                accent="purple"
              >
                <div className="space-y-1.5">
                  {approvers.map((u) => (
                    <DraggableUser key={u.id} user={u} />
                  ))}
                </div>
              </PaletteSection>
            </div>
          </div>

          {/* Right: Pipeline stages */}
          <div className="flex-1 min-w-0">
            <div className="space-y-0">
              {stages.map((stage, idx) => {
                const Icon = STAGE_ICONS[stage.stage] || CheckCircle;
                const colors = STAGE_COLORS[stage.stage] || STAGE_COLORS.collection;
                const assignments = stageAssignments[stage.stage] || [];

                return (
                  <div key={stage.stage}>
                    {/* Connector line */}
                    {idx > 0 && (
                      <div className="flex justify-center py-0">
                        <div className="w-px h-6 bg-gray-300" />
                      </div>
                    )}

                    {/* Stage card */}
                    <div
                      className={cn(
                        "rounded-xl border bg-white shadow-sm transition-all",
                        colors.border,
                      )}
                    >
                      {/* Stage header */}
                      <div className={cn("flex flex-wrap sm:flex-nowrap items-center gap-2 sm:gap-3 px-3 sm:px-5 py-3 rounded-t-xl", colors.bg)}>
                        <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center shrink-0", colors.accent)}>
                          <Icon className="w-4 h-4 text-white" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={cn("text-sm font-semibold", colors.text)}>
                              {stage.sortOrder}. {stage.label}
                            </span>
                            {stage.auto && (
                              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-white/60 text-gray-500">
                                Automated
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-gray-500 mt-0.5 hidden sm:block">
                            {stage.accepts === "departments"
                              ? "Departments provide documents"
                              : stage.accepts === "users"
                                ? `Assigned reviewers (${ROLE_FOR_STAGE[stage.stage] || "reviewer"})`
                                : "Runs automatically"}
                          </div>
                        </div>

                        {/* Date input */}
                        <div className="flex items-center gap-1.5 shrink-0 ml-auto sm:ml-0">
                          <Calendar className="w-3.5 h-3.5 text-gray-400 hidden sm:block" />
                          <input
                            type="date"
                            value={stageDates[stage.stage] || ""}
                            onChange={(e) =>
                              setStageDates((prev) => ({ ...prev, [stage.stage]: e.target.value }))
                            }
                            disabled={stage.auto}
                            className={cn(
                              "text-xs border rounded-md px-2 py-1 bg-white w-[130px]",
                              stage.auto
                                ? "text-gray-400 border-gray-200 cursor-not-allowed"
                                : "text-gray-700 border-gray-300 hover:border-blue-300 focus:border-blue-400 focus:ring-1 focus:ring-blue-200",
                            )}
                          />
                        </div>
                      </div>

                      {/* Drop zone or auto indicator */}
                      <div className="px-3 sm:px-5 py-3">
                        {stage.auto ? (
                          <div className="text-sm text-gray-400 italic text-center py-2">
                            This stage runs automatically — no assignment needed
                          </div>
                        ) : (
                          <StageDropZone
                            stageId={stage.stage}
                            accepts={stage.accepts}
                            activeDragType={activeDrag?.type ?? null}
                          >
                            {assignments.length > 0 ? (
                              <div className="flex flex-wrap gap-2">
                                {assignments.map((a) => (
                                  <AssignmentChip
                                    key={a.key}
                                    assignment={a}
                                    onRemove={() => removeAssignment(stage.stage, a.key)}
                                  />
                                ))}
                              </div>
                            ) : (
                              <div className="text-sm text-gray-400 text-center py-1">
                                {stage.accepts === "departments"
                                  ? "Drop departments here"
                                  : "Drop reviewers here"}
                              </div>
                            )}
                          </StageDropZone>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Bottom save area */}
            <div className="mt-6 sm:mt-8 flex flex-col sm:flex-row justify-end gap-2 sm:gap-3">
              <Link
                href={`/requests/${caseId}`}
                className="px-5 py-2.5 text-sm text-gray-600 hover:text-gray-800 transition-colors text-center"
              >
                Skip for Now
              </Link>
              <button
                onClick={handleSave}
                disabled={saving}
                className={cn(
                  "flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg text-sm font-medium transition-all",
                  "bg-brand-primary text-white hover:bg-purple-700 active:bg-purple-800",
                  "disabled:opacity-50 disabled:cursor-not-allowed",
                )}
              >
                <Save className="w-4 h-4" />
                {saving ? "Saving..." : "Save Pipeline & Continue"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Drag overlay */}
      <DragOverlay>
        {activeDrag && (
          <div className="px-3 py-2 rounded-lg border border-blue-300 bg-blue-50 shadow-xl text-sm font-medium text-blue-800 flex items-center gap-2 pointer-events-none">
            {activeDrag.type === "department" ? (
              <>
                <Building2 className="w-4 h-4" />
                {activeDrag.departmentName}
              </>
            ) : (
              <>
                <User className="w-4 h-4" />
                {activeDrag.userName}
              </>
            )}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

// ---------------------------------------------------------------------------
// Palette section wrapper
// ---------------------------------------------------------------------------

function PaletteSection({
  title,
  count,
  expanded,
  onToggle,
  accent,
  children,
}: {
  title: string;
  count: number;
  expanded: boolean;
  onToggle: () => void;
  accent: string;
  children: React.ReactNode;
}) {
  const accentColors: Record<string, string> = {
    amber: "bg-amber-500",
    gray: "bg-gray-400",
    blue: "bg-blue-500",
    purple: "bg-purple-500",
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2.5 px-4 py-3 hover:bg-gray-50 transition-colors"
      >
        <div className={cn("w-2 h-2 rounded-full", accentColors[accent] || accentColors.gray)} />
        <span className="text-sm font-medium text-gray-700 flex-1 text-left">{title}</span>
        <span className="text-xs text-gray-400">{count}</span>
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-gray-400" />
        ) : (
          <ChevronRight className="w-4 h-4 text-gray-400" />
        )}
      </button>
      {expanded && <div className="px-3 pb-3 space-y-1.5">{children}</div>}
    </div>
  );
}
