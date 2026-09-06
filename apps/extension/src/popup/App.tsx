import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  Brain,
  ExternalLink,
  MoreHorizontal,
  Pause,
  Play,
  RefreshCw,
  ShieldCheck,
  Sun,
  Timer,
  Monitor,
  Square,
  CheckCircle2,
  Sparkles,
  Sliders,
  ArrowLeft,
  Download,
  Terminal,
  HelpCircle,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  apiClient,
  getExtensionStatus,
  setTrackingPaused,
  triggerSync,
  triggerAuth,
  type ExtensionStatus,
} from "../api/client";
import type { Task } from "@repo/types";
import { CheckInView } from "./CheckInView";
import { SettingsView } from "./SettingsView";
import { DiagnosticsView } from "./DiagnosticsView";
import { InactivityView } from "./InactivityView";

type Tab = "today" | "focus" | "review" | "inactivity" | "more";
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
}: {
  status?: ExtensionStatus;
  onPillClick?: () => void;
}) {
  const active = status ? !status.trackingPaused : true;
  return (
    <header className="header">
      <div className="brand-mark">
        <Activity size={15} strokeWidth={2.6} />
      </div>
      <div>
        <div className="brand">ProductiveHix</div>
        <div className="eyebrow">PERSONAL OPERATING SYSTEM</div>
      </div>
      <button
        type="button"
        className={`tracking-pill ${active ? "is-active" : "is-paused"}`}
        onClick={onPillClick}
        title="Tracking status (Click to view controls)"
      >
        <span className="status-dot" />
        {active ? "Tracking" : "Paused"}
      </button>
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
        >
          <Icon size={13} />
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
// TODAY VIEW
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
  const summary = useQuery({ queryKey: ["activity-summary"], queryFn: apiClient.getTodaySummary.bind(apiClient) });
  const tasks = useQuery({ queryKey: ["tasks"], queryFn: apiClient.getTasks.bind(apiClient) });
  const activeTask =
    tasks.data?.find((task) => task.status === "in_progress") ?? tasks.data?.find((task) => task.status === "todo");

  const current = status?.currentActivity;
  const activeSeconds = summary.data?.activeTime ?? 0;
  const sessionsCount = summary.data?.sessions ?? 0;
  const isEligibleForCheckIn = status?.scheduler?.eligibility?.eligible ?? false;

  return (
    <main className="content">
      {/* Current Activity */}
      <section className="hero-card">
        <div className="section-kicker">
          <span className="live-dot" />CURRENT ACTIVITY <span className="source-label">Browser</span>
        </div>
        {current ? (
          <div className="activity-line">
            <div className="site-icon">{current.domain.slice(0, 1).toUpperCase()}</div>
            <div className="activity-copy">
              <strong>{current.domain}</strong>
              <span>{current.pageTitle}</span>
            </div>
            <span className="activity-time">{formatDuration(current.durationMs / 1000)}</span>
          </div>
        ) : (
          <div className="empty-activity">
            <ShieldCheck size={16} />
            <span>{status?.trackingPaused ? "Tracking is paused" : "Waiting for browser activity"}</span>
          </div>
        )}
      </section>

      {/* Metrics Row */}
      <div className="metric-grid">
        {summary.isLoading ? (
          [1, 2, 3].map((i) => (
            <div className="metric-card" key={i}>
              <Skeleton className="metric-value" />
              <Skeleton className="metric-label" />
            </div>
          ))
        ) : (
          <>
            <Metric label="Active" value={formatDuration(activeSeconds / 1000)} icon={<Activity size={13} />} />
            <Metric label="Sessions" value={String(sessionsCount)} icon={<Timer size={13} />} />
            <Metric
              label="Agent"
              value={status?.desktop?.connected ? "Ready" : "Offline"}
              icon={<Monitor size={13} />}
            />
          </>
        )}
      </div>

      {/* Contextual Reflection Prompt if Eligible or Desired */}
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
            <strong style={{ fontSize: 11, color: "#faf7ff", display: "block" }}>Hourly check-in ready</strong>
            <span style={{ fontSize: 10, color: "#c6b5ef" }}>Take 45 seconds to reflect on this block</span>
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

      {/* Current Planned Task & Action */}
      <section className="task-card">
        <div className="section-kicker">NEXT INTENTIONAL WORK</div>
        {tasks.isLoading ? (
          <>
            <Skeleton className="task-title" />
            <Skeleton className="task-meta" />
          </>
        ) : activeTask ? (
          <>
            <h2>{activeTask.title}</h2>
            <p>{activeTask.status === "in_progress" ? "In progress • Session ready" : "Ready to execute"}</p>
            <button className="primary-button full" onClick={() => setTab("focus")}>
              <Play size={13} fill="currentColor" />
              Continue task in Focus
            </button>
          </>
        ) : (
          <>
            <h2>Plan your next win</h2>
            <p>Create or select a task from your dashboard.</p>
            <button className="secondary-button full" onClick={() => openDashboard("/tasks")}>
              View tasks <ExternalLink size={12} />
            </button>
          </>
        )}
      </section>
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
  const tasks = useQuery({ queryKey: ["tasks"], queryFn: apiClient.getTasks.bind(apiClient) });
  const sessions = useQuery({ queryKey: ["sessions"], queryFn: apiClient.getSessions.bind(apiClient) });
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
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["sessions"] }),
  });

  const finish = useMutation({
    mutationFn: async ({ markDone, openCheckIn }: { markDone: boolean; openCheckIn?: boolean }) => {
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

  const elapsedSec = activeSession ? Math.floor((now - Date.parse(activeSession.startedAt)) / 1000) : 0;
  const targetDurationSec = preset === "custom" ? customMins * 60 : preset * 60;
  const remainingSec = Math.max(0, targetDurationSec - elapsedSec);

  // Post-focus completion reflection dialog
  if (showReflection && activeSession) {
    return (
      <main className="content" style={{ gap: 10 }}>
        <div className="section-heading compact">
          <div>
            <span className="section-kicker">FOCUS COMPLETE</span>
            <h1>What happened?</h1>
          </div>
        </div>

        <section className="focus-card">
          <p style={{ margin: "0 0 6px", fontSize: 11.5, color: "#948ca2" }}>
            Reflect on this focus session for <strong style={{ color: "#f7f3fc" }}>{task?.title ?? "your task"}</strong>:
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
              onClick={() => finish.mutate({ markDone: false, openCheckIn: true })}
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
          <span className="section-kicker">{activeSession ? "FOCUSING" : "FOCUS BLOCK"}</span>
          <h1>{activeSession ? "Deliberate execution." : "One thing at a time."}</h1>
        </div>
      </div>

      <section className="focus-card">
        {/* Timer Display Box */}
        <div className="focus-timer-box">
          <div>
            <span>{activeSession ? "Time remaining" : "Duration"}</span>
            <strong>{formatClock(activeSession ? remainingSec : targetDurationSec)}</strong>
          </div>
          <Timer size={26} color="#a78bfa" />
        </div>

        {/* Task Label */}
        <div className="focus-details">
          <span className="section-kicker">CURRENT TASK</span>
          <h2>{task?.title ?? "An intentional work block"}</h2>
          <p>{activeSession ? "Work session is active and being recorded." : "Choose your focus block below."}</p>
        </div>

        {/* Presets (Only 25m, 50m, Custom) */}
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
                    background: preset === mins ? "rgba(139,92,246,0.3)" : undefined,
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
                  background: preset === "custom" ? "rgba(139,92,246,0.3)" : undefined,
                  borderColor: preset === "custom" ? "#a78bfa" : undefined,
                  color: preset === "custom" ? "#faf7ff" : undefined,
                }}
              >
                Custom
              </button>
            </div>

            {preset === "custom" && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8 }}>
                <span style={{ fontSize: 10.5, color: "#90869e" }}>Duration:</span>
                <input
                  type="number"
                  min={5}
                  max={180}
                  value={customMins}
                  onChange={(e) => setCustomMins(Math.max(5, Math.min(180, Number(e.target.value) || 25)))}
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
                <span style={{ fontSize: 10, color: "#90869e" }}>min (5–180)</span>
              </div>
            )}
          </div>
        )}

        {/* Action Button */}
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
            {status?.trackingPaused ? "Resume tracking first" : `Start ${preset === "custom" ? customMins : preset}m Focus`}
          </button>
        )}
      </section>
    </main>
  );
}

