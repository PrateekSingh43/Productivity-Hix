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
import { normalizeTimezone } from "@repo/validation";
import { CheckInView } from "./CheckInView";
import { SettingsView } from "./SettingsView";
import { DiagnosticsView } from "./DiagnosticsView";
import { InactivityView } from "./InactivityView";

// Linear v1.3 persistent navigation (Reflect is triggered exclusively via notification / check-in events)
type Tab = "today" | "focus" | "review" | "more";
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
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

function openDashboard(path = "") {
  void chrome.tabs.create({ url: `http://localhost:5173${path}` });
}

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden="true" />;
}

function Header({
  isStandalone,
  onClose,
}: {
  status?: ExtensionStatus;
  onPillClick?: () => void;
  isStandalone?: boolean;
  onClose?: () => void;
}) {
  return (
    <header className="header">
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div className="brand-mark">
          <img
            src="icon.png"
            alt="ProductiveHix"
            style={{ width: 16, height: 16, objectFit: "contain" }}
          />
        </div>
        <div className="brand">ProductiveHix</div>
      </div>
      {isStandalone ? (
        <button
          type="button"
          className="icon-button"
          onClick={onClose || (() => window.close())}
          title="Close window"
          aria-label="Close window"
        >
          <X size={15} />
        </button>
      ) : null}
    </header>
  );
}

