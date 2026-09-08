import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  Brain,
  ExternalLink,
  MoreHorizontal,
  Pause,
  Play,
  ShieldCheck,
  Sun,
  Timer,
  Monitor,
  Square,
  CheckCircle2,
  Sparkles,
  Sliders,
  Terminal,
  Download,
  Target,
  X,
  Plus,
  Trash2,
  ChevronDown,
  ChevronRight,
  ListTodo,
  Radio,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  apiClient,
  getExtensionStatus,
  setTrackingPaused,
  triggerAuth,
  type ExtensionStatus,
} from "../api/client";
import type { Task, DailyGoal, GoalOutcome } from "@repo/types";
import {
  resolveProductiveDay,
  resolveTomorrowProductiveDay,
  formatProductiveDateLabel,
} from "@repo/types";
import { CheckInView } from "./CheckInView";
import { SettingsView } from "./SettingsView";
import { DiagnosticsView } from "./DiagnosticsView";
import { InactivityView } from "./InactivityView";

// Locked v1.3 five-view navigation
type Tab = "today" | "focus" | "reflect" | "review" | "more";
type MoreSubView = "menu" | "settings" | "diagnostics";

function formatDuration(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  return hours
    ? `${hours}h ${minutes.toString().padStart(2, "0")}m`
    : `${minutes}m ${secs.toString().padStart(2, "0")}s`;
}

function formatClock(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds));
  return [Math.floor(safe / 3600), Math.floor((safe % 3600) / 60), safe % 60]
    .map((part) => part.toString().padStart(2, "0"))
    .join(":");
}

function openDashboard(path = "") {
  void chrome.tabs.create({ url: `http://localhost:3000${path}` });
}

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden="true" />;
}

function Header({
  status,
  onPillClick,
  isStandalone,
  onClose,
}: {
  status?: ExtensionStatus;
  onPillClick?: () => void;
  isStandalone?: boolean;
  onClose?: () => void;
}) {
  const active = status ? !status.trackingPaused : true;
  return (
    <header className="header">
      <div className="brand-mark">
        <Activity size={15} strokeWidth={2.6} />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <div className="brand">ProductiveHix</div>
        {status?.desktop?.connected ? (
          <span
            title="Desktop tracking active"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 3,
              fontSize: 9.5,
              color: "#34d399",
              background: "rgba(52,211,153,0.1)",
              padding: "1px 5px",
              borderRadius: 4,
            }}
          >
            <span style={{ width: 4.5, height: 4.5, borderRadius: "50%", background: "#34d399" }} />
            Desktop
          </span>
        ) : null}
      </div>
      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
        <button
          type="button"
          className={`tracking-pill ${active ? "is-active" : "is-paused"}`}
          onClick={onPillClick}
          title="Tracking status (Click to view controls)"
        >
          <span className="status-dot" />
          {active ? "Tracking" : "Paused"}
        </button>
        {isStandalone ? (
          <button
            type="button"
            className="icon-button"
            onClick={onClose || (() => window.close())}
            title="Close reflection window"
            style={{ color: "#a59cb5", padding: "4px" }}
          >
            <X size={15} />
          </button>
        ) : null}
      </div>
    </header>
  );
}

