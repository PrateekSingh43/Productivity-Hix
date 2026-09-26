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
  Flame,
  RotateCcw,
} from "lucide-react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { taskQueries, updateTask, FocusReflectionModal } from "@features/tasks";
import { sessionQueries, useSessionsList, useActiveSession } from "../api/queries";
import { createSession, finishSession, pauseSession, resumeSession } from "../api/client";
import { useLiveTelemetry } from "@features/timeline";
import { planQueries } from "@features/today";
import type { WorkSession, SessionRangePreset, SessionListFilters } from "../types";
import type { Task } from "@repo/types";
import { format } from "date-fns";

const RANGE_OPTIONS: { id: SessionRangePreset; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "7d", label: "Last 7 Days" },
  { id: "30d", label: "Last 30 Days" },
  { id: "90d", label: "Last 90 Days" },
  { id: "all", label: "All Time" },
];

export function SessionsView() {
  const queryClient = useQueryClient();
  const telemetry = useLiveTelemetry();

  // 1. Filter state for scalable 100+ day history
  const [rangePreset, setRangePreset] = useState<SessionRangePreset>("30d");
  const [selectedTaskId, setSelectedTaskId] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [visibleDaysCount, setVisibleDaysCount] = useState(15);

  // Compute date filter boundary based on rangePreset
  const activeFilters = useMemo<SessionListFilters>(() => {
    const filters: SessionListFilters = {
      rangePreset,
      limit: rangePreset === "all" ? 500 : 200,
    };

    if (selectedTaskId !== "all") {
      filters.taskId = selectedTaskId;
    }

    if (searchQuery.trim()) {
      filters.search = searchQuery.trim();
    }

    const now = new Date();
    if (rangePreset === "today") {
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      filters.from = startOfDay.toISOString();
    } else if (rangePreset === "7d") {
      filters.from = new Date(now.getTime() - 7 * 86400000).toISOString();
    } else if (rangePreset === "30d") {
      filters.from = new Date(now.getTime() - 30 * 86400000).toISOString();
    } else if (rangePreset === "90d") {
      filters.from = new Date(now.getTime() - 90 * 86400000).toISOString();
    }

    return filters;
  }, [rangePreset, selectedTaskId, searchQuery]);

  // 2. Data fetching
  const { data: tasks = [] } = useQuery(taskQueries.list());
  const { data: serverActiveSession, isLoading: isLoadingActive } = useActiveSession();
  const { data: sessions = [], isLoading: isLoadingSessions } = useSessionsList(activeFilters);

  // 3. Local operational session state
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
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

  // Sync active session state
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
      if (currentActive.taskId) {
        const found = tasks.find((t) => t.id === currentActive.taskId);
        if (found) setSelectedTask(found);
      }
    } else if (activeSessionId && !currentActive) {
      setSessionActive(false);
      setActiveSessionId(null);
      setElapsedSeconds(0);
    }
  }, [currentActive, tasks, activeSessionId]);

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

  // Default selection to first incomplete task if none selected and not focusing
  useEffect(() => {
    if (!selectedTask && tasks.length > 0 && !sessionActive && !currentActive) {
      const topTodo = tasks.find((t) => t.status === "in_progress") || tasks.find((t) => t.status === "todo");
      if (topTodo) setSelectedTask(topTodo);
    }
  }, [tasks, selectedTask, sessionActive, currentActive]);

  // Session Handlers
  const handleStartFocus = async (params?: {
    taskId?: string | null;
    notes?: string | null;
    durationMinutes?: number | null;
  }) => {
    if (activeSessionId || sessionPending) return;
    setSessionError(null);
    setSessionPending(true);

    const targetTaskId = params?.taskId ?? selectedTask?.id ?? null;
    const targetNotes = params?.notes ?? (selectedTask ? `Focus on ${selectedTask.title}` : "Deliberate focus session");
    const targetMins = params?.durationMinutes ?? selectedTask?.plannedDurationMinutes ?? 25;

    try {
      const session = await createSession({
        taskId: targetTaskId,
        targetDurationMinutes: targetMins,
        notes: targetNotes,
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
      setSessionError("The session could not be started. Please try again.");
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
      await queryClient.cancelQueries({ queryKey: sessionQueries.all() });
      queryClient.setQueryData<WorkSession[]>(sessionQueries.lists(), (current) =>
        current?.map((item) => (item.id === session.id ? session : item))
      );
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
      const finishedId = activeSessionId;
      const finishedDuration = elapsedSeconds;
      const finishedTask = selectedTask;
      await finishSession(activeSessionId, "Completed intentional focus block");
      setSessionActive(false);
      setActiveSessionId(null);
      setElapsedSeconds(0);
      setReflectionSession({
        id: finishedId,
        taskId: finishedTask?.id ?? null,
        taskTitle: finishedTask?.title ?? currentActive?.taskTitle ?? currentActive?.notes ?? null,
        durationSeconds: finishedDuration,
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

  // Metric summaries over the currently filtered sessions
  const completedSessions = useMemo(() => {
    return sessions.filter((s) => Boolean(s.endedAt));
  }, [sessions]);

  const totalMinutes = useMemo(() => {
    return Math.round(
      completedSessions.reduce((acc, s) => acc + (s.durationSeconds || 0), 0) / 60
    );
  }, [completedSessions]);

  const formattedTotalTime = useMemo(() => {
    if (totalMinutes === 0) return "0m";
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    if (hours === 0) return `${mins}m`;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  }, [totalMinutes]);

  const avgMinutes = useMemo(() => {
    if (completedSessions.length === 0) return 0;
    return Math.round(totalMinutes / completedSessions.length);
  }, [completedSessions, totalMinutes]);

  const taskLinkedSessions = useMemo(() => {
    return completedSessions.filter((s) => Boolean(s.taskId)).length;
  }, [completedSessions]);

  const taskLinkedPercent = useMemo(() => {
    if (completedSessions.length === 0) return 0;
    return Math.round((taskLinkedSessions / completedSessions.length) * 100);
  }, [completedSessions, taskLinkedSessions]);

  // Scalable Day-grouped history (Newest day first, sessions newest first)
  const historyDayGroups = useMemo(() => {
    const groupsMap = new Map<string, WorkSession[]>();
    for (const sess of sessions) {
      const dayKey = format(new Date(sess.startedAt), "yyyy-MM-dd");
      const list = groupsMap.get(dayKey) ?? [];
      list.push(sess);
      groupsMap.set(dayKey, list);
    }

    const todayKey = format(new Date(), "yyyy-MM-dd");
    const yesterdayKey = format(new Date(Date.now() - 86400000), "yyyy-MM-dd");

    return Array.from(groupsMap.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([dayKey, list]) => {
        let label: string;
        try {
          if (dayKey === todayKey) {
            label = `Today · ${format(new Date(`${dayKey}T12:00:00`), "EEEE, MMM d")}`;
          } else if (dayKey === yesterdayKey) {
            label = `Yesterday · ${format(new Date(`${dayKey}T12:00:00`), "EEEE, MMM d")}`;
          } else {
            label = format(new Date(`${dayKey}T12:00:00`), "EEEE, MMMM d, yyyy");
          }
        } catch {
          label = dayKey;
        }

        const dayTotalMins = Math.round(
          list.reduce((acc, s) => acc + (s.durationSeconds || 0), 0) / 60
        );

        return {
          dayKey,
          label,
          dayTotalMins,
          sessions: [...list].sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
        };
      });
  }, [sessions]);

  const visibleDayGroups = useMemo(() => {
    return historyDayGroups.slice(0, visibleDaysCount);
  }, [historyDayGroups, visibleDaysCount]);

  const hasActiveFilters =
    rangePreset !== "all" || selectedTaskId !== "all" || searchQuery.trim().length > 0;

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
          selectedTask={selectedTask}
          availableTasks={tasks}
          elapsedSeconds={elapsedSeconds}
          observedApplication={telemetry.activeApp || undefined}
          observedDomain={telemetry.activeDomain || undefined}
          observedTitle={telemetry.windowTitle || undefined}
          onSelectTask={(task) => setSelectedTask(task)}
          onStartFocus={handleStartFocus}
          onPause={() => void handlePauseResume(true)}
          onResume={() => void handlePauseResume(false)}
          onComplete={handleCompleteFocus}
        />
      </Section>

      {/* 2. DYNAMIC FILTER CONTROLS & RANGE SELECTOR */}
      <Section>
        <div className="rounded-xl border border-border-subtle bg-bg-card p-4 space-y-3">
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
            {/* Range Preset Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
              <span className="text-xs text-text-muted flex items-center gap-1 mr-1 shrink-0 font-medium">
                <Calendar size={13} />
                <span>Range:</span>
              </span>
              {RANGE_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    setRangePreset(opt.id);
                    setVisibleDaysCount(15);
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

            {/* Task Filter & Search */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Task Selector */}
              <div className="relative">
                <select
                  value={selectedTaskId}
                  onChange={(e) => setSelectedTaskId(e.target.value)}
                  className="appearance-none bg-bg-secondary text-text-primary text-xs border border-border-subtle hover:border-border-hover rounded-md pl-3 pr-8 py-1.5 outline-none cursor-pointer"
                >
                  <option value="all">All Tasks</option>
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

              {/* Text Search Input */}
              <div className="relative flex-1 sm:w-56">
                <Search
                  size={12}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none"
                />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter sessions or notes..."
                  className="w-full bg-bg-secondary text-text-primary text-xs placeholder:text-text-muted border border-border-subtle focus:border-border-strong rounded-md pl-8 pr-3 py-1.5 outline-none"
                />
              </div>

              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={() => {
                    setRangePreset("all");
                    setSelectedTaskId("all");
                    setSearchQuery("");
                  }}
                  className="inline-flex items-center gap-1 text-xs text-text-muted hover:text-text-primary px-2 py-1.5 rounded-md hover:bg-bg-secondary transition-colors cursor-pointer"
                  title="Reset all filters"
                >
                  <RotateCcw size={11} />
                  <span>Reset</span>
                </button>
              )}
            </div>
          </div>
        </div>
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
                {avgMinutes > 0 ? `${avgMinutes}m` : "—"}
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
      </Section>

      {/* 4. SESSION HISTORY STREAM (Grouped by day, scalable for 100+ days) */}
      <Section>
        <div className="flex items-center justify-between mb-3">
          <SectionHeader
            title="Session History"
            description="Chronological log of deliberate focus blocks"
          />
          <span className="text-xs font-mono text-text-muted">
            {sessions.length} {sessions.length === 1 ? "session" : "sessions"} loaded
          </span>
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
            title={hasActiveFilters ? "No Sessions Match Filters" : "No Sessions Recorded Yet"}
            description={
              hasActiveFilters
                ? "No deliberate focus sessions found for the selected time range or search criteria. Try selecting 'All Time' or resetting filters."
                : "Start a focus block above or from the browser extension to begin capturing deliberate work periods."
            }
          />
        ) : (
          <div className="space-y-5">
            {visibleDayGroups.map((group) => (
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
                    {group.dayTotalMins > 0 && (
                      <span className="text-[11px] font-mono text-text-muted bg-bg-secondary px-1.5 py-0.5 rounded border border-border-subtle">
                        {group.dayTotalMins >= 60
                          ? `${Math.floor(group.dayTotalMins / 60)}h ${group.dayTotalMins % 60}m`
                          : `${group.dayTotalMins}m`}
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
                  {group.sessions.map((sess) => {
                    const linkedTask = tasks.find((t) => t.id === sess.taskId);
                    const isLive = !sess.endedAt;
                    const durationMins = Math.round((sess.durationSeconds || 0) / 60);
                    const title =
                      sess.taskTitle ?? linkedTask?.title ?? sess.notes ?? "Intentional Focus Session";
                    const goalTitle = sess.goalTitle ?? linkedTask?.goalTitle ?? null;
                    const plannedMins = sess.targetDurationMinutes ?? linkedTask?.plannedDurationMinutes ?? null;
                    const isOvertime = plannedMins && durationMins > plannedMins;

                    return (
                      <div
                        key={sess.id}
                        className="px-4 sm:px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-bg-secondary/40 transition-colors"
                      >
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
                              <span className="text-sm font-medium text-text-primary truncate">
                                {title}
                              </span>
                              {isLive && (
                                <span className="text-[10px] font-mono uppercase tracking-wider text-text-primary bg-bg-secondary border border-border-strong px-1.5 py-0.2 rounded">
                                  Live
                                </span>
                              )}
                              {goalTitle && (
                                <span className="inline-flex items-center gap-1 text-[10px] text-text-muted bg-bg-secondary px-1.5 py-0.5 rounded border border-border-subtle truncate">
                                  <Target size={10} className="shrink-0" />
                                  <span>{goalTitle}</span>
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-xs text-text-muted font-mono flex-wrap">
                              <span>
                                {(() => {
                                  let startDate = new Date(sess.startedAt);
                                  if (sess.endedAt && sess.durationSeconds) {
                                    const endDate = new Date(sess.endedAt);
                                    const wallClockSec = Math.round(
                                      (endDate.getTime() - startDate.getTime()) / 1000
                                    );
                                    if (wallClockSec < sess.durationSeconds) {
                                      startDate = new Date(endDate.getTime() - sess.durationSeconds * 1000);
                                    }
                                  }
                                  return format(startDate, "h:mm a");
                                })()}
                                {sess.endedAt ? (
                                  <> – {format(new Date(sess.endedAt), "h:mm a")}</>
                                ) : (
                                  " · Running now"
                                )}
                              </span>
                              {sess.notes && sess.notes !== title && (
                                <>
                                  <span>·</span>
                                  <span className="italic text-text-muted truncate max-w-xs font-sans">
                                    "{sess.notes}"
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Benchmark & Duration Display */}
                        <div className="flex items-center gap-2 shrink-0 font-mono text-xs text-text-muted sm:self-auto self-end">
                          {isLive ? (
                            <>
                              <span className="text-text-primary font-semibold font-sans">Running</span>
                              {plannedMins != null && <span>· Planned {plannedMins}m</span>}
                            </>
                          ) : (
                            <>
                              {plannedMins != null && <span>Planned {plannedMins}m ·</span>}
                              <span className="text-text-primary font-medium">Actual {durationMins}m</span>
                              {isOvertime && (
                                <span className="inline-flex items-center gap-0.5 px-1 py-0.2 rounded text-[10px] bg-bg-secondary text-text-primary border border-border-strong">
                                  <Flame size={9} />
                                  <span>+{durationMins - plannedMins}m</span>
                                </span>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

            {/* Pagination / "Load More Days" for 100+ day history */}
            {historyDayGroups.length > visibleDaysCount && (
              <div className="pt-2 text-center">
                <button
                  type="button"
                  onClick={() => setVisibleDaysCount((prev) => prev + 15)}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-bg-secondary hover:bg-bg-tertiary border border-border-subtle text-xs font-medium text-text-primary transition-colors cursor-pointer"
                >
                  <Clock size={12} />
                  <span>
                    Show Earlier Days ({historyDayGroups.length - visibleDaysCount} remaining)
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
    </PageContainer>
  );
}
