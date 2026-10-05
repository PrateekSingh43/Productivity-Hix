"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { PageContainer, PageHeader, Section, SectionHeader } from "@shared/components/layout";
import { EmptyState } from "@shared/components/primitives";
import { CurrentFocusCard } from "./current-focus-card";
import {
  CheckCircle2,
  Play,
  ArrowRight,
  Filter,
  Search,
  Calendar,
  Clock,
  Target,
  ChevronDown,
  RotateCcw,
} from "lucide-react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { taskQueries, updateTask, FocusReflectionModal, TaskDetailDrawer } from "@features/tasks";
import { useUserPreferences } from "@features/settings";
import { sessionQueries, useSessionsList, useActiveSession, useSessionsObserved } from "../api/queries";
import { createSession, finishSession, pauseSession, resumeSession } from "../api/client";
import { useLiveTelemetry } from "@features/timeline";
import { planQueries } from "@features/today";
import type {
  WorkSession,
  SessionRangePreset,
  SessionListFilters,
  SessionLinkedFilter,
  SessionHistoryView,
} from "../types";
import type { Task } from "@repo/types";
import { format } from "date-fns";
import { resolveSessionFilters, sessionFiltersDifferFromDefaults } from "../lib/session-filters";
import { lastProductiveDays, resolveSessionDateRange } from "../lib/date-range";
import { resolveFocusPayload, type FocusTarget } from "../lib/focus-target";
import {
  formatSessionDuration,
  formatSessionDurationExact,
  formatTargetVariance,
} from "../lib/duration";
import { groupSessionsByDay, groupSessionsByTask, sessionDayKey } from "../lib/session-groups";

const RANGE_OPTIONS: { id: SessionRangePreset; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "7d", label: "7 days" },
  { id: "30d", label: "30 days" },
  { id: "90d", label: "90 days" },
  { id: "custom", label: "Custom" },
  { id: "all", label: "All time" },
];

const VIEW_OPTIONS: { id: SessionHistoryView; label: string }[] = [
  { id: "timeline", label: "Timeline" },
  { id: "by-task", label: "By Task" },
];

const LINKED_OPTIONS: { id: SessionLinkedFilter; label: string }[] = [
  { id: "all", label: "All sessions" },
  { id: "linked", label: "Task-linked" },
  { id: "independent", label: "Independent" },
];

interface SessionRowProps {
  sess: WorkSession;
  tasks: Task[];
  /** Productive day key for the timeline deep-link. */
  timelineDate: string;
  onInspectTask: (task: Task) => void;
  /** Compact rows inside a task group: date-led instead of title-led. */
  compact?: boolean;
  /** Day prefix for compact rows ("Sep 29"). */
  datePrefix?: string | null;
  showTimelineLink?: boolean;
  /** Batched observation summary for this session (apps + seconds only). */
  observation?: { apps: string[]; observedSeconds: number } | null;
  /** False while the observation batch is still loading (renders nothing, not a claim). */
  observationLoaded?: boolean;
}

/**
 * One execution block: what happened during it. Title/context on the left,
 * Target · Actual · Variance on the right, evidence chips beneath.
 * The Task Details drawer (not this row) owns deep inspection.
 */