function TopNav({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  const items: Array<[Tab, string, typeof Sun]> = [
    ["today", "Today", Sun],
    ["focus", "Focus", Timer],
    ["reflect", "Reflect", Sparkles],
    ["review", "Review", Brain],
    ["more", "More", MoreHorizontal],
  ];
  return (
    <nav className="top-nav" aria-label="Persistent Navigation">
      {items.map(([key, label, Icon]) => (
        <button
          key={key}
          className={tab === key ? "nav-item selected" : "nav-item"}
          onClick={() => setTab(key)}
          type="button"
        >
          <Icon size={12} />
          {label}
        </button>
      ))}
    </nav>
  );
}

function Metric({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="metric-card">
      <div className="metric-icon">{icon}</div>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

// -------------------------------------------------------------
// WORKFLOW PROTOTYPE MODALS / SHEETS (Visual only, no domain mutations)
// -------------------------------------------------------------
// -------------------------------------------------------------
// WORKFLOW SHEETS (Authoritative backend domain mutations)
// -------------------------------------------------------------
interface PlanWorkflowSheetProps {
  title: string;
  subtitle: string;
  date: string;
  initialGoals?: Array<{ id?: string; title: string }>;
  onSave: (goals: Array<{ id?: string; title: string; order: number }>) => Promise<void> | void;
  onClose: () => void;
}

function PlanWorkflowSheet({
  title,
  subtitle,
  date,
  initialGoals = [],
  onSave,
  onClose,
}: PlanWorkflowSheetProps) {
  const [draftGoals, setDraftGoals] = useState<Array<{ id?: string; title: string }>>(
    initialGoals.length > 0 ? initialGoals : [{ title: "" }]
  );
  const [saving, setSaving] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = draftGoals
      .filter((g) => g.title.trim().length > 0)
      .map((g, idx) => ({ id: g.id, title: g.title.trim(), order: idx }));
    setSaving(true);
    try {
      await onSave(cleaned);
    } finally {
      setSaving(false);
    }
  };

  const addGoal = () => {
    setDraftGoals((prev) => [...prev, { title: "" }]);
  };

  const updateGoal = (idx: number, val: string) => {
    const next = [...draftGoals];
    next[idx] = { ...next[idx], title: val };
    setDraftGoals(next);
  };

  const removeGoal = (idx: number) => {
    setDraftGoals((prev) => prev.filter((_, i) => i !== idx));
  };

  const formattedDate = date ? formatProductiveDateLabel(date) : "";

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(0,0,0,0.75)",
        zIndex: 100,
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end",
        padding: "10px",
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="plan-sheet-title"
    >
      <div
        className="hero-card"
        style={{
          padding: 14,
          maxHeight: "92%",
          overflowY: "auto",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 10,
          }}
        >
          <div>
            <span className="section-kicker">{subtitle}</span>
            <h2
              id="plan-sheet-title"
              style={{
                fontSize: 14,
                fontWeight: 650,
                color: "#faf7ff",
                margin: "2px 0 0",
              }}
            >
              {title} {formattedDate && <span style={{ fontSize: 11, color: "#9d91b7", fontWeight: 400 }}>({formattedDate})</span>}
            </h2>
          </div>
          <button
            type="button"
            className="text-button"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSave} style={{ display: "grid", gap: 10 }}>
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <label style={{ fontSize: 10.5, color: "#9d91b7" }}>
                Daily Goals (0..N objectives)
              </label>
              <span style={{ fontSize: 9.5, color: "#a78bfa" }}>
                1–3 recommended
              </span>
            </div>

            <div style={{ display: "grid", gap: 6 }}>
              {draftGoals.map((g, idx) => (
                <div key={idx} style={{ display: "flex", gap: 5, alignItems: "center" }}>
                  <span
                    style={{
                      fontSize: 10,
                      fontFamily: "monospace",
                      color: "#a78bfa",
                      background: "rgba(167,139,250,0.1)",
                      padding: "4px 6px",
                      borderRadius: 4,
                    }}
                  >
                    {(idx + 1).toString().padStart(2, "0")}
                  </span>
                  <input
                    type="text"
                    required={idx === 0 && draftGoals.length === 1}
                    value={g.title}
                    onChange={(e) => updateGoal(idx, e.target.value)}
                    placeholder={`Goal ${idx + 1} title`}
                    style={{
                      flex: 1,
                      padding: "6px 8px",
                      borderRadius: 6,
                      background: "rgba(255,255,255,0.05)",
                      border: "1px solid rgba(255,255,255,0.12)",
                      color: "#faf7ff",
                      fontSize: 11.5,
                    }}
                    autoFocus={idx === draftGoals.length - 1}
                  />
                  {draftGoals.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeGoal(idx)}
                      style={{
                        background: "none",
                        border: "none",
                        color: "#9d91b7",
                        cursor: "pointer",
                        padding: 3,
                      }}
                      title="Remove goal"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={addGoal}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                fontSize: 11,
                color: "#a78bfa",
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: "6px 2px",
                marginTop: 4,
              }}
            >
              <Plus size={12} />
              <span>Add another goal</span>
            </button>
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
            <button
              type="button"
              className="secondary-button"
              style={{ flex: 1 }}
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="primary-button"
              style={{ flex: 1 }}
              disabled={saving}
            >
              {saving ? "Saving..." : "Save Plan"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function OutcomeWorkflowSheet({
  goals,
  onSave,
  onClose,
}: {
  goals: DailyGoal[];
  onSave: (goalId: string, outcome: GoalOutcome) => Promise<void> | void;
  onClose: () => void;
}) {
  const [selectedGoalId, setSelectedGoalId] = useState<string>(goals[0]?.id || "");
  const [saving, setSaving] = useState(false);

  const outcomes: Array<{ id: GoalOutcome; label: string; desc: string }> = [
    { id: "ACHIEVED", label: "Achieved", desc: "Completed primary objective" },
    { id: "PARTIALLY_ACHIEVED", label: "Partially achieved", desc: "Material progress made" },
    { id: "NOT_ACHIEVED", label: "Not achieved", desc: "Blocked or shifted priorities" },
    { id: "NOT_ASSESSED", label: "Not assessed", desc: "Skip assessment" },
  ];

  const currentGoal = goals.find((g) => g.id === selectedGoalId) || goals[0];

  const handleSelectOutcome = async (outcome: GoalOutcome) => {
    if (!currentGoal) return;
    setSaving(true);
    try {
      await onSave(currentGoal.id, outcome);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(0,0,0,0.75)",
        zIndex: 100,
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end",
        padding: "10px",
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="outcome-sheet-title"
    >
      <div className="hero-card" style={{ padding: 14, maxHeight: "92%", overflowY: "auto" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 8,
          }}
        >
          <div>
            <span className="section-kicker">EVENING REFLECTION</span>
            <h2
              id="outcome-sheet-title"
              style={{
                fontSize: 14,
                fontWeight: 650,
                color: "#faf7ff",
                margin: "2px 0 0",
              }}
            >
              Assess Goal Outcomes
            </h2>
          </div>
          <button
            type="button"
            className="text-button"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {goals.length > 1 && (
          <div style={{ display: "flex", gap: 4, marginBottom: 10, overflowX: "auto", paddingBottom: 4 }}>
            {goals.map((g, idx) => (
              <button
                key={g.id}
                type="button"
                onClick={() => setSelectedGoalId(g.id)}
                style={{
                  fontSize: 10.5,
                  padding: "4px 8px",
                  borderRadius: 4,
                  border: g.id === (currentGoal?.id ?? "") ? "1px solid #a78bfa" : "1px solid rgba(255,255,255,0.1)",
                  background: g.id === (currentGoal?.id ?? "") ? "rgba(167,139,250,0.15)" : "transparent",
                  color: g.id === (currentGoal?.id ?? "") ? "#faf7ff" : "#9d91b7",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                Goal {idx + 1}
              </button>
            ))}
          </div>
        )}

        <p style={{ fontSize: 11, color: "#948ca2", margin: "0 0 10px" }}>
          Assessing: <strong style={{ color: "#f7f3fc" }}>{currentGoal?.title || "Goal"}</strong>
        </p>

        <div style={{ display: "grid", gap: 6, marginBottom: 12 }}>
          {outcomes.map((o) => (
            <button
              key={o.id}
              type="button"
              disabled={saving}
              onClick={() => handleSelectOutcome(o.id)}
              className="secondary-button"
              style={{
                textAlign: "left",
                display: "block",
                padding: "8px 10px",
                background:
                  currentGoal?.outcome === o.id
                    ? "rgba(139,92,246,0.25)"
                    : undefined,
                borderColor:
                  currentGoal?.outcome === o.id ? "#a78bfa" : undefined,
              }}
            >
              <strong style={{ fontSize: 11.5, color: "#faf7ff", display: "block" }}>
                {o.label}
              </strong>
              <span style={{ fontSize: 10, color: "#948ca2" }}>{o.desc}</span>
            </button>
          ))}
        </div>

        <button
          type="button"
          className="secondary-button full"
          onClick={onClose}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}

// -------------------------------------------------------------
// TODAY VIEW (Four locked structural blocks)
// -------------------------------------------------------------
function TodayView({
  status,
  setTab,
  onStartReflect,
}: {
  status?: ExtensionStatus;
  setTab: (t: Tab) => void;
  onStartReflect: () => void;
}) {
  const queryClient = useQueryClient();

  // 1. Domain Queries (Direct from backend)
  const todayPlan = useQuery({
    queryKey: ["plan", "today"],
    queryFn: () => apiClient.getTodayPlan(),
    refetchOnWindowFocus: true,
  });

  const tasks = useQuery({
    queryKey: ["tasks"],
    queryFn: apiClient.getTasks.bind(apiClient),
    refetchOnWindowFocus: true,
  });

  const sessions = useQuery({
    queryKey: ["sessions"],
    queryFn: apiClient.getSessions.bind(apiClient),
    refetchOnWindowFocus: true,
  });

  const summary = useQuery({
    queryKey: ["activity-summary"],
    queryFn: apiClient.getTodaySummary.bind(apiClient),
    refetchOnWindowFocus: true,
  });

  // Local selection & sheet state
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [activeWorkflow, setActiveWorkflow] = useState<
    "none" | "planToday" | "planTomorrow" | "outcome"
  >("none");

  const plan = todayPlan.data;
  const goals = plan?.goals ?? [];
  const independentTasks = plan?.independentTasks ?? [];
  const allTasks = tasks.data ?? [];

  // Active focus session detection
  const activeSession = sessions.data?.find((s) => !s.endedAt);
  const activeTask = activeSession
    ? allTasks.find((t) => t.id === activeSession.taskId)
    : selectedTaskId
    ? allTasks.find((t) => t.id === selectedTaskId)
    : null;

  // Incomplete tasks filter
  const incompleteTasks = allTasks.filter(
    (t) => t.status !== "done" && t.status !== "cancelled"
  );

  // Deterministic Next Up (2–3 incomplete tasks)
  const priorityRank: Record<string, number> = { high: 3, medium: 2, low: 1, none: 0 };
  const nextUpCandidates = [...incompleteTasks].sort((a, b) => {
    if (a.status === "in_progress" && b.status !== "in_progress") return -1;
    if (b.status === "in_progress" && a.status !== "in_progress") return 1;
    const pA = priorityRank[a.priority] ?? 1;
    const pB = priorityRank[b.priority] ?? 1;
    if (pB !== pA) return pB - pA;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });
  const nextUpTasks = nextUpCandidates.slice(0, 3);

  // Intentional work & metrics calculations
  const intentionalSeconds = (sessions.data ?? []).reduce(
    (sum, s) => sum + (s.durationSeconds ?? 0),
    0
  );
  const sessionsCompleted = (sessions.data ?? []).filter((s) => Boolean(s.endedAt)).length;
  const tasksCompleted = allTasks.filter((t) => t.status === "done").length;
  const observedSeconds = (summary.data?.activeTime ?? 0) / 1000;

  const current = status?.currentActivity;
  const isEligibleForCheckIn = status?.scheduler?.eligibility?.eligible ?? false;

  // Session execution handlers
  const handleStartFocus = async (taskId?: string) => {
    const tid = taskId || activeTask?.id;
    if (!tid) return;
    await apiClient.startSession(tid);
    await apiClient.updateTask(tid, { status: "in_progress" });
    queryClient.invalidateQueries({ queryKey: ["sessions"] });
    queryClient.invalidateQueries({ queryKey: ["tasks"] });
  };

  const handleFinishFocus = async () => {
    if (!activeSession) return;
    await apiClient.finishSession(activeSession.id);
    if (activeSession.taskId) {
      await apiClient.updateTask(activeSession.taskId, { status: "done" });
    }
    queryClient.invalidateQueries({ queryKey: ["sessions"] });
    queryClient.invalidateQueries({ queryKey: ["tasks"] });
    queryClient.invalidateQueries({ queryKey: ["activity-summary"] });
  };

  // Plan workflow handlers (authoritative backend mutation)
  const handleSavePlan = async (updatedGoals: Array<{ id?: string; title: string; order: number }>) => {
    const targetDate =
      activeWorkflow === "planTomorrow"
        ? resolveTomorrowProductiveDay()
        : plan?.date || resolveProductiveDay();

    await apiClient.savePlan({
      date: targetDate,
      goals: updatedGoals,
    });
    queryClient.invalidateQueries({ queryKey: ["plan"] });
    queryClient.invalidateQueries({ queryKey: ["tasks"] });
    setActiveWorkflow("none");
  };

  const handleAssessOutcome = async (goalId: string, outcome: GoalOutcome) => {
    await apiClient.updateGoalOutcome(goalId, outcome);
    queryClient.invalidateQueries({ queryKey: ["plan"] });
    setActiveWorkflow("none");
  };

  return (
    <main className="content">
      {/* 1. TODAY'S PLAN (0..N Goals with compact tasks) */}
      <section className="hero-card" style={{ padding: "12px 14px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 6,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <Target size={13} color="#a78bfa" />
            <span className="section-kicker" style={{ color: "#a78bfa" }}>
              TODAY&apos;S PLAN
            </span>
          </div>
          {goals.length > 0 && (
            <span
              style={{
                fontSize: 9.5,
                color: "#a78bfa",
                background: "rgba(167,139,250,0.12)",
                padding: "2px 6px",
                borderRadius: 4,
              }}
            >
              {goals.length} {goals.length === 1 ? "Goal" : "Goals"}
            </span>
          )}
        </div>

        {todayPlan.isLoading ? (
          <div style={{ padding: "6px 0" }}>
            <Skeleton className="metric-value" />
            <Skeleton className="metric-label" />
          </div>
        ) : goals.length > 0 ? (
          <div style={{ display: "grid", gap: 8, marginBottom: 10 }}>
            {goals.map((goal, idx) => {
              const goalTasks = goal.tasks ?? [];
              return (
                <div key={goal.id} style={{ borderBottom: idx === goals.length - 1 ? "none" : "1px solid rgba(255,255,255,0.06)", paddingBottom: 6 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4 }}>
                    <h2
                      style={{
                        fontSize: 12,
                        fontWeight: 650,
                        color: "#faf7ff",
                        margin: 0,
                        lineHeight: 1.3,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      <span style={{ color: "#a78bfa", marginRight: 4, fontFamily: "monospace" }}>
                        {(idx + 1).toString().padStart(2, "0")}
                      </span>
                      {goal.title}
                    </h2>
                    {goal.outcome && (
                      <span
                        style={{
                          fontSize: 9,
                          color: "#34d399",
                          background: "rgba(52,211,153,0.1)",
                          padding: "1px 5px",
                          borderRadius: 3,
                          flexShrink: 0,
                        }}
                      >
                        {goal.outcome.replace("_", " ")}
                      </span>
                    )}
                  </div>

                  {goalTasks.length > 0 && (
                    <div style={{ display: "grid", gap: 2, marginTop: 4, paddingLeft: 12 }}>
                      {goalTasks.slice(0, 3).map((t, tIdx) => (
                        <div
                          key={t.id}
                          style={{
                            fontSize: 10,
                            color: t.status === "done" ? "#8e84a5" : "#c6b5ef",
                            opacity: t.status === "done" ? 0.75 : 1,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          <span style={{ color: "#7c6f96", marginRight: 3, fontFamily: "monospace" }}>
                            {tIdx === goalTasks.length - 1 ? "└──" : "├──"}
                          </span>
                          {t.title}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ padding: "6px 0 10px" }}>
            <p style={{ fontSize: 11.5, color: "#faf7ff", fontWeight: 600, margin: "0 0 2px" }}>
              Your day hasn&apos;t been planned yet
            </p>
            <p style={{ fontSize: 10.5, color: "#948ca2", margin: 0 }}>
              Define today&apos;s primary objectives in 30 seconds.
            </p>
          </div>
        )}

        {/* Plan Actions */}
        <div style={{ display: "flex", gap: 4 }}>
          <button
            type="button"
            className="secondary-button"
            style={{ flex: 1, padding: "5px 2px", fontSize: 10, marginTop: 0 }}
            onClick={() => setActiveWorkflow("planToday")}
          >
            {goals.length > 0 ? "Edit Plan" : "Plan Today"}
          </button>
          <button
            type="button"
            className="secondary-button"
            style={{ flex: 1, padding: "5px 2px", fontSize: 10, marginTop: 0 }}
            onClick={() => setActiveWorkflow("planTomorrow")}
          >
            Plan Tomorrow
          </button>
          {goals.length > 0 && (
            <button
              type="button"
              className="secondary-button"
              style={{ flex: 1, padding: "5px 2px", fontSize: 10, marginTop: 0 }}
              onClick={() => setActiveWorkflow("outcome")}
            >
              Outcome
            </button>
          )}
        </div>
      </section>

      {/* 2. CURRENT FOCUS (Contextual NOW Layer with observed telemetry) */}
      <section className="task-card">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
          <div className="section-kicker" style={{ margin: 0 }}>
            {activeSession ? (
              <span style={{ color: "#34d399", display: "flex", alignItems: "center", gap: 4 }}>
                <span className="live-dot" /> ACTIVE SESSION
              </span>
            ) : (
              "CURRENT FOCUS"
            )}
          </div>
          {activeTask && !activeSession && (
            <button
              type="button"
              className="text-button"
              style={{ fontSize: 10, color: "#9d91b7" }}
              onClick={() => setSelectedTaskId(null)}
            >
              Switch
            </button>
          )}
        </div>

        {activeSession && activeTask ? (
          <div>
            <h2 style={{ fontSize: 13, fontWeight: 650, color: "#faf7ff", margin: "0 0 2px" }}>
              {activeTask.title}
            </h2>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10.5, color: "#c6b5ef", marginBottom: 6 }}>
              {activeTask.goalTitle && <span>Goal: {activeTask.goalTitle}</span>}
              {current && (
                <span style={{ color: "#a78bfa" }}>
                  Observed: {current.domain}
                </span>
              )}
            </div>

            <div style={{ display: "flex", gap: 4 }}>
              <button
                type="button"
                className="secondary-button"
                style={{ flex: 1, padding: "6px", fontSize: 10.5 }}
                onClick={() => setTab("focus")}
              >
                <Timer size={12} /> Open Timer
              </button>
              <button
                type="button"
                className="primary-button"
                style={{ flex: 1, padding: "6px", fontSize: 10.5, background: "#34d399", color: "#000" }}
                onClick={handleFinishFocus}
              >
                <CheckCircle2 size={12} /> Complete
              </button>
            </div>
          </div>
        ) : activeTask ? (
          <div>
            <h2 style={{ fontSize: 13, fontWeight: 650, color: "#faf7ff", margin: "0 0 2px" }}>
              {activeTask.title}
            </h2>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10.5, color: "#9d91b7", marginBottom: 8 }}>
              {activeTask.goalTitle && <span>Goal: {activeTask.goalTitle}</span>}
              <span>Estimate: {activeTask.plannedDurationMinutes ?? 30}m</span>
            </div>

            <button
              className="primary-button full"
              onClick={() => handleStartFocus(activeTask.id)}
              type="button"
              style={{ marginTop: 0 }}
            >
              <Play size={13} fill="currentColor" />
              Start Focus
            </button>
          </div>
        ) : incompleteTasks.length > 0 ? (
          <div>
            <p style={{ fontSize: 11, color: "#948ca2", margin: "0 0 6px" }}>
              Select a task to begin an intentional session:
            </p>
            <div style={{ display: "grid", gap: 4, marginBottom: 4 }}>
              {incompleteTasks.slice(0, 3).map((t) => (
                <div
                  key={t.id}
                  onClick={() => setSelectedTaskId(t.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "6px 8px",
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 6,
                    cursor: "pointer",
                  }}
                >
                  <span style={{ fontSize: 11, color: "#faf7ff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {t.title}
                  </span>
                  <span style={{ fontSize: 9.5, color: "#9d91b7", flexShrink: 0, marginLeft: 6 }}>
                    {t.plannedDurationMinutes ?? 30}m
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div>
            <h2 style={{ fontSize: 12.5, fontWeight: 650, color: "#faf7ff", margin: "0 0 2px" }}>
              Nothing ready to focus on.
            </h2>
            <p style={{ fontSize: 10.5, color: "#948ca2", margin: "0 0 8px" }}>
              Create or select a task to begin an intentional focus session.
            </p>
            <div style={{ display: "flex", gap: 4 }}>
              <button
                className="secondary-button full"
                onClick={() => openDashboard("/tasks")}
                type="button"
                style={{ marginTop: 0 }}
              >
                <ListTodo size={12} /> View Tasks
              </button>
            </div>
          </div>
        )}
      </section>

      {/* 3. NEXT UP (2–3 Deterministic Tasks) */}
      <section className="hero-card" style={{ padding: "10px 12px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
          <div className="section-kicker" style={{ margin: 0 }}>
            NEXT UP
          </div>
          <button
            type="button"
            className="text-button"
            style={{ fontSize: 10, color: "#a78bfa", display: "flex", alignItems: "center", gap: 3 }}
            onClick={() => openDashboard("/tasks")}
          >
            <span>View all</span>
            <ExternalLink size={10} />
          </button>
        </div>

        {tasks.isLoading ? (
          <div style={{ display: "grid", gap: 4 }}>
            <Skeleton className="metric-label" />
            <Skeleton className="metric-label" />
          </div>
        ) : nextUpTasks.length > 0 ? (
          <div style={{ display: "grid", gap: 5 }}>
            {nextUpTasks.map((t) => (
              <div
                key={t.id}
                onClick={() => setSelectedTaskId(t.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "5px 8px",
                  background: "rgba(255,255,255,0.02)",
                  border: "1px solid rgba(255,255,255,0.06)",
                  borderRadius: 5,
                  cursor: "pointer",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 11,
                      color: "#faf7ff",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {t.title}
                  </div>
                  <div style={{ fontSize: 9.5, color: "#9d91b7" }}>
                    {t.plannedDurationMinutes ?? 30}m · {t.goalTitle || "Independent"}
                  </div>
                </div>
                <span
                  style={{
                    fontSize: 8.5,
                    textTransform: "uppercase",
                    padding: "1px 4px",
                    borderRadius: 3,
                    background: "rgba(255,255,255,0.06)",
                    color: t.priority === "high" ? "#f87171" : "#9d91b7",
                    fontFamily: "monospace",
                    flexShrink: 0,
                  }}
                >
                  {t.priority}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ fontSize: 10.5, color: "#948ca2", margin: "2px 0" }}>
            No remaining tasks for today.
          </p>
        )}
      </section>

      {/* 4. TODAY SUMMARY (Meaningful execution/observation metrics) */}
      <div className="metric-grid">
        {summary.isLoading ? (
          [1, 2, 3, 4].map((i) => (
            <div className="metric-card" key={i}>
              <Skeleton className="metric-value" />
              <Skeleton className="metric-label" />
            </div>
          ))
        ) : (
          <>
            <Metric
              label="Intentional"
              value={formatDuration(intentionalSeconds)}
              icon={<Timer size={13} />}
            />
            <Metric
              label="Sessions"
              value={String(sessionsCompleted)}
              icon={<CheckCircle2 size={13} />}
            />
            <Metric
              label="Tasks Done"
              value={String(tasksCompleted)}
              icon={<Target size={13} />}
            />
            <Metric
              label="Observed"
              value={formatDuration(observedSeconds)}
              icon={<Activity size={13} />}
            />
          </>
        )}
      </div>

      {/* Contextual Hourly Reflection Prompt if Eligible */}
      {isEligibleForCheckIn && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "9px 12px",
            background: "rgba(139,92,246,0.14)",
            border: "1px solid rgba(167,139,250,0.3)",
            borderRadius: 10,
          }}
        >
          <div>
            <strong
              style={{ fontSize: 11, color: "#faf7ff", display: "block" }}
            >
              Hourly check-in ready
            </strong>
            <span style={{ fontSize: 10, color: "#c6b5ef" }}>
              Take 45 seconds to reflect on this block
            </span>
          </div>
          <button
            type="button"
            className="primary-button"
            style={{ marginTop: 0, padding: "5px 9px", fontSize: 10 }}
            onClick={onStartReflect}
          >
            <Sparkles size={12} /> Reflect
          </button>
        </div>
      )}

      {/* Workflow Modals */}
      {activeWorkflow === "planToday" && (
        <PlanWorkflowSheet
          title="Plan Today"
          subtitle="MORNING INTENTION"
          date={plan?.date || resolveProductiveDay()}
          initialGoals={goals.map((g) => ({ id: g.id, title: g.title }))}
          onSave={handleSavePlan}
          onClose={() => setActiveWorkflow("none")}
        />
      )}

      {activeWorkflow === "planTomorrow" && (
        <PlanWorkflowSheet
          title="Plan Tomorrow"
          subtitle="EVENING SHUTDOWN"
          date={resolveTomorrowProductiveDay()}
          initialGoals={[]}
          onSave={handleSavePlan}
          onClose={() => setActiveWorkflow("none")}
        />
      )}

      {activeWorkflow === "outcome" && goals.length > 0 && (
        <OutcomeWorkflowSheet
          goals={goals}
          onSave={handleAssessOutcome}
          onClose={() => setActiveWorkflow("none")}
        />
      )}
    </main>
  );
}

// -------------------------------------------------------------
// FOCUS VIEW (Single execution timer, exact presets, reflection)
// -------------------------------------------------------------
function FocusView({
  status,
  onStartReflect,
}: {
  status?: ExtensionStatus;
  onStartReflect: () => void;
}) {
  const queryClient = useQueryClient();
  const tasks = useQuery({
    queryKey: ["tasks"],
    queryFn: apiClient.getTasks.bind(apiClient),
  });
  const sessions = useQuery({
    queryKey: ["sessions"],
    queryFn: apiClient.getSessions.bind(apiClient),
  });
  const activeSession = sessions.data?.find((session) => !session.endedAt);
  const task =
    tasks.data?.find((item) => item.id === activeSession?.taskId) ??
    tasks.data?.find((item) => item.status !== "done");

  const [preset, setPreset] = useState<25 | 50 | "custom">(25);
  const [customMins, setCustomMins] = useState(30);
  const [showReflection, setShowReflection] = useState(false);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const start = useMutation({
    mutationFn: () => {
      const duration = preset === "custom" ? customMins : preset;
      return apiClient.startSession(task?.id, duration);
    },
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ["sessions"] }),
  });

  const finish = useMutation({
    mutationFn: async ({
      markDone,
      openCheckIn,
    }: {
      markDone: boolean;
      openCheckIn?: boolean;
    }) => {
      if (!activeSession) return;
      if (markDone && task) {
        try {
          await apiClient.updateTask(task.id, { status: "done" });
          void queryClient.invalidateQueries({ queryKey: ["tasks"] });
        } catch (e) {
          console.error("Failed to mark task done", e);
        }
      }
      await apiClient.finishSession(activeSession.id);
      void queryClient.invalidateQueries({ queryKey: ["sessions"] });
      setShowReflection(false);
      if (openCheckIn) {
        onStartReflect();
      }
    },
  });

  const elapsedSec = activeSession
    ? Math.floor((now - Date.parse(activeSession.startedAt)) / 1000)
    : 0;
  const targetDurationSec =
    preset === "custom" ? customMins * 60 : preset * 60;
  const remainingSec = Math.max(0, targetDurationSec - elapsedSec);

  if (showReflection && activeSession) {
    return (
      <main className="content" style={{ gap: 10 }}>
        <div className="section-heading compact">
          <div>
            <span className="section-kicker">FOCUS COMPLETE</span>
            <h1 style={{ fontSize: 15 }}>What happened?</h1>
          </div>
        </div>

        <section className="focus-card">
          <p style={{ margin: "0 0 6px", fontSize: 11.5, color: "#948ca2" }}>
            Reflect on this focus session for{" "}
            <strong style={{ color: "#f7f3fc" }}>
              {task?.title ?? "your task"}
            </strong>
            :
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <button
              type="button"
              className="primary-button full"
              style={{ marginTop: 0 }}
              disabled={finish.isPending}
              onClick={() => finish.mutate({ markDone: true })}
            >
              <CheckCircle2 size={14} /> Completed the task
            </button>

            <button
              type="button"
              className="secondary-button full"
              style={{ marginTop: 0 }}
              disabled={finish.isPending}
              onClick={() => finish.mutate({ markDone: false })}
            >
              Made progress
            </button>

            <button
              type="button"
              className="secondary-button full"
              style={{ marginTop: 0 }}
              disabled={finish.isPending}
              onClick={() =>
                finish.mutate({ markDone: false, openCheckIn: true })
              }
            >
              Got stuck (Reflect on blocker)
            </button>

            <button
              type="button"
              className="secondary-button full"
              style={{ marginTop: 0 }}
              disabled={finish.isPending}
              onClick={() => finish.mutate({ markDone: false })}
            >
              Did something else
            </button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="content" style={{ gap: 10 }}>
      <div className="section-heading compact">
        <div>
          <span className="section-kicker">
            {activeSession ? "FOCUSING" : "FOCUS BLOCK"}
          </span>
          <h1 style={{ fontSize: 15 }}>
            {activeSession ? "Deliberate execution." : "One thing at a time."}
          </h1>
        </div>
      </div>

      <section className="focus-card">
        <div className="focus-timer-box">
          <div>
            <span>{activeSession ? "Time remaining" : "Duration"}</span>
            <strong>
              {formatClock(activeSession ? remainingSec : targetDurationSec)}
            </strong>
          </div>
          <Timer size={26} color="#a78bfa" />
        </div>

        <div className="focus-details">
          <span className="section-kicker">CURRENT TASK</span>
          <h2>{task?.title ?? "An intentional work block"}</h2>
          <p>
            {activeSession
              ? "Work session is active and being recorded."
              : "Choose your focus block below."}
          </p>
        </div>

        {!activeSession && (
          <div>
            <div style={{ display: "flex", gap: 5 }}>
              {[25, 50].map((mins) => (
                <button
                  key={mins}
                  type="button"
                  onClick={() => setPreset(mins as 25 | 50)}
                  className="secondary-button"
                  style={{
                    flex: 1,
                    marginTop: 0,
                    padding: "7px 2px",
                    fontSize: 11,
                    background:
                      preset === mins ? "rgba(139,92,246,0.3)" : undefined,
                    borderColor: preset === mins ? "#a78bfa" : undefined,
                    color: preset === mins ? "#faf7ff" : undefined,
                  }}
                >
                  {mins}m
                </button>
              ))}
              <button
                type="button"
                onClick={() => setPreset("custom")}
                className="secondary-button"
                style={{
                  flex: 1,
                  marginTop: 0,
                  padding: "7px 2px",
                  fontSize: 11,
                  background:
                    preset === "custom" ? "rgba(139,92,246,0.3)" : undefined,
                  borderColor: preset === "custom" ? "#a78bfa" : undefined,
                  color: preset === "custom" ? "#faf7ff" : undefined,
                }}
              >
                Custom
              </button>
            </div>

            {preset === "custom" && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  marginTop: 8,
                }}
              >
                <span style={{ fontSize: 10.5, color: "#90869e" }}>
                  Duration:
                </span>
                <input
                  type="number"
                  min={5}
                  max={180}
                  value={customMins}
                  onChange={(e) =>
                    setCustomMins(
                      Math.max(5, Math.min(180, Number(e.target.value) || 25))
                    )
                  }
                  style={{
                    width: 50,
                    padding: "3px 6px",
                    borderRadius: 6,
                    border: "1px solid rgba(255,255,255,0.15)",
                    background: "#161320",
                    color: "#f5f0fb",
                    fontSize: 11,
                    textAlign: "center",
                  }}
                />
                <span style={{ fontSize: 10, color: "#90869e" }}>
                  min (5–180)
                </span>
              </div>
            )}
          </div>
        )}

        {activeSession ? (
          <button
            type="button"
            className="danger-button full"
            onClick={() => setShowReflection(true)}
            disabled={finish.isPending}
          >
            <Square size={13} fill="currentColor" />
            End Session
          </button>
        ) : (
          <button
            type="button"
            className="primary-button full"
            onClick={() => start.mutate()}
            disabled={start.isPending || status?.trackingPaused}
          >
            <Play size={13} fill="currentColor" />
            {status?.trackingPaused
              ? "Resume tracking first"
              : `Start ${
                  preset === "custom" ? customMins : preset
                }m Focus`}
          </button>
        )}
      </section>
    </main>
  );
}

// -------------------------------------------------------------
// REFLECT VIEW (Locked 3rd tab: Hourly check-in wizard & reflections)
// -------------------------------------------------------------
function ReflectView({
  activeTask,
  patterns,
  mode = "hourly",
  isStandalone,
  onModeChange,
  onCheckInComplete,
}: {
  activeTask?: Task;
  patterns?: any[];
  mode?: "menu" | "hourly" | "inactivity";
  isStandalone?: boolean;
  onModeChange?: (mode: "menu" | "hourly" | "inactivity") => void;
  onCheckInComplete?: () => void;
}) {
  const [internalMode, setInternalMode] = useState<"menu" | "hourly" | "inactivity">(mode);

  useEffect(() => {
    setInternalMode(mode);
  }, [mode]);

  const setMode = (m: "menu" | "hourly" | "inactivity") => {
    setInternalMode(m);
    onModeChange?.(m);
  };

  if (internalMode === "hourly") {
    return (
      <CheckInView
        currentTask={activeTask}
        patterns={patterns ?? []}
        isStandalone={isStandalone}
        onComplete={() => {
          setMode("menu");
          onCheckInComplete?.();
        }}
        onCancel={() => setMode("menu")}
        onSwitchToInactivity={() => setMode("inactivity")}
      />
    );
  }

  if (internalMode === "inactivity") {
    return (
      <InactivityView
        isStandalone={isStandalone}
        onComplete={() => {
          setMode("menu");
          onCheckInComplete?.();
        }}
        onCancel={() => setMode("menu")}
      />
    );
  }

  return (
    <main className="content" style={{ gap: 10 }}>
      <div className="section-heading compact">
        <div>
          <span className="section-kicker">REFLECTION WORKSPACE</span>
          <h1 style={{ fontSize: 15 }}>Close the loop on reality.</h1>
        </div>
      </div>

      <section className="hero-card" style={{ padding: 14 }}>
        <div style={{ display: "grid", gap: 3, marginBottom: 12 }}>
          <strong style={{ fontSize: 12.5, color: "#faf7ff" }}>
            Hourly Check-in
          </strong>
          <span style={{ fontSize: 11, color: "#948ca2" }}>
            30-second qualitative reflection on energy, blockers, and cognitive focus.
          </span>
        </div>
        <button
          type="button"
          className="primary-button full"
          style={{ marginTop: 0 }}
          onClick={() => setMode("hourly")}
        >
          <Sparkles size={13} /> Start Hourly Check-in
        </button>
      </section>

      <section className="hero-card" style={{ padding: 14 }}>
        <div style={{ display: "grid", gap: 3, marginBottom: 12 }}>
          <strong style={{ fontSize: 12.5, color: "#faf7ff" }}>
            Inactivity Recovery
          </strong>
          <span style={{ fontSize: 11, color: "#948ca2" }}>
            Label prolonged periods of observed inactivity (Break, Meeting, Away).
          </span>
        </div>
        <button
          type="button"
          className="secondary-button full"
          style={{ marginTop: 0 }}
          onClick={() => setMode("inactivity")}
        >
          Review Inactivity Blocks
        </button>
      </section>
    </main>
  );
}

// -------------------------------------------------------------
// REVIEW VIEW (Locked 4th tab: Delayed Spaced Learning Recall)
// -------------------------------------------------------------
function ReviewView() {
  const queryClient = useQueryClient();
  const assessments = useQuery({
    queryKey: ["assessments"],
    queryFn: apiClient.getAssessments.bind(apiClient),
  });

  const due = useMemo(() => {
    return (assessments.data ?? []).filter(
      (a) => !a.completedAt && Date.parse(a.scheduledAt) <= Date.now()
    );
  }, [assessments.data]);

  const activeAssessment = due[0];
  const activeQuestion =
    activeAssessment?.questions?.find((q) => q.score === null) ??
    activeAssessment?.questions?.[0];

  const [revealed, setRevealed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleAnswer = async (score: number) => {
    if (!activeQuestion) return;
    setSubmitting(true);
    try {
      await apiClient.submitLearningAnswer(
        activeQuestion.id,
        activeQuestion.expectedAnswer ?? "Recall review",
        score
      );
      void queryClient.invalidateQueries({ queryKey: ["assessments"] });
      setRevealed(false);
    } catch (e) {
      console.error("Failed to submit review answer:", e);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="content" style={{ gap: 10 }}>
      <div className="section-heading compact">
        <div>
          <span className="section-kicker">LEARNING RECALL</span>
          <h1 style={{ fontSize: 15 }}>Recall, then move on.</h1>
        </div>
        <button
          className="text-button"
          onClick={() => openDashboard("/learning")}
          type="button"
        >
          Full view <ExternalLink size={11} />
        </button>
      </div>

      <section className="review-card">
        {assessments.isLoading ? (
          <>
            <Skeleton className="task-title" />
            <Skeleton className="task-meta" />
          </>
        ) : due.length > 0 && activeQuestion ? (
          <>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span className="section-kicker" style={{ color: "#a78bfa" }}>
                {due.length} {due.length === 1 ? "REVIEW DUE" : "REVIEWS DUE"}
              </span>
              <span style={{ fontSize: 10, color: "#8a8298" }}>
                {activeAssessment.topic}
              </span>
            </div>

            <div className="flashcard-box">
              <span
                style={{
                  fontSize: 9.5,
                  color: "#a78bfa",
                  textTransform: "uppercase",
                  letterSpacing: ".06em",
                }}
              >
                QUESTION
              </span>
              <div className="flashcard-question">{activeQuestion.prompt}</div>

              {revealed && activeQuestion.expectedAnswer && (
                <div className="flashcard-answer">
                  {activeQuestion.expectedAnswer}
                </div>
              )}
            </div>

            {!revealed ? (
              <button
                type="button"
                className="secondary-button full"
                onClick={() => setRevealed(true)}
              >
                Reveal Answer
              </button>
            ) : (
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  type="button"
                  className="secondary-button"
                  style={{ flex: 1, marginTop: 0 }}
                  onClick={() => handleAnswer(0)}
                  disabled={submitting}
                >
                  Need Review
                </button>
                <button
                  type="button"
                  className="primary-button"
                  style={{ flex: 1, marginTop: 0 }}
                  onClick={() => handleAnswer(1)}
                  disabled={submitting}
                >
                  Got It
                </button>
              </div>
            )}
          </>
        ) : (
          <div style={{ textAlign: "center", padding: "16px 8px" }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: "50%",
                background: "rgba(52,211,153,0.12)",
                display: "grid",
                placeItems: "center",
                color: "#34d399",
                margin: "0 auto 10px",
              }}
            >
              <CheckCircle2 size={18} />
            </div>
            <h2 style={{ fontSize: 14, margin: "0 0 4px", color: "#f7f3fc" }}>
              You&apos;re caught up.
            </h2>
            <p style={{ fontSize: 11, color: "#948ca2", margin: "0 0 12px" }}>
              No learning recall prompts are due right now.
            </p>
            <button
              className="secondary-button"
              onClick={() => openDashboard("/learning")}
              type="button"
            >
              Open learning dashboard <ExternalLink size={12} />
            </button>
          </div>
        )}
      </section>
    </main>
  );
}

// -------------------------------------------------------------
// MORE HUB (Menu, settings, diagnostics, data export)
// -------------------------------------------------------------
function MoreView({
  status,
  refresh,
  setSubView,
}: {
  status?: ExtensionStatus;
  refresh: () => void;
  setSubView: (v: MoreSubView) => void;
}) {
  const [confirmPause, setConfirmPause] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportSuccess, setExportSuccess] = useState(false);
  const paused = status?.trackingPaused ?? false;
  const toggle = useMutation({
    mutationFn: async () => setTrackingPaused(!paused),
    onSuccess: refresh,
  });
  const authMutation = useMutation({
    mutationFn: async () => triggerAuth(),
    onSuccess: refresh,
  });

  const handleExportData = async () => {
    setExporting(true);
    setExportSuccess(false);
    try {
      const data = await apiClient.exportData();
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `productivehix-export-${new Date()
        .toISOString()
        .slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setExportSuccess(true);
    } catch (err) {
      console.error("Data export failed:", err);
    } finally {
      setExporting(false);
    }
  };

  return (
    <main className="content" style={{ gap: 10 }}>
      <div className="section-heading compact">
        <div>
          <span className="section-kicker">CONTROL CENTER</span>
          <h1 style={{ fontSize: 15 }}>Quietly in the background.</h1>
        </div>
      </div>

      <section className="settings-card">
        {/* Account Row */}
        <div className="setting-row">
          <div className="setting-icon">
            <ShieldCheck size={14} />
          </div>
          <div className="setting-copy">
            <strong>Account</strong>
            <span>
              {status?.authenticated
                ? "Connected to local operating system"
                : "Unpaired device"}
            </span>
          </div>
          {status?.authenticated ? (
            <span className="connection-label good">Paired</span>
          ) : (
            <button
              className="text-button"
              onClick={() => authMutation.mutate()}
              type="button"
            >
              Pair <ExternalLink size={11} />
            </button>
          )}
        </div>

        {/* Browser Tracking Row */}
        <div className="setting-row">
          <div className="setting-icon">
            <Activity size={14} />
          </div>
          <div className="setting-copy">
            <strong>Browser telemetry</strong>
            <span>{paused ? "Tracking paused" : "Active and private"}</span>
          </div>
          <button
            type="button"
            className={`toggle ${paused ? "off" : "on"}`}
            onClick={() => (paused ? toggle.mutate() : setConfirmPause(true))}
            aria-label="Toggle browser tracking"
          >
            <span />
          </button>
        </div>

        {confirmPause && (
          <div className="confirm-row">
            <span>Pause telemetry now?</span>
            <div>
              <button
                type="button"
                className="text-button"
                onClick={() => setConfirmPause(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="danger-button small"
                onClick={() => {
                  setConfirmPause(false);
                  toggle.mutate();
                }}
              >
                <Pause size={11} /> Pause
              </button>
            </div>
          </div>
        )}

        {/* Desktop Agent Row */}
        <div className="setting-row">
          <div className="setting-icon">
            <Monitor size={14} />
          </div>
          <div className="setting-copy">
            <strong>Desktop watcher</strong>
            <span>
              {status?.desktop?.connected
                ? `Connected (${
                    status.desktop.activityWatchRunning
                      ? "AW Running"
                      : "AW Inactive"
                  })`
                : "Not connected"}
            </span>
          </div>
          <span
            className={`connection-label ${
              status?.desktop?.connected ? "good" : "muted"
            }`}
          >
            {status?.desktop?.connected ? "Ready" : "Offline"}
          </span>
        </div>
      </section>

      {/* Navigation Links: Settings, Diagnostics, Export, Dashboard */}
      <section className="settings-card">
        <button
          type="button"
          className="setting-row"
          style={{
            width: "100%",
            background: "transparent",
            border: 0,
            textAlign: "left",
            cursor: "pointer",
          }}
          onClick={() => setSubView("settings")}
        >
          <div className="setting-icon">
            <Sliders size={14} />
          </div>
          <div className="setting-copy">
            <strong>Settings</strong>
            <span>Check-in, quiet hours, focus blocks, privacy</span>
          </div>
          <ExternalLink size={12} color="#8a8298" />
        </button>

        <button
          type="button"
          className="setting-row"
          style={{
            width: "100%",
            background: "transparent",
            border: 0,
            textAlign: "left",
            cursor: "pointer",
          }}
          onClick={() => setSubView("diagnostics")}
        >
          <div className="setting-icon">
            <Terminal size={14} />
          </div>
          <div className="setting-copy">
            <strong>System Diagnostics</strong>
            <span>Event counters, scheduler state, test notification</span>
          </div>
          <ExternalLink size={12} color="#8a8298" />
        </button>

        <div className="setting-row">
          <div className="setting-icon">
            <Download size={14} />
          </div>
          <div className="setting-copy">
            <strong>Export my data</strong>
            <span>Download tasks, sessions, and check-ins (JSON)</span>
          </div>
          <button
            type="button"
            className="secondary-button"
            style={{ marginTop: 0, padding: "5px 9px", fontSize: 10.5 }}
            onClick={handleExportData}
            disabled={exporting}
          >
            {exporting
              ? "Exporting..."
              : exportSuccess
              ? "Downloaded!"
              : "Export"}
          </button>
        </div>
      </section>

      <button
        type="button"
        className="secondary-button full"
        onClick={() => openDashboard("/")}
      >
        Open Web Dashboard <ExternalLink size={12} />
      </button>
    </main>
  );
}

// -------------------------------------------------------------
// APP ROOT
// -------------------------------------------------------------
export function App() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("today");
  const [moreSubView, setMoreSubView] = useState<MoreSubView>("menu");
  const [reflectMode, setReflectMode] = useState<"hourly" | "inactivity" | "menu">("hourly");

  const isStandalone = useMemo(() => {
    try {
      return (
        typeof window !== "undefined" &&
        new URLSearchParams(window.location.search).get("standalone") === "true"
      );
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    if (isStandalone) {
      document.body.classList.add("standalone");
    }
  }, [isStandalone]);

  const status = useQuery({
    queryKey: ["extension-status"],
    queryFn: getExtensionStatus,
    refetchInterval: 10_000,
  });

  const patterns = useQuery({
    queryKey: ["check-in-patterns"],
    queryFn: () => apiClient.getCheckInPatterns().catch(() => []),
  });

  const tasks = useQuery({
    queryKey: ["tasks"],
    queryFn: apiClient.getTasks.bind(apiClient),
  });

  const activeTask =
    tasks.data?.find((t) => t.status === "in_progress") ??
    tasks.data?.find((t) => t.status === "todo");

  useEffect(() => {
    const applyRouting = (targetTab?: string, targetMode?: string) => {
      if (targetMode === "hourly" || targetMode === "inactivity" || targetMode === "menu") {
        setReflectMode(targetMode);
      }
      if (targetTab === "inactivity") {
        setTab("reflect");
        setReflectMode("inactivity");
      } else if (
        targetTab === "reflect" ||
        targetTab === "checkin"
      ) {
        setTab("reflect");
        if (!targetMode) {
          setReflectMode("hourly");
        }
      } else if (
        targetTab === "focus" ||
        targetTab === "review" ||
        targetTab === "more" ||
        targetTab === "today"
      ) {
        setTab(targetTab as Tab);
      }
    };

    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      chrome.storage.local.get(["openToTab", "reflectMode"], (result) => {
        if (result.openToTab || result.reflectMode) {
          applyRouting(result.openToTab, result.reflectMode);
          void chrome.storage.local.remove(["openToTab", "reflectMode"]);
        }
      });
    }

    try {
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get("tab") || params.get("view");
      const modeParam = params.get("mode");
      if (tabParam || modeParam) {
        applyRouting(tabParam || undefined, modeParam || undefined);
      }
    } catch {}

    const handleMessage = (msg: any) => {
      if (msg?.type === "NAVIGATE_POPUP") {
        applyRouting(msg.tab, msg.mode);
      }
    };

    const handleStorageChange = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      const newTab = changes.openToTab?.newValue;
      const newMode = changes.reflectMode?.newValue;
      if (newTab || newMode) {
        applyRouting(newTab, newMode);
      }
    };

    // Clear notification badge when popup is opened
    try {
      if (typeof chrome !== "undefined" && chrome.action?.setBadgeText) {
        void chrome.action.setBadgeText({ text: "" });
      }
    } catch {}

    if (typeof chrome !== "undefined") {
      chrome.runtime?.onMessage?.addListener(handleMessage);
      chrome.storage?.onChanged?.addListener(handleStorageChange);
      return () => {
        chrome.runtime?.onMessage?.removeListener(handleMessage);
        chrome.storage?.onChanged?.removeListener(handleStorageChange);
      };
    }
  }, []);

  const handleTabChange = (newTab: Tab) => {
    setTab(newTab);
    setMoreSubView("menu");
    if (newTab === "reflect") {
      setReflectMode("hourly");
    }
  };

function notifyCloseModal() {
  try {
    if (typeof window !== "undefined") {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: "PRODUCTIVEHIX_CLOSE_MODAL" }, "*");
      }
      window.close();
    }
  } catch {}
}

  return (
    <div className="app-shell">
      <Header
        status={status.data}
        isStandalone={isStandalone}
        onClose={notifyCloseModal}
        onPillClick={() => {
          setTab("more");
        }}
      />

      <TopNav tab={tab} setTab={handleTabChange} />

      {/* VIEW RENDERER: Locked 5 Views */}
      {tab === "today" ? (
        <TodayView
          status={status.data}
          setTab={setTab}
          onStartReflect={() => {
            setReflectMode("hourly");
            setTab("reflect");
          }}
        />
      ) : tab === "focus" ? (
        <FocusView
          status={status.data}
          onStartReflect={() => {
            setReflectMode("hourly");
            setTab("reflect");
          }}
        />
      ) : tab === "reflect" ? (
        <ReflectView
          activeTask={activeTask}
          patterns={patterns.data ?? []}
          mode={reflectMode}
          isStandalone={isStandalone}
          onModeChange={setReflectMode}
          onCheckInComplete={() => {
            void queryClient.invalidateQueries({
              queryKey: ["extension-status"],
            });
            void queryClient.invalidateQueries({
              queryKey: ["activity-summary"],
            });
            if (isStandalone) {
              notifyCloseModal();
            } else {
              setTab("today");
              setReflectMode("hourly");
            }
          }}
        />
      ) : tab === "review" ? (
        <ReviewView />
      ) : moreSubView === "settings" ? (
        <SettingsView
          status={status.data}
          onBack={() => setMoreSubView("menu")}
          onRefresh={() => void status.refetch()}
        />
      ) : moreSubView === "diagnostics" ? (
        <DiagnosticsView
          status={status.data}
          onBack={() => setMoreSubView("menu")}
          onRefresh={() => void status.refetch()}
        />
      ) : (
        <MoreView
          status={status.data}
          refresh={() => void status.refetch()}
          setSubView={setMoreSubView}
        />
      )}

      <footer className="footer">
        <ShieldCheck size={11} /> Your data stays yours.
      </footer>
    </div>
  );
}