function TopNav({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  const items: Array<[Tab, string, typeof Sun]> = [
    ["today", "Today", Sun],
    ["focus", "Focus", Timer],
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

function Metric({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
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
    initialGoals.length > 0 ? initialGoals : [{ title: "" }],
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
        background: "rgba(0,0,0,0.65)",
        backdropFilter: "blur(2px)",
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
          background: "var(--bg-surface-elevated)",
          border: "1px solid var(--border-default)",
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
                color: "var(--text-primary)",
                margin: "2px 0 0",
              }}
            >
              {title}{" "}
              {formattedDate && (
                <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 400 }}>
                  ({formattedDate})
                </span>
              )}
            </h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close">
            <X size={15} />
          </button>
        </div>

        <form onSubmit={handleSave} style={{ display: "grid", gap: 10 }}>
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <label style={{ fontSize: 10.5, color: "var(--text-secondary)", fontWeight: 500 }}>
                Daily Goals (0..N objectives)
              </label>
              <span style={{ fontSize: 9.5, color: "var(--accent-primary)", fontWeight: 500 }}>
                1–3 recommended
              </span>
            </div>

            <div style={{ display: "grid", gap: 6 }}>
              {draftGoals.map((g, idx) => (
                <div key={idx} style={{ display: "flex", gap: 5, alignItems: "center" }}>
                  <span
                    style={{
                      fontSize: 10,
                      fontFamily: "ui-monospace, monospace",
                      color: "var(--accent-primary)",
                      background: "var(--accent-subtle)",
                      padding: "4px 6px",
                      borderRadius: 4,
                      fontWeight: 600,
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
                      background: "var(--bg-subtle)",
                      border: "1px solid var(--border-default)",
                      color: "var(--text-primary)",
                      fontSize: 11.5,
                      outline: "none",
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
                        color: "var(--text-muted)",
                        cursor: "pointer",
                        padding: 3,
                        display: "flex",
                        alignItems: "center",
                      }}
                      title="Remove goal"
                      aria-label="Remove goal"
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
                color: "var(--accent-primary)",
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: "6px 2px",
                marginTop: 4,
                fontWeight: 500,
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
            <button type="submit" className="primary-button" style={{ flex: 1 }} disabled={saving}>
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
        background: "rgba(0,0,0,0.65)",
        backdropFilter: "blur(2px)",
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
      <div
        className="hero-card"
        style={{
          padding: 14,
          maxHeight: "92%",
          overflowY: "auto",
          background: "var(--bg-surface-elevated)",
          border: "1px solid var(--border-default)",
        }}
      >
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
                color: "var(--text-primary)",
                margin: "2px 0 0",
              }}
            >
              Assess Goal Outcomes
            </h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close">
            <X size={15} />
          </button>
        </div>

        {goals.length > 1 && (
          <div
            style={{
              display: "flex",
              gap: 4,
              marginBottom: 10,
              overflowX: "auto",
              paddingBottom: 4,
            }}
          >
            {goals.map((g, idx) => (
              <button
                key={g.id}
                type="button"
                onClick={() => setSelectedGoalId(g.id)}
                className={`filter-toggle ${g.id === (currentGoal?.id ?? "") ? "active" : ""}`}
                style={{
                  fontSize: 10.5,
                  padding: "4px 8px",
                  whiteSpace: "nowrap",
                }}
              >
                Goal {idx + 1}
              </button>
            ))}
          </div>
        )}

        <p style={{ fontSize: 11, color: "var(--text-secondary)", margin: "0 0 10px" }}>
          Assessing:{" "}
          <strong style={{ color: "var(--text-primary)" }}>{currentGoal?.title || "Goal"}</strong>
        </p>

        <div style={{ display: "grid", gap: 6, marginBottom: 12 }}>
          {outcomes.map((o) => {
            const isSel = currentGoal?.outcome === o.id;
            return (
              <button
                key={o.id}
                type="button"
                disabled={saving}
                onClick={() => handleSelectOutcome(o.id)}
                className={`filter-toggle ${isSel ? "active" : ""}`}
                style={{
                  textAlign: "left",
                  display: "block",
                  padding: "8px 10px",
                }}
              >
                <strong
                  style={{
                    fontSize: 11.5,
                    color: isSel ? "var(--text-primary)" : "var(--text-primary)",
                    display: "block",
                  }}
                >
                  {o.label}
                </strong>
                <span style={{ fontSize: 10, color: "var(--text-secondary)" }}>{o.desc}</span>
              </button>
            );
          })}
        </div>

        <button type="button" className="secondary-button full" onClick={onClose}>
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

  const userTimezone =
    typeof Intl !== "undefined"
      ? normalizeTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone) ?? undefined
      : undefined;
  const localDate = resolveProductiveDay(new Date(), { timezone: userTimezone });

  // 1. Domain Queries (Direct from backend)
  const todayPlan = useQuery({
    queryKey: ["plan", "today", localDate],
    queryFn: () => apiClient.getTodayPlan(localDate, userTimezone),
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
    queryKey: ["activity-summary", userTimezone],
    queryFn: () => apiClient.getTodaySummary(userTimezone),
    refetchOnWindowFocus: true,
  });

  // Sheet state
  const [activeWorkflow, setActiveWorkflow] = useState<
    "none" | "planToday" | "planTomorrow" | "outcome"
  >("none");

  const plan = todayPlan.data;
  const goals = plan?.goals ?? [];
  const independentTasks = plan?.independentTasks ?? [];
  const allTasks = tasks.data ?? [];

  // Incomplete tasks filter
  const incompleteTasks = allTasks.filter((t) => t.status !== "done" && t.status !== "cancelled");

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
    0,
  );
  const sessionsCompleted = (sessions.data ?? []).filter((s) => Boolean(s.endedAt)).length;
  const tasksCompleted = allTasks.filter((t) => t.status === "done").length;
  const observedSeconds = (summary.data?.activeTime ?? 0) / 1000;

  const current = status?.currentActivity;
  const isEligibleForCheckIn = status?.scheduler?.eligibility?.eligible ?? false;
  const activeSession = (sessions.data ?? []).find((s) => !s.endedAt);

  // Plan workflow handlers (authoritative backend mutation)
  const handleSavePlan = async (
    updatedGoals: Array<{ id?: string; title: string; order: number }>,
  ) => {
    const targetDate =
      activeWorkflow === "planTomorrow"
        ? resolveTomorrowProductiveDay(new Date(), { timezone: userTimezone })
        : plan?.date && plan.date >= localDate
        ? plan.date
        : localDate;

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
      {/* ACTIVE FOCUS SESSION BANNER */}
      {activeSession && (
        <section
          className="hero-card"
          style={{
            padding: "8px 12px",
            borderLeft: activeSession.isPaused
              ? "3px solid var(--amber)"
              : "3px solid var(--text-primary)",
            background: "var(--bg-surface-elevated)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 2,
          }}
        >
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 2 }}>
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: activeSession.isPaused ? "var(--amber)" : "var(--text-primary)",
                  display: "inline-block",
                }}
              />
              <span
                style={{
                  fontSize: 9.5,
                  fontWeight: 700,
                  letterSpacing: "0.05em",
                  textTransform: "uppercase",
                  color: activeSession.isPaused ? "var(--amber)" : "var(--text-primary)",
                }}
              >
                {activeSession.isPaused ? "Focus Paused" : "Focus Active"}
              </span>
            </div>
            <div
              style={{
                fontSize: 11.5,
                fontWeight: 600,
                color: "var(--text-primary)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {activeSession.taskTitle || activeSession.notes || "Current Focus Session"}
            </div>
          </div>
          <button
            type="button"
            className="secondary-button"
            style={{ fontSize: 10, padding: "4px 8px", marginTop: 0, flexShrink: 0 }}
            onClick={() => setTab("focus")}
          >
            Manage
          </button>
        </section>
      )}

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
            <Target size={13} style={{ color: "var(--text-muted)" }} />
            <span className="section-kicker">TODAY&apos;S PLAN</span>
          </div>
          {goals.length > 0 ? (
            <span
              style={{
                fontSize: 9.5,
                color: "var(--text-secondary)",
                background: "var(--bg-active)",
                border: "1px solid var(--border-subtle)",
                padding: "2px 6px",
                borderRadius: 4,
                fontWeight: 600,
              }}
            >
              {goals.length} {goals.length === 1 ? "Goal" : "Goals"}
            </span>
          ) : allTasks.length > 0 ? (
            <span
              style={{
                fontSize: 9.5,
                color: "var(--text-secondary)",
                background: "var(--bg-active)",
                border: "1px solid var(--border-subtle)",
                padding: "2px 6px",
                borderRadius: 4,
                fontWeight: 600,
              }}
            >
              {allTasks.length} {allTasks.length === 1 ? "Task" : "Tasks"}
            </span>
          ) : null}
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
                <div
                  key={goal.id}
                  style={{
                    borderBottom:
                      idx === goals.length - 1 ? "none" : "1px solid var(--border-subtle)",
                    paddingBottom: 6,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 4,
                    }}
                  >
                    <h2
                      style={{
                        fontSize: 12,
                        fontWeight: 650,
                        color: "var(--text-primary)",
                        margin: 0,
                        lineHeight: 1.3,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      <span
                        style={{
                          color: "var(--accent-primary)",
                          marginRight: 4,
                          fontFamily: "ui-monospace, monospace",
                          fontWeight: 600,
                        }}
                      >
                        {(idx + 1).toString().padStart(2, "0")}
                      </span>
                      {goal.title}
                    </h2>
                    {goal.outcome && (
                      <span
                        style={{
                          fontSize: 9,
                          color: "var(--text-secondary)",
                          background: "var(--bg-active)",
                          padding: "1px 5px",
                          borderRadius: 3,
                          flexShrink: 0,
                          fontWeight: 600,
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
                            color:
                              t.status === "done" ? "var(--text-muted)" : "var(--text-secondary)",
                            opacity: t.status === "done" ? 0.75 : 1,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          <span
                            style={{
                              color: "var(--text-muted)",
                              marginRight: 3,
                              fontFamily: "ui-monospace, monospace",
                            }}
                          >
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
        ) : allTasks.length > 0 ? (
          <div style={{ padding: "6px 0 10px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 3 }}>
              <p
                style={{
                  fontSize: 11.5,
                  color: "var(--text-primary)",
                  fontWeight: 600,
                  margin: 0,
                }}
              >
                Today&apos;s Workload
              </p>
              <span
                style={{
                  fontSize: 9.5,
                  color: "var(--text-secondary)",
                  background: "var(--bg-active)",
                  border: "1px solid var(--border-subtle)",
                  padding: "1px 5px",
                  borderRadius: 4,
                  fontWeight: 550,
                }}
              >
                {allTasks.length} {allTasks.length === 1 ? "task" : "tasks"} ({incompleteTasks.length} remaining)
              </span>
            </div>
            <p style={{ fontSize: 10.5, color: "var(--text-secondary)", margin: 0, lineHeight: 1.4 }}>
              {incompleteTasks.length > 0
                ? `${incompleteTasks.length} deliberate ${incompleteTasks.length === 1 ? "task" : "tasks"} scheduled for today. Ready to execute below.`
                : "All planned tasks completed for today. Great work!"}
            </p>
          </div>
        ) : (
          <div style={{ padding: "6px 0 10px" }}>
            <p
              style={{
                fontSize: 11.5,
                color: "var(--text-primary)",
                fontWeight: 600,
                margin: "0 0 2px",
              }}
            >
              Your day hasn&apos;t been planned yet
            </p>
            <p style={{ fontSize: 10.5, color: "var(--text-secondary)", margin: 0 }}>
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
            {goals.length > 0 ? "Edit Plan" : allTasks.length > 0 ? "Set Daily Goals" : "Plan Today"}
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

      {/* 2. NEXT UP (2–3 Deterministic Tasks) */}
      <section className="hero-card" style={{ padding: "10px 12px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 6,
          }}
        >
          <div className="section-kicker" style={{ margin: 0 }}>
            NEXT UP
          </div>
          <button
            type="button"
            className="text-button"
            style={{ fontSize: 10, display: "flex", alignItems: "center", gap: 3 }}
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
                onClick={() => setTab("focus")}
                title="Click to focus on this task"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "6px 8px",
                  background: "var(--bg-subtle)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: 6,
                  cursor: "pointer",
                  overflow: "hidden",
                }}
              >
                <div style={{ flex: 1, minWidth: 0, marginRight: 8 }}>
                  <div
                    style={{
                      fontSize: 11,
                      color: "var(--text-primary)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {t.title}
                  </div>
                  <div
                    style={{
                      fontSize: 9.5,
                      color: "var(--text-muted)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {t.plannedDurationMinutes ?? 30}m · {t.goalTitle || "Independent"}
                  </div>
                </div>
                <span
                  style={{
                    fontSize: 8.5,
                    textTransform: "uppercase",
                    padding: "1px 4px",
                    borderRadius: 3,
                    background: "var(--bg-active)",
                    color: t.priority === "high" ? "var(--danger)" : "var(--text-muted)",
                    fontFamily: "ui-monospace, monospace",
                    flexShrink: 0,
                  }}
                >
                  {t.priority}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ fontSize: 10.5, color: "var(--text-secondary)", margin: "2px 0" }}>
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
            <Metric label="Tasks Done" value={String(tasksCompleted)} icon={<Target size={13} />} />
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
            background: "var(--accent-subtle)",
            border: "1px solid var(--accent-border)",
            borderRadius: 8,
          }}
        >
          <div>
            <strong style={{ fontSize: 11, color: "var(--text-primary)", display: "block" }}>
              Hourly check-in ready
            </strong>
            <span style={{ fontSize: 10, color: "var(--text-secondary)" }}>
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
          date={plan?.date && plan.date >= localDate ? plan.date : localDate}
          initialGoals={goals.map((g) => ({ id: g.id, title: g.title }))}
          onSave={handleSavePlan}
          onClose={() => setActiveWorkflow("none")}
        />
      )}

      {activeWorkflow === "planTomorrow" && (
        <PlanWorkflowSheet
          title="Plan Tomorrow"
          subtitle="EVENING SHUTDOWN"
          date={resolveTomorrowProductiveDay(new Date(), { timezone: userTimezone })}
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
    refetchOnWindowFocus: true,
  });
  const sessions = useQuery({
    queryKey: ["sessions"],
    queryFn: apiClient.getSessions.bind(apiClient),
    refetchOnWindowFocus: true,
  });

  const activeSession = sessions.data?.find((session) => !session.endedAt);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  const incompleteTasks = useMemo(() => {
    return (tasks.data ?? []).filter((t) => t.status !== "done" && t.status !== "cancelled");
  }, [tasks.data]);

  const task = useMemo(() => {
    if (activeSession?.taskId) {
      return tasks.data?.find((item) => item.id === activeSession.taskId) ?? null;
    }
    if (selectedTaskId) {
      return tasks.data?.find((item) => item.id === selectedTaskId) ?? null;
    }
    return incompleteTasks.find((t) => t.status === "in_progress") || incompleteTasks[0] || null;
  }, [activeSession, selectedTaskId, tasks.data, incompleteTasks]);

  const [preset, setPreset] = useState<25 | 50 | "custom">(25);
  const [customMins, setCustomMins] = useState(30);
  const [showEndDialog, setShowEndDialog] = useState(false);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const start = useMutation({
    mutationFn: async () => {
      const duration = preset === "custom" ? customMins : preset;
      const tid = task?.id;
      const session = await apiClient.startSession(tid, duration);
      if (tid) {
        await apiClient.updateTask(tid, { status: "in_progress" });
      }
      return session;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["sessions"] });
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });

  const pause = useMutation({
    mutationFn: async () => {
      if (!activeSession) return;
      return apiClient.pauseSession(activeSession.id);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["sessions"] });
    },
  });

  const resume = useMutation({
    mutationFn: async () => {
      if (!activeSession) return;
      return apiClient.resumeSession(activeSession.id);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["sessions"] });
    },
  });

  const finish = useMutation({
    mutationFn: async ({
      markDone,
      openCheckIn = true,
    }: {
      markDone: boolean;
      openCheckIn?: boolean;
    }) => {
      if (!activeSession) return;
      const currentTaskTitle = task?.title;
      const elapsedMins = Math.max(1, Math.round(elapsedSec / 60));

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
      setShowEndDialog(false);

      // Only dispatch OS desktop notification if NOT opening check-in directly in popup
      // (When user ends session inside popup and transitions to reflect, native notification is suppressed)
      if (!openCheckIn) {
        try {
          if (typeof chrome !== "undefined" && chrome.runtime?.sendMessage) {
            void chrome.runtime.sendMessage({
              type: "trigger-focus-ended-notification",
              taskTitle: currentTaskTitle,
              durationMinutes: elapsedMins,
            });
          }
        } catch {}
      }

      if (openCheckIn) {
        onStartReflect();
      }
    },
  });

  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);

  const discard = useMutation({
    mutationFn: async () => {
      if (!activeSession) return;
      return apiClient.deleteSession(activeSession.id);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["sessions"] });
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
      setShowEndDialog(false);
      setShowDiscardConfirm(false);
    },
  });

  // Automatically sync preset with task planned duration when idle
  useEffect(() => {
    if (task?.plannedDurationMinutes && !activeSession) {
      if (task.plannedDurationMinutes === 25 || task.plannedDurationMinutes === 50) {
        setPreset(task.plannedDurationMinutes as 25 | 50);
      } else {
        setPreset("custom");
        setCustomMins(task.plannedDurationMinutes);
      }
    }
  }, [task?.id, task?.plannedDurationMinutes, activeSession]);

  const elapsedSec = useMemo(() => {
    if (!activeSession) return 0;
    const base = activeSession.durationSeconds ?? 0;
    if (activeSession.isPaused) {
      return base;
    }
    const currentSegment = Math.max(
      0,
      Math.floor((now - Date.parse(activeSession.startedAt)) / 1000),
    );
    return base + currentSegment;
  }, [activeSession, now]);

  const targetDurationMins = useMemo(() => {
    if (activeSession) {
      return activeSession.targetDurationMinutes ?? task?.plannedDurationMinutes ?? 25;
    }
    if (task?.plannedDurationMinutes) {
      return task.plannedDurationMinutes;
    }
    return preset === "custom" ? customMins : preset;
  }, [activeSession, task, preset, customMins]);

  const targetDurationSec = targetDurationMins * 60;
  const remainingSec = targetDurationSec - elapsedSec;
  const isOvertime = remainingSec < 0;

  if (showEndDialog && activeSession) {
    return (
      <main className="content" style={{ gap: 10 }}>
        <div className="section-heading compact">
          <div>
            <span className="section-kicker">FOCUS COMPLETE</span>
            <h1 style={{ fontSize: 15 }}>Session Wrap-Up</h1>
          </div>
        </div>

        <section className="focus-card">
          <p style={{ margin: "0 0 10px", fontSize: 11.5, color: "var(--text-secondary)" }}>
            Reflect on this focus block for{" "}
            <strong style={{ color: "var(--text-primary)" }}>
              {task?.title ?? "your session"}
            </strong>
            :
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <button
              type="button"
              className="primary-button full"
              style={{ marginTop: 0 }}
              disabled={finish.isPending}
              onClick={() => finish.mutate({ markDone: true, openCheckIn: true })}
            >
              <CheckCircle2 size={14} /> Completed the task & Reflect
            </button>

            <button
              type="button"
              className="secondary-button full"
              style={{ marginTop: 0 }}
              disabled={finish.isPending}
              onClick={() => finish.mutate({ markDone: false, openCheckIn: true })}
            >
              Made progress & Reflect
            </button>

            <button
              type="button"
              className="secondary-button full"
              style={{ marginTop: 0 }}
              disabled={finish.isPending}
              onClick={() => finish.mutate({ markDone: false, openCheckIn: false })}
            >
              Finish session only (Skip reflection)
            </button>

            <button
              type="button"
              className="text-button"
              style={{ marginTop: 4, alignSelf: "center", fontSize: 11 }}
              onClick={() => setShowEndDialog(false)}
            >
              Resume focus session
            </button>

            <button
              type="button"
              className="text-button"
              style={{ marginTop: 8, alignSelf: "center", fontSize: 10.5, color: "var(--danger)" }}
              onClick={() => setShowDiscardConfirm(true)}
              disabled={discard.isPending}
            >
              <Trash2 size={11} style={{ display: "inline", marginRight: 4 }} />
              Discard session
            </button>
          </div>
        </section>

        {showDiscardConfirm && (
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: "rgba(0, 0, 0, 0.72)",
              backdropFilter: "blur(2px)",
              zIndex: 300,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 14,
            }}
            role="dialog"
            aria-modal="true"
          >
            <div
              className="hero-card"
              style={{
                padding: 16,
                background: "var(--bg-surface-elevated)",
                border: "1px solid var(--border-default)",
                borderRadius: 10,
                width: "100%",
                display: "flex",
                flexDirection: "column",
                gap: 10,
                boxShadow: "var(--shadow-overlay)",
              }}
            >
              <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                <div
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 6,
                    background: "rgba(244, 63, 94, 0.12)",
                    border: "1px solid rgba(244, 63, 94, 0.25)",
                    display: "grid",
                    placeItems: "center",
                    color: "var(--danger)",
                    flexShrink: 0,
                  }}
                >
                  <Trash2 size={15} />
                </div>
                <div>
                  <h3
                    style={{
                      margin: 0,
                      fontSize: 13.5,
                      fontWeight: 650,
                      color: "var(--text-primary)",
                    }}
                  >
                    Discard Focus Session?
                  </h3>
                  <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
                    Accidental start or want to reset?
                  </span>
                </div>
              </div>

              <p
                style={{
                  margin: 0,
                  fontSize: 11,
                  color: "var(--text-secondary)",
                  lineHeight: 1.45,
                }}
              >
                This will cancel the active session and remove the elapsed time from your history
                and analytics. This action cannot be undone.
              </p>

              <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                <button
                  type="button"
                  className="secondary-button"
                  style={{ flex: 1, marginTop: 0 }}
                  onClick={() => setShowDiscardConfirm(false)}
                  disabled={discard.isPending}
                >
                  Keep Working
                </button>
                <button
                  type="button"
                  className="danger-button"
                  style={{ flex: 1, marginTop: 0 }}
                  onClick={() => {
                    discard.mutate();
                    setShowDiscardConfirm(false);
                  }}
                  disabled={discard.isPending}
                >
                  <Trash2 size={12} />
                  {discard.isPending ? "Discarding..." : "Discard Session"}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    );
  }

  return (
    <main className="content" style={{ gap: 10 }}>
      <div className="section-heading compact">
        <div>
          <span className="section-kicker">{activeSession ? "CURRENT FOCUS" : "FOCUS BLOCK"}</span>
          <h1 style={{ fontSize: 15 }}>
            {activeSession ? "Deliberate execution." : "One thing at a time."}
          </h1>
        </div>
      </div>

      <section className="focus-card">
        {/* Timer Box */}
        <div className="focus-timer-box">
          <div>
            <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
              {activeSession && (
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: activeSession.isPaused
                      ? "var(--amber)"
                      : isOvertime
                        ? "#f59e0b"
                        : "var(--success)",
                    display: "inline-block",
                  }}
                />
              )}
              {activeSession
                ? activeSession.isPaused
                  ? "Paused"
                  : isOvertime
                    ? "Overtime (Flow)"
                    : "Time remaining"
                : "Duration"}
            </span>
            <strong>
              {activeSession
                ? isOvertime
                  ? `+${formatClock(Math.abs(remainingSec))}`
                  : formatClock(remainingSec)
                : formatClock(targetDurationSec)}
            </strong>
          </div>
          {activeSession?.isPaused ? (
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.06em",
                color: "var(--amber)",
                background: "rgba(245, 158, 11, 0.15)",
                border: "1px solid rgba(245, 158, 11, 0.3)",
                padding: "3px 7px",
                borderRadius: 4,
              }}
            >
              PAUSED
            </span>
          ) : isOvertime && activeSession ? (
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.06em",
                color: "var(--amber)",
                background: "rgba(245, 158, 11, 0.15)",
                border: "1px solid rgba(245, 158, 11, 0.3)",
                padding: "3px 7px",
                borderRadius: 4,
              }}
            >
              FLOW STATE
            </span>
          ) : (
            <Timer size={22} style={{ color: "var(--text-muted)" }} />
          )}
        </div>

        {/* Task Selection & Information */}
        {activeSession ? (
          <div className="focus-details">
            {task?.goalTitle && <span className="section-kicker">GOAL: {task.goalTitle}</span>}
            <h2>{task?.title ?? "Intentional work session"}</h2>
            <div style={{ display: "flex", alignItems: "center", gap: 6, margin: "4px 0" }}>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  padding: "2px 7px",
                  borderRadius: 4,
                  background: "var(--bg-subtle)",
                  color: "var(--text-secondary)",
                  border: "1px solid var(--border-subtle)",
                }}
              >
                Target: {targetDurationMins}m
              </span>
              {isOvertime && (
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    padding: "2px 7px",
                    borderRadius: 4,
                    background: "var(--warning-subtle)",
                    color: "var(--warning)",
                    border: "1px solid var(--warning-border)",
                  }}
                >
                  +{Math.floor(Math.abs(remainingSec) / 60)}m Overtime
                </span>
              )}
            </div>
            <p style={{ margin: "2px 0 0" }}>
              {status?.currentActivity?.domain ? (
                <span>
                  Observed:{" "}
                  <strong style={{ color: "var(--text-primary)" }}>
                    {status.currentActivity.domain}
                  </strong>
                </span>
              ) : (
                "Work session is active and being recorded."
              )}
            </p>
          </div>
        ) : (
          <div style={{ marginBottom: 12 }}>
            <label
              style={{
                fontSize: 10,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                color: "var(--text-secondary)",
                display: "block",
                marginBottom: 6,
                fontWeight: 550,
              }}
            >
              Select Target Task
            </label>
            {incompleteTasks.length > 0 ? (
              <select
                value={task?.id ?? ""}
                onChange={(e) => setSelectedTaskId(e.target.value)}
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  background: "var(--bg-subtle)",
                  border: "1px solid var(--border-default)",
                  borderRadius: 6,
                  color: "var(--text-primary)",
                  fontSize: 11.5,
                  outline: "none",
                  cursor: "pointer",
                }}
              >
                {incompleteTasks.map((t) => (
                  <option
                    key={t.id}
                    value={t.id}
                    style={{
                      background: "var(--bg-surface-elevated)",
                      color: "var(--text-primary)",
                    }}
                  >
                    {t.title} {t.goalTitle ? `· [${t.goalTitle}]` : ""} (
                    {t.plannedDurationMinutes ?? 30}m)
                  </option>
                ))}
              </select>
            ) : (
              <div
                style={{
                  padding: "8px 10px",
                  background: "var(--bg-subtle)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: 6,
                  fontSize: 11,
                  color: "var(--text-secondary)",
                }}
              >
                No incomplete tasks. Starting will create an intentional focus block.
              </div>
            )}
          </div>
        )}

        {/* Preset Selector when not active */}
        {!activeSession && (
          <div>
            <label
              style={{
                fontSize: 10,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                color: "var(--text-secondary)",
                display: "block",
                marginBottom: 6,
                fontWeight: 550,
              }}
            >
              Duration Preset
            </label>
            <div style={{ display: "flex", gap: 5 }}>
              {[25, 50].map((mins) => (
                <button
                  key={mins}
                  type="button"
                  onClick={() => setPreset(mins as 25 | 50)}
                  className={`filter-toggle ${preset === mins ? "active" : ""}`}
                  style={{ flex: 1, padding: "6px 2px" }}
                >
                  {mins}m
                </button>
              ))}
              <button
                type="button"
                onClick={() => setPreset("custom")}
                className={`filter-toggle ${preset === "custom" ? "active" : ""}`}
                style={{ flex: 1, padding: "6px 2px" }}
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
                <span style={{ fontSize: 10.5, color: "var(--text-secondary)" }}>Duration:</span>
                <input
                  type="number"
                  min={5}
                  max={180}
                  value={customMins}
                  onChange={(e) =>
                    setCustomMins(Math.max(5, Math.min(180, Number(e.target.value) || 25)))
                  }
                  style={{
                    width: 50,
                    padding: "3px 6px",
                    borderRadius: 6,
                    border: "1px solid var(--border-default)",
                    background: "var(--bg-surface-elevated)",
                    color: "var(--text-primary)",
                    fontSize: 11,
                    textAlign: "center",
                  }}
                />
                <span style={{ fontSize: 10, color: "var(--text-muted)" }}>min (5–180)</span>
              </div>
            )}
          </div>
        )}

        {/* Start / Pause / Resume / End Controls */}
        {activeSession ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 12 }}>
            <div style={{ display: "flex", gap: 8 }}>
              {activeSession.isPaused ? (
                <button
                  type="button"
                  className="primary-button"
                  style={{ flex: 1, marginTop: 0 }}
                  onClick={() => resume.mutate()}
                  disabled={resume.isPending}
                >
                  <Play size={13} fill="currentColor" />
                  Resume
                </button>
              ) : (
                <button
                  type="button"
                  className="warning-button"
                  style={{ flex: 1, marginTop: 0 }}
                  onClick={() => pause.mutate()}
                  disabled={pause.isPending}
                >
                  <Pause size={13} fill="currentColor" />
                  Pause
                </button>
              )}
              <button
                type="button"
                className="primary-button"
                style={{ flex: 1.2, marginTop: 0 }}
                onClick={() => setShowEndDialog(true)}
                disabled={finish.isPending}
              >
                <CheckCircle2 size={13} />
                Wrap-Up & Reflect
              </button>
            </div>
            <button
              type="button"
              className="text-button"
              style={{ marginTop: 4, alignSelf: "center", fontSize: 10.5, color: "var(--danger)" }}
              onClick={() => setShowDiscardConfirm(true)}
              disabled={discard.isPending}
            >
              <Trash2 size={11} style={{ display: "inline", marginRight: 4 }} />
              Discard session
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="primary-button full"
            onClick={() => start.mutate()}
            disabled={start.isPending || status?.trackingPaused}
            style={{ marginTop: 12 }}
          >
            <Play size={13} fill="currentColor" />
            {status?.trackingPaused
              ? "Resume tracking first"
              : `Start ${preset === "custom" ? customMins : preset}m Focus`}
          </button>
        )}
      </section>

      {showDiscardConfirm && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0, 0, 0, 0.72)",
            backdropFilter: "blur(2px)",
            zIndex: 300,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 14,
          }}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="hero-card"
            style={{
              padding: 16,
              background: "var(--bg-surface-elevated)",
              border: "1px solid var(--border-default)",
              borderRadius: 10,
              width: "100%",
              display: "flex",
              flexDirection: "column",
              gap: 10,
              boxShadow: "var(--shadow-overlay)",
            }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
              <div
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 6,
                  background: "rgba(244, 63, 94, 0.12)",
                  border: "1px solid rgba(244, 63, 94, 0.25)",
                  display: "grid",
                  placeItems: "center",
                  color: "var(--danger)",
                  flexShrink: 0,
                }}
              >
                <Trash2 size={15} />
              </div>
              <div>
                <h3
                  style={{
                    margin: 0,
                    fontSize: 13.5,
                    fontWeight: 650,
                    color: "var(--text-primary)",
                  }}
                >
                  Discard Focus Session?
                </h3>
                <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
                  Accidental start or want to reset?
                </span>
              </div>
            </div>

            <p
              style={{ margin: 0, fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.45 }}
            >
              This will cancel the active session and remove the elapsed time from your history and
              analytics. This action cannot be undone.
            </p>

            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
              <button
                type="button"
                className="secondary-button"
                style={{ flex: 1, marginTop: 0 }}
                onClick={() => setShowDiscardConfirm(false)}
                disabled={discard.isPending}
              >
                Keep Working
              </button>
              <button
                type="button"
                className="danger-button"
                style={{ flex: 1, marginTop: 0 }}
                onClick={() => {
                  discard.mutate();
                  setShowDiscardConfirm(false);
                }}
                disabled={discard.isPending}
              >
                <Trash2 size={12} />
                {discard.isPending ? "Discarding..." : "Discard Session"}
              </button>
            </div>
          </div>
        </div>
      )}
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
      (a) => !a.completedAt && Date.parse(a.scheduledAt) <= Date.now(),
    );
  }, [assessments.data]);

  const activeAssessment = due[0];
  const activeQuestion =
    activeAssessment?.questions?.find((q) => q.score === null) ?? activeAssessment?.questions?.[0];

  const [revealed, setRevealed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleAnswer = async (score: number) => {
    if (!activeQuestion) return;
    setSubmitting(true);
    try {
      await apiClient.submitLearningAnswer(
        activeQuestion.id,
        activeQuestion.expectedAnswer ?? "Recall review",
        score,
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
        <button className="text-button" onClick={() => openDashboard("/learning")} type="button">
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
              <span className="section-kicker">
                {due.length} {due.length === 1 ? "REVIEW DUE" : "REVIEWS DUE"}
              </span>
              <span style={{ fontSize: 10, color: "var(--text-secondary)" }}>
                {activeAssessment.topic}
              </span>
            </div>

            <div className="flashcard-box">
              <span
                style={{
                  fontSize: 9.5,
                  color: "var(--text-muted)",
                  textTransform: "uppercase",
                  letterSpacing: ".06em",
                  fontWeight: 600,
                }}
              >
                QUESTION
              </span>
              <div className="flashcard-question">{activeQuestion.prompt}</div>

              {revealed && activeQuestion.expectedAnswer && (
                <div className="flashcard-answer">{activeQuestion.expectedAnswer}</div>
              )}
            </div>

            {!revealed ? (
              <button
                type="button"
                className="primary-button full"
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
                background: "var(--bg-active)",
                display: "grid",
                placeItems: "center",
                color: "var(--text-primary)",
                margin: "0 auto 10px",
              }}
            >
              <CheckCircle2 size={18} />
            </div>
            <h2 style={{ fontSize: 14, margin: "0 0 4px", color: "var(--text-primary)" }}>
              You&apos;re caught up.
            </h2>
            <p style={{ fontSize: 11, color: "var(--text-secondary)", margin: "0 0 12px" }}>
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
      a.download = `productivehix-export-${new Date().toISOString().slice(0, 10)}.json`;
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
              {status?.authenticated ? "Connected to local operating system" : "Unpaired device"}
            </span>
          </div>
          {status?.authenticated ? (
            <span className="connection-label good">Paired</span>
          ) : (
            <button className="text-button" onClick={() => authMutation.mutate()} type="button">
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
              <button type="button" className="text-button" onClick={() => setConfirmPause(false)}>
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
                    status.desktop.activityWatchRunning ? "AW Running" : "AW Inactive"
                  })`
                : "Not connected"}
            </span>
          </div>
          <span className={`connection-label ${status?.desktop?.connected ? "good" : "muted"}`}>
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
            <span>Check-in, quiet hours, focus blocks, appearance</span>
          </div>
          <ExternalLink size={12} color="var(--text-muted)" />
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
          <ExternalLink size={12} color="var(--text-muted)" />
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
            {exporting ? "Exporting..." : exportSuccess ? "Downloaded!" : "Export"}
          </button>
        </div>
      </section>

      <button type="button" className="secondary-button full" onClick={() => openDashboard("/")}>
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
  const [reflectionOverlay, setReflectionOverlay] = useState<"hourly" | "inactivity" | null>(null);

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

  // Synchronize and apply active theme (light / dark / system)
  useEffect(() => {
    try {
      if (typeof chrome !== "undefined" && chrome.storage?.local) {
        chrome.storage.local.get(["theme"], (result) => {
          if (result && result.theme) {
            document.documentElement.setAttribute("data-theme", result.theme);
          }
        });

        const handleThemeChange = (
          changes: { [key: string]: chrome.storage.StorageChange },
          area: string,
        ) => {
          if (area === "local" && changes.theme?.newValue) {
            document.documentElement.setAttribute("data-theme", changes.theme.newValue);
          }
        };

        chrome.storage.onChanged.addListener(handleThemeChange);
        return () => {
          chrome.storage.onChanged.removeListener(handleThemeChange);
        };
      }
    } catch {}
  }, []);

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

  const sessions = useQuery({
    queryKey: ["sessions"],
    queryFn: apiClient.getSessions.bind(apiClient),
  });

  const liveSession = (sessions.data ?? []).find((s) => !s.endedAt);
  const activeTask = liveSession?.taskId
    ? tasks.data?.find((t) => t.id === liveSession.taskId) ?? null
    : tasks.data?.find((t) => t.status === "in_progress") ?? null;

  useEffect(() => {
    const applyRouting = (targetTab?: string, targetMode?: string) => {
      if (targetMode === "inactivity" || targetTab === "inactivity") {
        setReflectionOverlay("inactivity");
      } else if (targetMode === "hourly" || targetTab === "reflect" || targetTab === "checkin") {
        setReflectionOverlay("hourly");
      } else if (
        targetTab === "focus" ||
        targetTab === "review" ||
        targetTab === "more" ||
        targetTab === "today"
      ) {
        setTab(targetTab as Tab);
        setReflectionOverlay(null);
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
      if (msg?.type === "session:updated") {
        void queryClient.invalidateQueries({ queryKey: ["sessions"] });
        void queryClient.invalidateQueries({ queryKey: ["tasks"] });
      }
    };

    const handleStorageChange = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      const newTab = changes.openToTab?.newValue;
      const newMode = changes.reflectMode?.newValue;
      if (newTab || newMode) {
        applyRouting(newTab, newMode);
      }
    };

    // Refresh sessions and tasks when popup is opened
    void queryClient.invalidateQueries({ queryKey: ["sessions"] });
    void queryClient.invalidateQueries({ queryKey: ["tasks"] });

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

  // If a reflection event is active, render full-screen CheckInView or InactivityView
  if (reflectionOverlay === "inactivity") {
    return (
      <div className="app-shell">
        <Header
          isStandalone={isStandalone}
          onClose={() => {
            setReflectionOverlay(null);
            notifyCloseModal();
          }}
        />
        <InactivityView
          isStandalone={isStandalone}
          onComplete={() => {
            void queryClient.invalidateQueries({ queryKey: ["extension-status"] });
            void queryClient.invalidateQueries({ queryKey: ["activity-summary"] });
            setReflectionOverlay(null);
            if (isStandalone) notifyCloseModal();
          }}
          onCancel={() => {
            setReflectionOverlay(null);
            if (isStandalone) notifyCloseModal();
          }}
        />
      </div>
    );
  }

  if (reflectionOverlay === "hourly") {
    return (
      <div className="app-shell">
        <Header
          isStandalone={isStandalone}
          onClose={() => {
            setReflectionOverlay(null);
            notifyCloseModal();
          }}
        />
        <CheckInView
          currentTask={activeTask}
          patterns={patterns.data ?? []}
          isStandalone={isStandalone}
          onComplete={() => {
            void queryClient.invalidateQueries({ queryKey: ["extension-status"] });
            void queryClient.invalidateQueries({ queryKey: ["activity-summary"] });
            setReflectionOverlay(null);
            if (isStandalone) notifyCloseModal();
          }}
          onCancel={() => {
            setReflectionOverlay(null);
            if (isStandalone) notifyCloseModal();
          }}
          onSwitchToInactivity={() => setReflectionOverlay("inactivity")}
        />
      </div>
    );
  }

  return (
    <div className="app-shell">
      <Header isStandalone={isStandalone} onClose={notifyCloseModal} />

      <TopNav tab={tab} setTab={handleTabChange} />

      {/* VIEW RENDERER: 4 Persistent Navigation Tabs */}
      {tab === "today" ? (
        <TodayView
          status={status.data}
          setTab={setTab}
          onStartReflect={() => {
            setReflectionOverlay("hourly");
          }}
        />
      ) : tab === "focus" ? (
        <FocusView
          status={status.data}
          onStartReflect={() => {
            setReflectionOverlay("hourly");
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