function SessionRow({
  sess,
  tasks,
  timelineDate,
  onInspectTask,
  compact = false,
  datePrefix = null,
  showTimelineLink = false,
  observation = null,
  observationLoaded = false,
}: SessionRowProps) {
  const linkedTask = tasks.find((t) => t.id === sess.taskId) ?? null;
  const isLive = !sess.endedAt;
  const actualLabel = formatSessionDuration(sess.durationSeconds);
  const actualTitle = formatSessionDurationExact(sess.durationSeconds);
  const title =
    sess.taskTitle ?? linkedTask?.title ?? sess.notes ?? "Intentional Focus Session";
  const goalTitle = sess.goalTitle ?? linkedTask?.goalTitle ?? null;
  // Session target ONLY — a null target renders honestly as unset.
  const targetMins = sess.targetDurationMinutes ?? null;
  const variance =
    targetMins != null && !isLive
      ? formatTargetVariance(sess.durationSeconds ?? 0, targetMins)
      : null;

  const timeRange = (() => {
    let startDate = new Date(sess.startedAt);
    if (sess.endedAt && sess.durationSeconds) {
      const endDate = new Date(sess.endedAt);
      const wallClockSec = Math.round((endDate.getTime() - startDate.getTime()) / 1000);
      if (wallClockSec < sess.durationSeconds) {
        startDate = new Date(endDate.getTime() - sess.durationSeconds * 1000);
      }
    }
    const start = format(startDate, "h:mm a");
    return sess.endedAt ? `${start} – ${format(new Date(sess.endedAt), "h:mm a")}` : `${start} · Running now`;
  })();

  return (
    <div className="px-4 sm:px-5 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 hover:bg-bg-secondary/40 transition-colors">
      <div className="flex items-start sm:items-center gap-3 min-w-0">
        <div
          className={`h-7 w-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 sm:mt-0 ${
            isLive
              ? "bg-bg-secondary text-text-primary border border-border-strong"
              : "bg-bg-secondary text-text-muted border border-border-subtle"
          }`}
        >
          {isLive ? (
            <Play size={11} className="fill-current animate-pulse" />
          ) : (
            <CheckCircle2 size={13} />
          )}
        </div>

        <div className="min-w-0 space-y-0.5">
          <div className="flex items-center gap-2 flex-wrap">
            {compact && datePrefix ? (
              <span className="text-xs font-mono text-text-muted shrink-0">
                {datePrefix}
              </span>
            ) : (
              <span className="text-sm font-medium text-text-primary truncate">
                {title}
              </span>
            )}
            {isLive && (
              <span className="text-[10px] font-mono uppercase tracking-wider text-text-primary bg-bg-secondary border border-border-strong px-1.5 py-0.2 rounded">
                Live
              </span>
            )}
            {!sess.taskId && !isLive && (
              <span className="text-[10px] font-mono uppercase tracking-wider text-text-muted bg-bg-secondary border border-border-subtle px-1.5 py-0.2 rounded">
                Independent
              </span>
            )}
            {goalTitle && !compact && (
              <span className="inline-flex items-center gap-1 text-[10px] text-text-muted bg-bg-secondary px-1.5 py-0.5 rounded border border-border-subtle truncate">
                <Target size={10} className="shrink-0" />
                <span>{goalTitle}</span>
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-text-muted font-mono flex-wrap">
            <span>{timeRange}</span>
            {sess.notes && sess.notes !== title && (
              <>
                <span>·</span>
                <span className="italic text-text-muted truncate max-w-xs font-sans">
                  &ldquo;{sess.notes}&rdquo;
                </span>
              </>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap pt-0.5">
            {observationLoaded && !isLive && (
              observation && (observation.apps.length > 0 || observation.observedSeconds > 0) ? (
                <span
                  className="text-[10px] text-text-secondary bg-bg-secondary px-1.5 py-0.5 rounded border border-border-subtle truncate max-w-55"
                  title={`${observation.observedSeconds}s of telemetry during this session`}
                >
                  Observed{" "}
                  {observation.apps.length > 0
                    ? observation.apps.join(" · ")
                    : `${formatSessionDuration(observation.observedSeconds)} telemetry`}
                </span>
              ) : (
                <span className="text-[10px] text-text-muted">Observation unavailable</span>
              )
            )}
            {sess.hasReflection ? (
              <span className="text-[10px] text-text-secondary bg-bg-secondary px-1.5 py-0.5 rounded border border-border-subtle">
                Reflection recorded
              </span>
            ) : (
              !isLive && (
                <span className="text-[10px] text-text-muted">Not reflected</span>
              )
            )}
            {linkedTask && (
              <button
                type="button"
                onClick={() => onInspectTask(linkedTask)}
                className="inline-flex items-center gap-0.5 text-[11px] text-text-muted hover:text-text-primary transition-colors cursor-pointer"
                title={`Open ${linkedTask.title} in task details`}
              >
                <span>Inspect task</span>
                <ArrowRight size={11} />
              </button>
            )}
            {showTimelineLink && (
              <Link
                href={`/timeline?date=${timelineDate}`}
                className="inline-flex items-center gap-0.5 text-[11px] text-text-muted hover:text-text-primary transition-colors cursor-pointer"
              >
                <span>Timeline</span>
                <ArrowRight size={11} />
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Target · Actual · Variance for this execution block only */}
      <div className="flex items-center gap-2 shrink-0 font-mono text-xs text-text-muted sm:self-auto self-end">
        {isLive ? (
          <>
            <span className="text-text-primary font-semibold font-sans">Running</span>
            {targetMins != null && <span>· Target {targetMins}m</span>}
          </>
        ) : targetMins != null ? (
          <>
            <span>Target {targetMins}m ·</span>
            <span className="text-text-primary font-medium" title={actualTitle}>
              Actual {actualLabel}
            </span>
            {variance && variance !== "on target" && (
              <span
                className="inline-flex items-center gap-0.5 px-1 py-0.2 rounded text-[10px] bg-bg-secondary text-text-muted border border-border-subtle"
                title="Actual minus target for this session only"
              >
                <span>{variance}</span>
              </span>
            )}
          </>
        ) : (
          <>
            <span>Target not set ·</span>
            <span className="text-text-primary font-medium" title={actualTitle}>
              Actual {actualLabel}
            </span>
          </>
        )}
      </div>
    </div>
  );
}

export function SessionsView() {
  const queryClient = useQueryClient();
  const telemetry = useLiveTelemetry();

  // 1. History controls: DATE RANGE = what dataset; VIEW = how organized;
  // FILTERS = what subset; SEARCH = textual narrowing. Each layer is
  // visually and semantically separate (see the History section below).
  const [rangePreset, setRangePreset] = useState<SessionRangePreset>("30d");
  const [historyView, setHistoryView] = useState<SessionHistoryView>("by-task");
  const [selectedTaskId, setSelectedTaskId] = useState<string>("all");
  const [linkedFilter, setLinkedFilter] = useState<SessionLinkedFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [customDraft, setCustomDraft] = useState({ from: "", to: "" });
  const [customApplied, setCustomApplied] = useState<{ from: string; to: string } | null>(null);
  const [customError, setCustomError] = useState<string | null>(null);
  const [visibleDaysCount, setVisibleDaysCount] = useState(15);
  const [visibleGroupsCount, setVisibleGroupsCount] = useState(20);
  // Task groups default collapsed so long histories stay scannable.
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string> | null>(null);
  const [drawerTask, setDrawerTask] = useState<Task | null>(null);

  // Canonical timezone + day boundary for ranges and grouping. While
  // preferences load, helpers fall back to browser timezone / midnight.
  const { data: preferences } = useUserPreferences();
  const groupingTimezone = preferences?.timezone ?? undefined;
  const groupingBoundary = preferences?.dayBoundary ?? undefined;

  // A Custom preset with nothing applied yet shows the default window until
  // the user picks dates and presses Apply — never a throwing query.
  const effectivePreset: SessionRangePreset =
    rangePreset === "custom" && !customApplied ? "30d" : rangePreset;

  const activeFilters = useMemo<SessionListFilters>(
    () =>
      resolveSessionFilters({
        rangePreset: effectivePreset,
        selectedTaskId,
        linkedFilter,
        searchQuery,
        customFrom: customApplied?.from ?? "",
        customTo: customApplied?.to ?? "",
        timezone: groupingTimezone,
        boundary: groupingBoundary,
      }),
    [
      effectivePreset,
      selectedTaskId,
      linkedFilter,
      searchQuery,
      customApplied,
      groupingTimezone,
      groupingBoundary,
    ]
  );

  // 2. Data fetching
  const { data: tasks = [] } = useQuery(taskQueries.list());
  const { data: serverActiveSession, isLoading: isLoadingActive } = useActiveSession();
  const { data: sessions = [], isLoading: isLoadingSessions } = useSessionsList(activeFilters);

  // 3. Local operational session state.
  // The focus target is the ONLY source of linking intent: an explicit
  // {kind:"task"} choice or an explicit independent topic. It stores an id,
  // never a full Task object, so a stale object can never corrupt attribution.
  const [focusTarget, setFocusTarget] = useState<FocusTarget | null>(null);
  const [sessionActive, setSessionActive] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [reflectionSession, setReflectionSession] = useState<{
    id: string;
    taskId?: string | null;
    taskTitle?: string | null;
    durationSeconds?: number | null;
  } | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [sessionPending, setSessionPending] = useState(false);

  // Authoritative live session resolution (prefer active endpoint, fallback to list)
  const currentActive = useMemo(() => {
    if (serverActiveSession && !serverActiveSession.endedAt) return serverActiveSession;
    return sessions.find((s) => !s.endedAt) ?? null;
  }, [serverActiveSession, sessions]);

  // Authoritative task object for a task focus target, resolved fresh from
  // query data on every render — never a retained stale object.
  const focusTask =
    focusTarget?.kind === "task"
      ? (tasks.find((t) => t.id === focusTarget.taskId) ?? null)
      : null;

  // Sync active session state. Display only — this effect never writes
  // linking intent. Attribution always comes from the authoritative session
  // record (currentActive / server responses), never from local selection.
  useEffect(() => {
    if (currentActive) {
      setActiveSessionId(currentActive.id);
      setSessionActive(!currentActive.isPaused);
      const startMs = Date.parse(currentActive.lastResumedAt ?? currentActive.startedAt);
      const accumulated = currentActive.durationSeconds ?? 0;
      setElapsedSeconds(
        currentActive.isPaused || !Number.isFinite(startMs)
          ? accumulated
          : accumulated + Math.max(0, Math.floor((Date.now() - startMs) / 1000))
      );
    } else if (activeSessionId && !currentActive) {
      setSessionActive(false);
      setActiveSessionId(null);
      setElapsedSeconds(0);
    }
  }, [currentActive, activeSessionId]);

  // Count-up timer tick
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (sessionActive) {
      interval = setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [sessionActive]);

  // Session Handlers. Linking comes ONLY from the explicit FocusTarget
  // passed by the caller — never from ambient local selection state.
  const handleStartFocus = async (target: FocusTarget, durationMinutes?: number | null) => {
    if (activeSessionId || sessionPending) return;
    setSessionError(null);
    setSessionPending(true);

    const startInput = resolveFocusPayload(target, durationMinutes ?? null);
    const targetTaskId = startInput.taskId;

    try {
      const session = await createSession({
        taskId: targetTaskId,
        targetDurationMinutes: startInput.targetDurationMinutes,
        notes: startInput.notes,
      });
      setActiveSessionId(session.id);
      setSessionActive(true);
      setElapsedSeconds(0);

      if (targetTaskId) {
        await updateTask(targetTaskId, { status: "in_progress" });
        queryClient.invalidateQueries({ queryKey: taskQueries.lists() });
      }
      queryClient.invalidateQueries({ queryKey: sessionQueries.all() });
    } catch {
      // Another client (extension, other tab) may hold the active session:
      // refresh the authoritative active record so the UI converges instead
      // of letting the user start a duplicate.
      queryClient.invalidateQueries({ queryKey: sessionQueries.active().queryKey });
      setSessionError(
        "The session could not be started. Another focus session may already be active."
      );
    } finally {
      setSessionPending(false);
      queryClient.invalidateQueries({ queryKey: sessionQueries.all() });
    }
  };

  const handlePauseResume = async (pause: boolean) => {
    if (!activeSessionId || sessionPending) return;
    setSessionError(null);
    setSessionPending(true);
    try {
      const session = await (pause ? pauseSession(activeSessionId) : resumeSession(activeSessionId));
      // Patch every cached sessions list (keys carry filters) plus the
      // authoritative active record, then invalidate for convergence.
      await queryClient.cancelQueries({ queryKey: sessionQueries.all() });
      queryClient.setQueriesData<WorkSession[]>(
        { queryKey: sessionQueries.lists() },
        (current) =>
          current?.map((item) => (item.id === session.id ? session : item))
      );
      queryClient.setQueryData(sessionQueries.active().queryKey, session);
      setSessionActive(!session.isPaused);
      queryClient.invalidateQueries({ queryKey: sessionQueries.all() });
    } catch {
      setSessionError("The session could not be updated. Please try again.");
    } finally {
      setSessionPending(false);
    }
  };

  const handleCompleteFocus = async () => {
    if (!activeSessionId || sessionPending) return;
    setSessionError(null);
    setSessionPending(true);
    try {
      // The finished session returned by the API is authoritative for
      // reflection attribution: its id, taskId, taskTitle and duration are
      // what the reflection belongs to — never local selection state.
      const finished = await finishSession(activeSessionId, "Completed intentional focus block");
      setSessionActive(false);
      setActiveSessionId(null);
      setElapsedSeconds(0);
      setFocusTarget(null);
      setReflectionSession({
        id: finished.id,
        taskId: finished.taskId ?? null,
        taskTitle: finished.taskTitle ?? finished.notes ?? null,
        durationSeconds: finished.durationSeconds ?? 0,
      });
      queryClient.invalidateQueries({ queryKey: taskQueries.lists() });
      queryClient.invalidateQueries({ queryKey: sessionQueries.all() });
      queryClient.invalidateQueries({ queryKey: planQueries.all() });
      queryClient.invalidateQueries({ queryKey: ["activity"] });
    } catch {
      setSessionError("The session could not be completed. Please try again.");
    } finally {
      setSessionPending(false);
    }
  };

  // Metric summaries over the currently filtered sessions (all floored
  // through the shared session-duration formatter — see lib/duration.ts).
  const completedSessions = useMemo(() => {
    return sessions.filter((s) => Boolean(s.endedAt));
  }, [sessions]);

  const totalSeconds = useMemo(() => {
    return completedSessions.reduce((acc, s) => acc + (s.durationSeconds || 0), 0);
  }, [completedSessions]);

  const formattedTotalTime = useMemo(
    () => formatSessionDuration(totalSeconds),
    [totalSeconds]
  );

  const avgLabel = useMemo(() => {
    if (completedSessions.length === 0) return "—";
    return formatSessionDuration(Math.floor(totalSeconds / completedSessions.length));
  }, [completedSessions, totalSeconds]);

  const taskLinkedSessions = useMemo(() => {
    return completedSessions.filter((s) => Boolean(s.taskId)).length;
  }, [completedSessions]);

  const taskLinkedPercent = useMemo(() => {
    if (completedSessions.length === 0) return 0;
    return Math.round((taskLinkedSessions / completedSessions.length) * 100);
  }, [completedSessions, taskLinkedSessions]);

  // Grouping uses the same productive-day semantics as the date range so a
  // session can never land on a different day in groups than in the query.
  const groupingOptions = useMemo(
    () => ({ timezone: groupingTimezone, boundary: groupingBoundary }),
    [groupingTimezone, groupingBoundary]
  );

  const formatDayLabel = (dayKey: string): string => {
    const todayKey = format(new Date(), "yyyy-MM-dd");
    const yesterdayKey = format(new Date(Date.now() - 86400000), "yyyy-MM-dd");
    try {
      if (dayKey === todayKey) {
        return `Today · ${format(new Date(`${dayKey}T12:00:00`), "EEEE, MMM d")}`;
      } else if (dayKey === yesterdayKey) {
        return `Yesterday · ${format(new Date(`${dayKey}T12:00:00`), "EEEE, MMM d")}`;
      }
      return format(new Date(`${dayKey}T12:00:00`), "EEEE, MMMM d, yyyy");
    } catch {
      return dayKey;
    }
  };

  // VIEW A — Timeline: chronological truth, days newest-first.
  const timelineGroups = useMemo(() => {
    return groupSessionsByDay(sessions, groupingOptions).map((g) => ({
      ...g,
      label: formatDayLabel(g.dayKey),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessions, groupingTimezone, groupingBoundary]);

  // VIEW B — By Task: repeated work grouped, sessions individually preserved.
  const taskGroups = useMemo(() => {
    return groupSessionsByTask(sessions, tasks, groupingOptions);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessions, tasks, groupingTimezone, groupingBoundary]);

  const visibleTimelineGroups = useMemo(() => {
    return timelineGroups.slice(0, visibleDaysCount);
  }, [timelineGroups, visibleDaysCount]);

  const visibleTaskGroups = useMemo(() => {
    return taskGroups.slice(0, visibleGroupsCount);
  }, [taskGroups, visibleGroupsCount]);

  // 7-day focus rhythm: descriptive presence per productive day (dots for
  // days with at least one ended session). Never a consecutive-day streak:
  // a 5-minute block and a 3-hour day both mark presence, and a gap breaks
  // nothing. Scoped to Sessions only — Today/Home must not duplicate it.
  const rhythmRange = useMemo(
    () => resolveSessionDateRange("7d", { timezone: groupingTimezone, boundary: groupingBoundary }),
    [groupingTimezone, groupingBoundary]
  );
  const rhythmFilters = useMemo<SessionListFilters>(
    () => ({
      limit: 200,
      ...(rhythmRange.from ? { from: rhythmRange.from } : {}),
      ...(rhythmRange.to ? { to: rhythmRange.to } : {}),
    }),
    [rhythmRange]
  );
  const { data: rhythmSessions = [], isLoading: isLoadingRhythm } =
    useSessionsList(rhythmFilters);
  const rhythmDays = useMemo(
    () => lastProductiveDays(7, { timezone: groupingTimezone, boundary: groupingBoundary }),
    [groupingTimezone, groupingBoundary]
  );
  const rhythmStats = useMemo(() => {
    const ended = rhythmSessions.filter((s) => s.endedAt);
    const daySet = new Set(ended.map((s) => sessionDayKey(s.startedAt, groupingOptions)));
    return {
      daySet,
      focusDays: daySet.size,
      sessionCount: ended.length,
      totalSecs: ended.reduce((acc, s) => acc + Math.max(0, s.durationSeconds ?? 0), 0),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rhythmSessions, groupingTimezone, groupingBoundary]);

  // Batched observation summaries for currently visible ended sessions
  // (one request per visible set, 60s stale). Live sessions are excluded:
  // their telemetry window is still open.
  const visibleSessionIds = useMemo(() => {
    const list =
      historyView === "timeline"
        ? visibleTimelineGroups.flatMap((g) => g.sessions)
        : visibleTaskGroups.flatMap((g) => g.sessions);
    return [...new Set(list.filter((s) => s.endedAt).map((s) => s.id))].slice(0, 50);
  }, [historyView, visibleTimelineGroups, visibleTaskGroups]);
  const { data: observedMap } = useSessionsObserved(visibleSessionIds);
  const observationLoaded = observedMap != null;

  // Collapse defaults resolve once groups first load; user toggles win after.
  const isGroupCollapsed = (key: string): boolean => {
    if (collapsedGroups == null) return true;
    return collapsedGroups.has(key);
  };
  const toggleGroupCollapsed = (key: string) => {
    setCollapsedGroups((prev) => {
      const base = prev ?? new Set(taskGroups.map((g) => g.key));
      const next = new Set(base);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const hasActiveFilters = sessionFiltersDifferFromDefaults({
    rangePreset,
    selectedTaskId,
    linkedFilter,
    searchQuery,
    customFrom: customApplied?.from ?? "",
    customTo: customApplied?.to ?? "",
  });

  const resetFilters = () => {
    setRangePreset("30d");
    setSelectedTaskId("all");
    setLinkedFilter("all");
    setSearchQuery("");
    setCustomDraft({ from: "", to: "" });
    setCustomApplied(null);
    setCustomError(null);
    setVisibleDaysCount(15);
    setVisibleGroupsCount(20);
  };

  const applyCustomRange = () => {
    setCustomError(null);
    if (!customDraft.from || !customDraft.to) {
      setCustomError("Choose both From and To dates.");
      return;
    }
    if (customDraft.from > customDraft.to) {
      setCustomError("From must not be after To.");
      return;
    }
    setCustomApplied({ from: customDraft.from, to: customDraft.to });
    setVisibleDaysCount(15);
    setVisibleGroupsCount(20);
  };

  return (
    <PageContainer>
      <PageHeader
        title="Sessions"
        subtitle="Deliberate focus blocks, execution telemetry, and scalable history"
        breadcrumbs={[
          { label: "Home", href: "/" },
          { label: "Sessions" },
        ]}
      />

      {/* 1. VISUAL ANCHOR: CURRENT FOCUS CARD */}
      <Section>
        {sessionError && (
          <div
            role="alert"
            className="mb-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs text-red-600 dark:text-red-400"
          >
            {sessionError}
          </div>
        )}
        <CurrentFocusCard
          isActive={sessionActive}
          isPaused={Boolean(activeSessionId) && !sessionActive}
          isPending={sessionPending || isLoadingActive}
          activeSessionTitle={currentActive?.taskTitle ?? currentActive?.notes ?? null}
          activeSessionGoalTitle={currentActive?.goalTitle ?? null}
          activeSessionTargetMinutes={currentActive?.targetDurationMinutes ?? null}
          activeSessionTaskId={currentActive?.taskId ?? null}
          focusTarget={focusTarget}
          focusTask={focusTask}
          availableTasks={tasks}
          elapsedSeconds={elapsedSeconds}
          observedApplication={telemetry.activeApp || undefined}
          observedDomain={telemetry.activeDomain || undefined}
          observedTitle={telemetry.windowTitle || undefined}
          onTargetChange={(target) => setFocusTarget(target)}
          onStartFocus={handleStartFocus}
          onPause={() => void handlePauseResume(true)}
          onResume={() => void handlePauseResume(false)}
          onComplete={handleCompleteFocus}
        />
      </Section>

      {/* 3. METRIC SUMMARY RIBBON (Calculated over filtered horizon) */}
      <Section>
        {isLoadingSessions ? (
          <div className="rounded-xl border border-border-subtle bg-bg-card grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-border-subtle overflow-hidden animate-pulse">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="p-4 sm:p-5 space-y-2">
                <div className="h-3 w-20 bg-bg-secondary rounded" />
                <div className="h-7 w-14 bg-bg-secondary rounded" />
                <div className="h-2 w-28 bg-bg-secondary rounded" />
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-border-subtle bg-bg-card grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-border-subtle overflow-hidden">
            <div className="p-4 sm:p-5">
              <span className="text-xs text-text-muted block mb-1">Total Sessions</span>
              <div className="text-xl sm:text-2xl font-semibold font-mono tabular-nums text-text-primary">
                {completedSessions.length}
              </div>
              <p className="text-[11px] text-text-muted mt-0.5">
                Completed focus blocks in period
              </p>
            </div>

            <div className="p-4 sm:p-5">
              <span className="text-xs text-text-muted block mb-1">Total Focus Time</span>
              <div className="text-xl sm:text-2xl font-semibold font-mono tabular-nums text-text-primary">
                {formattedTotalTime}
              </div>
              <p className="text-[11px] text-text-muted mt-0.5">
                Deliberate execution recorded
              </p>
            </div>

            <div className="p-4 sm:p-5">
              <span className="text-xs text-text-muted block mb-1">Avg Duration</span>
              <div className="text-xl sm:text-2xl font-semibold font-mono tabular-nums text-text-primary">
                {avgLabel}
              </div>
              <p className="text-[11px] text-text-muted mt-0.5">
                Per completed session
              </p>
            </div>

            <div className="p-4 sm:p-5">
              <span className="text-xs text-text-muted block mb-1">Task-Linked Ratio</span>
              <div className="text-xl sm:text-2xl font-semibold font-mono tabular-nums text-text-primary">
                {taskLinkedSessions}{" "}
                <span className="text-xs font-normal text-text-muted">
                  ({taskLinkedPercent}%)
                </span>
              </div>
              <p className="text-[11px] text-text-muted mt-0.5">
                Sessions tied to strategic tasks
              </p>
            </div>
          </div>
        )}

        {/* 7-day focus rhythm: descriptive presence, never a streak. */}
        {!isLoadingRhythm && (
          <div className="mt-3 rounded-xl border border-border-subtle bg-bg-card px-4 py-3 flex items-center gap-4 flex-wrap">
            <div className="min-w-40">
              <span className="text-xs font-medium text-text-primary block">
                7-day focus rhythm
              </span>
              <span className="text-[11px] text-text-muted block">
                Presence per productive day — a gap breaks nothing.
              </span>
            </div>
            <div className="flex items-center gap-2.5" aria-label="Focus days in the last 7 productive days">
              {rhythmDays.map((day) => {
                const active = rhythmStats.daySet.has(day);
                return (
                  <div key={day} className="flex flex-col items-center gap-1" title={day}>
                    <span className="text-[10px] font-mono text-text-muted">
                      {format(new Date(`${day}T12:00:00`), "EEEEE")}
                    </span>
                    <span
                      className={`h-2 w-2 rounded-full ${
                        active ? "bg-text-primary" : "bg-border-subtle"
                      }`}
                    />
                  </div>
                );
              })}
            </div>
            <span className="text-xs font-mono text-text-muted">
              {rhythmStats.focusDays === 0 ? (
                "No focus days in the last 7 days yet."
              ) : (
                `${rhythmStats.focusDays} focus ${rhythmStats.focusDays === 1 ? "day" : "days"} · ${rhythmStats.sessionCount} ${rhythmStats.sessionCount === 1 ? "session" : "sessions"} · ${formatSessionDuration(rhythmStats.totalSecs)}`
              )}
            </span>
          </div>
        )}
      </Section>

      {/* 4. SESSION HISTORY.
          CURRENT EXECUTION (card above) → HOW DO I WANT TO LOOK AT HISTORY?
          (controls below) → HISTORY (views below). */}
      <Section>
        <div className="mb-3 space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <SectionHeader
              title="Session History"
              description={
                historyView === "timeline"
                  ? "Chronological execution record, newest first"
                  : "Repeated work grouped by task — sessions stay individual"
              }
            />
            <div className="flex items-center gap-2">
              {/* VIEW = how the dataset is organized */}
              <div
                className="bg-bg-secondary p-1 rounded-lg border border-border-subtle inline-flex items-center gap-1"
                role="tablist"
                aria-label="History organization"
              >
                {VIEW_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    role="tab"
                    aria-selected={historyView === opt.id}
                    onClick={() => setHistoryView(opt.id)}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                      historyView === opt.id
                        ? "bg-bg-card text-text-primary border border-border-subtle/60 shadow-2xs font-semibold"
                        : "text-text-muted hover:text-text-primary"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <span className="text-xs font-mono text-text-muted">
                {sessions.length} {sessions.length === 1 ? "session" : "sessions"}
              </span>
            </div>
          </div>

          {/* History controls: DATE RANGE → FILTERS → SEARCH, each separate. */}
          <div className="rounded-xl border border-border-subtle bg-bg-card p-4 space-y-3">
            {/* DATE RANGE = what dataset is being viewed */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
              <span className="text-xs text-text-muted flex items-center gap-1 mr-1 shrink-0 font-medium">
                <Calendar size={13} />
                <span>Date range:</span>
              </span>
              {RANGE_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    setRangePreset(opt.id);
                    setVisibleDaysCount(15);
                    setVisibleGroupsCount(20);
                  }}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer shrink-0 ${
                    rangePreset === opt.id
                      ? "bg-text-primary text-bg-default font-semibold shadow-xs"
                      : "bg-bg-secondary text-text-muted hover:text-text-primary border border-border-subtle hover:border-border-hover"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {/* Custom range picker (date-based; instants resolve productive-day aware) */}
            {rangePreset === "custom" && (
              <div className="flex items-end gap-2 flex-wrap pt-1 border-t border-border-subtle">
                <label className="flex flex-col gap-1 text-xs text-text-muted">
                  <span>From</span>
                  <input
                    type="date"
                    value={customDraft.from}
                    max={customDraft.to || undefined}
                    onChange={(e) => {
                      setCustomDraft((d) => ({ ...d, from: e.target.value }));
                      setCustomError(null);
                    }}
                    className="bg-bg-secondary text-text-primary text-xs border border-border-subtle rounded-md px-2.5 py-1.5 outline-none cursor-pointer"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-text-muted">
                  <span>To</span>
                  <input
                    type="date"
                    value={customDraft.to}
                    min={customDraft.from || undefined}
                    onChange={(e) => {
                      setCustomDraft((d) => ({ ...d, to: e.target.value }));
                      setCustomError(null);
                    }}
                    className="bg-bg-secondary text-text-primary text-xs border border-border-subtle rounded-md px-2.5 py-1.5 outline-none cursor-pointer"
                  />
                </label>
                <button
                  type="button"
                  onClick={applyCustomRange}
                  className="px-3 py-1.5 rounded-md bg-text-primary text-bg-default text-xs font-medium hover:opacity-90 transition-opacity cursor-pointer"
                >
                  Apply
                </button>
                {customApplied && (
                  <span className="text-xs font-mono text-text-muted pb-1.5">
                    Showing {customApplied.from} → {customApplied.to}
                  </span>
                )}
                {customError && (
                  <span role="alert" className="text-xs text-rose-600 dark:text-rose-400 pb-1.5">
                    {customError}
                  </span>
                )}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-border-subtle">
              {/* FILTERS = what subset is shown */}
              <span className="text-xs text-text-muted font-medium mr-1">Filters:</span>
              <div className="relative">
                <span className="text-xs text-text-muted mr-1.5">Task</span>
                <select
                  value={selectedTaskId}
                  onChange={(e) => setSelectedTaskId(e.target.value)}
                  className="appearance-none bg-bg-secondary text-text-primary text-xs border border-border-subtle hover:border-border-hover rounded-md pl-3 pr-8 py-1.5 outline-none cursor-pointer"
                >
                  <option value="all">All tasks</option>
                  {tasks.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title.length > 28 ? `${t.title.substring(0, 28)}...` : t.title}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  size={12}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none"
                />
              </div>

              <div className="relative">
                <span className="text-xs text-text-muted mr-1.5">Session</span>
                <select
                  value={linkedFilter}
                  onChange={(e) => setLinkedFilter(e.target.value as SessionLinkedFilter)}
                  className="appearance-none bg-bg-secondary text-text-primary text-xs border border-border-subtle hover:border-border-hover rounded-md pl-3 pr-8 py-1.5 outline-none cursor-pointer"
                >
                  {LINKED_OPTIONS.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  size={12}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none"
                />
              </div>

              {/* SEARCH = textual narrowing (server-side: notes, task, goal) */}
              <div className="relative flex-1 min-w-52">
                <Search
                  size={12}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none"
                />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search sessions, tasks, goals, notes..."
                  className="w-full bg-bg-secondary text-text-primary text-xs placeholder:text-text-muted border border-border-subtle focus:border-border-strong rounded-md pl-8 pr-3 py-1.5 outline-none"
                />
              </div>

              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="inline-flex items-center gap-1 text-xs text-text-muted hover:text-text-primary px-2 py-1.5 rounded-md hover:bg-bg-secondary transition-colors cursor-pointer"
                  title="Reset filters to defaults"
                >
                  <RotateCcw size={11} />
                  <span>Reset</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {isLoadingSessions ? (
          <div className="space-y-4 animate-pulse">
            {[1, 2].map((i) => (
              <div key={i} className="rounded-xl border border-border-subtle bg-bg-card p-5 space-y-3">
                <div className="h-4 w-40 bg-bg-secondary rounded" />
                <div className="h-10 w-full bg-bg-secondary/40 rounded" />
                <div className="h-10 w-full bg-bg-secondary/40 rounded" />
              </div>
            ))}
          </div>
        ) : sessions.length === 0 ? (
          <EmptyState
            title={
              rangePreset === "custom" && !customApplied
                ? "Choose a Custom Range"
                : hasActiveFilters
                  ? "No Sessions Match Filters"
                  : "No Sessions Recorded Yet"
            }
            description={
              rangePreset === "custom" && !customApplied
                ? "Pick From and To dates above, then press Apply to view that window."
                : hasActiveFilters
                  ? "No deliberate focus sessions found for the selected range, filters, or search. Adjust or reset them."
                  : "Start a focus block above or from the browser extension to begin capturing deliberate work periods."
            }
          />
        ) : historyView === "timeline" ? (
          <div className="space-y-5">
            {visibleTimelineGroups.map((group) => (
              <div
                key={group.dayKey}
                className="rounded-xl border border-border-subtle bg-bg-card overflow-hidden"
              >
                {/* Day Header */}
                <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-2.5 bg-bg-secondary/40 border-b border-border-subtle">
                  <div className="flex items-center gap-2.5">
                    <span className="text-xs font-semibold text-text-primary">
                      {group.label}
                    </span>
                    {group.totalSecs > 0 && (
                      <span
                        className="text-[11px] font-mono text-text-muted bg-bg-secondary px-1.5 py-0.5 rounded border border-border-subtle"
                        title={formatSessionDurationExact(group.totalSecs)}
                      >
                        {formatSessionDuration(group.totalSecs)}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-xs font-mono text-text-muted">
                      {group.sessions.length} {group.sessions.length === 1 ? "session" : "sessions"}
                    </span>
                    <Link
                      href={`/timeline?date=${group.dayKey}`}
                      className="inline-flex items-center gap-1 text-xs text-text-muted hover:text-text-primary transition-colors cursor-pointer"
                    >
                      <span>Inspect Timeline</span>
                      <ArrowRight size={12} />
                    </Link>
                  </div>
                </div>

                {/* Day Sessions List */}
                <div className="divide-y divide-border-subtle">
                  {group.sessions.map((sess) => (
                    <SessionRow
                      key={sess.id}
                      sess={sess}
                      tasks={tasks}
                      timelineDate={group.dayKey}
                      onInspectTask={(t) => setDrawerTask(t)}
                      observation={observedMap?.[sess.id] ?? null}
                      observationLoaded={observationLoaded}
                    />
                  ))}
                </div>
              </div>
            ))}

            {/* Pagination for large histories (server-scoped pages) */}
            {timelineGroups.length > visibleDaysCount && (
              <div className="pt-2 text-center">
                <button
                  type="button"
                  onClick={() => setVisibleDaysCount((prev) => prev + 15)}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-bg-secondary hover:bg-bg-tertiary border border-border-subtle text-xs font-medium text-text-primary transition-colors cursor-pointer"
                >
                  <Clock size={12} />
                  <span>
                    Show Earlier Days ({timelineGroups.length - visibleDaysCount} remaining)
                  </span>
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {visibleTaskGroups.map((group) => {
              const collapsed = isGroupCollapsed(group.key);
              const linkedTask = group.taskId
                ? (tasks.find((t) => t.id === group.taskId) ?? null)
                : null;
              const spanLabel =
                group.firstDay === group.lastDay
                  ? format(new Date(`${group.firstDay}T12:00:00`), "MMM d")
                  : `${format(new Date(`${group.firstDay}T12:00:00`), "MMM d")} – ${format(new Date(`${group.lastDay}T12:00:00`), "MMM d")}`;
              // Variance is actual-minus-targets for THESE sessions only.
              // It is never "task overtime": the task may carry more targets.
              const varianceLabel =
                group.varianceSecs == null
                  ? "—"
                  : group.varianceSecs === 0
                    ? "on target"
                    : `${group.varianceSecs > 0 ? "+" : ""}${Math.round(group.varianceSecs / 60)}m`;
              return (
                <div
                  key={group.key}
                  className="rounded-xl border border-border-subtle bg-bg-card overflow-hidden"
                >
                  <button
                    type="button"
                    onClick={() => toggleGroupCollapsed(group.key)}
                    aria-expanded={!collapsed}
                    className="w-full px-4 sm:px-5 py-3 flex items-center justify-between gap-3 hover:bg-bg-secondary/40 transition-colors text-left cursor-pointer"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-text-primary truncate">
                          {group.title}
                        </span>
                        {group.taskId == null ? (
                          <span className="text-[10px] font-mono uppercase tracking-wider text-text-muted bg-bg-secondary border border-border-subtle px-1.5 py-0.2 rounded">
                            Independent
                          </span>
                        ) : (
                          group.goalTitle && (
                            <span className="inline-flex items-center gap-1 text-[10px] text-text-muted bg-bg-secondary px-1.5 py-0.5 rounded border border-border-subtle truncate">
                              <Target size={10} className="shrink-0" />
                              <span>{group.goalTitle}</span>
                            </span>
                          )
                        )}
                      </div>
                      <div className="text-xs text-text-muted font-mono mt-0.5">
                        {group.sessionCount} {group.sessionCount === 1 ? "session" : "sessions"} · {spanLabel}
                      </div>
                    </div>
                    <div className="flex items-center justify-end gap-x-3 gap-y-1 flex-wrap shrink-0 font-mono text-xs text-text-muted">
                      <span title={`Summed recorded durations (${group.sessionCount} sessions)`}>
                        Total {formatSessionDuration(group.totalActualSecs)}
                      </span>
                      <span
                        title={
                          group.totalTargetSecs != null
                            ? "Summed session targets (every session has one)"
                            : "Some sessions in this group have no target — total withheld"
                        }
                      >
                        Targets{" "}
                        {group.totalTargetSecs != null
                          ? formatSessionDuration(group.totalTargetSecs)
                          : "—"}
                      </span>
                      <span
                        className="text-text-primary font-medium"
                        title="Summed actuals minus summed targets, for these sessions only"
                      >
                        {varianceLabel}
                      </span>
                      <ChevronDown
                        size={14}
                        className={`text-text-muted transition-transform ${collapsed ? "" : "rotate-180"}`}
                      />
                    </div>
                  </button>

                  {!collapsed && (
                    <div className="divide-y divide-border-subtle border-t border-border-subtle">
                      {group.sessions.map((sess) => (
                        <SessionRow
                          key={sess.id}
                          sess={sess}
                          tasks={tasks}
                          timelineDate={sessionDayKey(sess.startedAt, groupingOptions)}
                          onInspectTask={(t) => setDrawerTask(t)}
                          compact
                          datePrefix={format(
                            new Date(`${sessionDayKey(sess.startedAt, groupingOptions)}T12:00:00`),
                            "MMM d"
                          )}
                          showTimelineLink
                          observation={observedMap?.[sess.id] ?? null}
                          observationLoaded={observationLoaded}
                        />
                      ))}
                      {linkedTask && (
                        <button
                          type="button"
                          onClick={() => setDrawerTask(linkedTask)}
                          className="w-full inline-flex items-center justify-center gap-1 px-4 py-2.5 text-xs text-text-muted hover:text-text-primary hover:bg-bg-secondary/40 transition-colors cursor-pointer"
                        >
                          <span>Inspect task — full history, reflections & telemetry</span>
                          <ArrowRight size={12} />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {taskGroups.length > visibleGroupsCount && (
              <div className="pt-2 text-center">
                <button
                  type="button"
                  onClick={() => setVisibleGroupsCount((prev) => prev + 20)}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-bg-secondary hover:bg-bg-tertiary border border-border-subtle text-xs font-medium text-text-primary transition-colors cursor-pointer"
                >
                  <Clock size={12} />
                  <span>
                    Show More Groups ({taskGroups.length - visibleGroupsCount} remaining)
                  </span>
                </button>
              </div>
            )}
          </div>
        )}
      </Section>

      <FocusReflectionModal
        isOpen={Boolean(reflectionSession)}
        onClose={() => setReflectionSession(null)}
        session={reflectionSession}
      />
      <TaskDetailDrawer task={drawerTask} onClose={() => setDrawerTask(null)} />
    </PageContainer>
  );
}