// -------------------------------------------------------------
// REVIEW VIEW (In-extension quick recall flashcard & hourly reflection)
// -------------------------------------------------------------
function ReviewView({
  showCheckInWizard = false,
  onStartCheckInWizard,
  onCloseCheckInWizard,
  activeTask,
  patterns,
  onCheckInComplete,
}: {
  showCheckInWizard?: boolean;
  onStartCheckInWizard?: () => void;
  onCloseCheckInWizard?: () => void;
  activeTask?: Task;
  patterns?: any[];
  onCheckInComplete?: () => void;
}) {
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
  const activeQuestion = activeAssessment?.questions?.find((q) => q.score === null) ?? activeAssessment?.questions?.[0];

  const [revealed, setRevealed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleAnswer = async (score: number) => {
    if (!activeQuestion) return;
    setSubmitting(true);
    try {
      await apiClient.submitLearningAnswer(activeQuestion.id, activeQuestion.expectedAnswer ?? "Recall review", score);
      void queryClient.invalidateQueries({ queryKey: ["assessments"] });
      setRevealed(false);
    } catch (e) {
      console.error("Failed to submit review answer:", e);
    } finally {
      setSubmitting(false);
    }
  };

  // If check-in wizard is active: render it directly inside the Review tab surface
  if (showCheckInWizard) {
    return (
      <CheckInView
        currentTask={activeTask}
        patterns={patterns ?? []}
        onComplete={() => onCheckInComplete?.()}
        onCancel={() => onCloseCheckInWizard?.()}
      />
    );
  }

  return (
    <main className="content" style={{ gap: 10 }}>
      {/* Hourly reflection trigger card */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "9px 12px",
          background: "linear-gradient(135deg, rgba(139,92,246,0.16) 0%, rgba(109,40,217,0.08) 100%)",
          border: "1px solid rgba(167,139,250,0.28)",
          borderRadius: 10,
        }}
      >
        <div style={{ display: "grid", gap: 2 }}>
          <span className="section-kicker" style={{ color: "#a78bfa" }}>HOURLY REFLECTION</span>
          <strong style={{ fontSize: 11, color: "#f8f6ff" }}>How was your last work block?</strong>
          <span style={{ fontSize: 9.5, color: "#b3a8c6" }}>Quick 30s check-in on focus and blockers</span>
        </div>
        {onStartCheckInWizard && (
          <button
            type="button"
            className="primary-button"
            onClick={onStartCheckInWizard}
            style={{ margin: 0, padding: "5px 10px", fontSize: 10.5, height: "auto", flexShrink: 0 }}
          >
            Reflect Now
          </button>
        )}
      </div>

      <div className="section-heading compact">
        <div>
          <span className="section-kicker">LEARNING RECALL</span>
          <h1>Recall, then move on.</h1>
        </div>
        <button className="text-button" onClick={() => openDashboard("/learning")}>
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
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span className="section-kicker" style={{ color: "#a78bfa" }}>
                {due.length} {due.length === 1 ? "REVIEW DUE" : "REVIEWS DUE"}
              </span>
              <span style={{ fontSize: 10, color: "#8a8298" }}>{activeAssessment.topic}</span>
            </div>

            <div className="flashcard-box">
              <span style={{ fontSize: 9.5, color: "#a78bfa", textTransform: "uppercase", letterSpacing: ".06em" }}>
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
            <div style={{ width: 36, height: 36, borderRadius: "50%", background: "rgba(52,211,153,0.12)", display: "grid", placeItems: "center", color: "#34d399", margin: "0 auto 10px" }}>
              <CheckCircle2 size={18} />
            </div>
            <h2 style={{ fontSize: 14, margin: "0 0 4px", color: "#f7f3fc" }}>You’re caught up.</h2>
            <p style={{ fontSize: 11, color: "#948ca2", margin: "0 0 12px" }}>No reviews are due right now.</p>
            <button className="secondary-button" onClick={() => openDashboard("/learning")}>
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
  const toggle = useMutation({ mutationFn: async () => setTrackingPaused(!paused), onSuccess: refresh });
  const authMutation = useMutation({ mutationFn: async () => triggerAuth(), onSuccess: refresh });

  const handleExportData = async () => {
    setExporting(true);
    setExportSuccess(false);
    try {
      const data = await apiClient.exportData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
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
          <h1>Quietly in the background.</h1>
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
            <span>{status?.authenticated ? "Connected to local operating system" : "Unpaired device"}</span>
          </div>
          {status?.authenticated ? (
            <span className="connection-label good">Paired</span>
          ) : (
            <button className="text-button" onClick={() => authMutation.mutate()}>
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
            <strong>Desktop agent</strong>
            <span>
              {status?.desktop?.connected
                ? `Connected (${status.desktop.activityWatchRunning ? "AW Running" : "AW Inactive"})`
                : "Not connected"}
            </span>
          </div>
          <span className={`connection-label ${status?.desktop?.connected ? "good" : "muted"}`}>
            {status?.desktop?.connected ? "Ready" : "Set up"}
          </span>
        </div>
      </section>

      {/* Navigation Links: Settings, Diagnostics, Export, Dashboard */}
      <section className="settings-card">
        <button
          type="button"
          className="setting-row"
          style={{ width: "100%", background: "transparent", border: 0, textAlign: "left", cursor: "pointer" }}
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
          style={{ width: "100%", background: "transparent", border: 0, textAlign: "left", cursor: "pointer" }}
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
            {exporting ? "Exporting..." : exportSuccess ? "Downloaded!" : "Export"}
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
  const [showCheckInWizard, setShowCheckInWizard] = useState(false);
  const [moreSubView, setMoreSubView] = useState<MoreSubView>("menu");

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

  // Read destination on open (from notification button click via chrome.storage or query param)
  useEffect(() => {
    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      chrome.storage.local.get(["openToTab"], (result) => {
        if (result.openToTab === "reflect") {
          setTab("review");
          setShowCheckInWizard(true);
          void chrome.storage.local.remove("openToTab");
        } else if (result.openToTab) {
          setTab(result.openToTab as Tab);
          void chrome.storage.local.remove("openToTab");
        }
      });
    }

    try {
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get("tab");
      const viewParam = params.get("view");
      if (tabParam === "reflect" || viewParam === "checkin" || viewParam === "reflect") {
        setTab("review");
        setShowCheckInWizard(true);
      } else if (tabParam === "focus" || tabParam === "review" || tabParam === "more" || tabParam === "inactivity") {
        setTab(tabParam as Tab);
      } else if (viewParam === "diagnostics") {
        setTab("more");
        setMoreSubView("diagnostics");
      }
    } catch {}
  }, []);

  const handleTabChange = (newTab: Tab) => {
    setTab(newTab);
    if (newTab !== "review") {
      setShowCheckInWizard(false);
    }
    setMoreSubView("menu");
  };

  return (
    <div className="app-shell">
      <Header
        status={status.data}
        onPillClick={() => {
          setTab("more");
          setShowCheckInWizard(false);
        }}
      />

      <TopNav tab={tab} setTab={handleTabChange} />

      {/* VIEW RENDERER */}
      {tab === "today" ? (
        <TodayView
          status={status.data}
          setTab={setTab}
          onStartReflect={() => {
            setTab("review");
            setShowCheckInWizard(true);
          }}
        />
      ) : tab === "focus" ? (
        <FocusView
          status={status.data}
          onStartReflect={() => {
            setTab("review");
            setShowCheckInWizard(true);
          }}
        />
      ) : tab === "review" ? (
        <ReviewView
          showCheckInWizard={showCheckInWizard}
          onStartCheckInWizard={() => setShowCheckInWizard(true)}
          onCloseCheckInWizard={() => setShowCheckInWizard(false)}
          activeTask={activeTask}
          patterns={patterns.data ?? []}
          onCheckInComplete={() => {
            setShowCheckInWizard(false);
            void queryClient.invalidateQueries({ queryKey: ["extension-status"] });
            void queryClient.invalidateQueries({ queryKey: ["activity-summary"] });
          }}
        />
      ) : tab === "inactivity" ? (
        <InactivityView
          onComplete={() => {
            setTab("today");
            void queryClient.invalidateQueries({ queryKey: ["extension-status"] });
            void queryClient.invalidateQueries({ queryKey: ["activity-summary"] });
          }}
        />
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
