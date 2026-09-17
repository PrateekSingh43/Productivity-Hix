"use client";

import React, { useState, useEffect, useMemo } from "react";
import { PageContainer } from "../../components/layout/page-container";
import { PageHeader } from "../../components/layout/page-header";
import { Section } from "../../components/layout/section";
import { SectionHeader } from "../../components/layout/section-header";
import { EmptyState } from "../../components/primitives/empty-state";
import { CurrentFocusCard } from "../../components/primitives/current-focus-card";
import { Clock, Zap, Target, History, CheckCircle2, Play } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useTasks } from "../../src/hooks/queries/use-dashboard";
import { useSessionsList } from "../../src/hooks/queries/use-tasks";
import { useLiveTelemetry } from "../../src/hooks/use-live-telemetry";
import { createSession, finishSession, pauseSession, resumeSession } from "../../src/lib/api/sessions";
import { updateTask } from "../../src/lib/api/tasks";
import type { Task, WorkSession } from "@repo/types";
import { format } from "date-fns";

export default function SessionsPage() {
  const queryClient = useQueryClient();
  const { data: tasks = [] } = useTasks();
  const { data: sessions = [] } = useSessionsList();
  const telemetry = useLiveTelemetry();

  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [sessionActive, setSessionActive] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [sessionPending, setSessionPending] = useState(false);

  // Sync active session from backend
  const liveActiveSession = useMemo(() => {
    return sessions.find((s) => !s.endedAt) ?? null;
  }, [sessions]);

  useEffect(() => {
    if (liveActiveSession) {
      setActiveSessionId(liveActiveSession.id);
      setSessionActive(!liveActiveSession.isPaused);
      const startMs = Date.parse(liveActiveSession.lastResumedAt ?? liveActiveSession.startedAt);
      const accumulated = liveActiveSession.durationSeconds ?? 0;
      setElapsedSeconds(liveActiveSession.isPaused || !Number.isFinite(startMs)
        ? accumulated
        : accumulated + Math.max(0, Math.floor((Date.now() - startMs) / 1000)));
      if (liveActiveSession.taskId) {
        const found = tasks.find((t) => t.id === liveActiveSession.taskId);
        if (found) setSelectedTask(found);
      }
    } else if (activeSessionId && !liveActiveSession) {
      // Session ended externally
      setSessionActive(false);
      setActiveSessionId(null);
      setElapsedSeconds(0);
    }
  }, [liveActiveSession, tasks, activeSessionId]);

  // Active session timer
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

  // Default selection to first incomplete task if none selected
  useEffect(() => {
    if (!selectedTask && tasks.length > 0 && !sessionActive) {
      const topTodo = tasks.find((t) => t.status === "in_progress") || tasks.find((t) => t.status === "todo");
      if (topTodo) setSelectedTask(topTodo);
    }
  }, [tasks, selectedTask, sessionActive]);

  const handleStartFocus = async () => {
    if (!selectedTask || activeSessionId || sessionPending) return;
    setSessionError(null);
    setSessionPending(true);
    try {
      const session = await createSession({
        taskId: selectedTask.id,
        notes: `Focus on ${selectedTask.title}`,
      });
      setActiveSessionId(session.id);
      setSessionActive(true);
      setElapsedSeconds(0);
      await updateTask(selectedTask.id, { status: "in_progress" });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
    } catch {
      setSessionError("The session could not be started or linked. Please try again.");
    } finally {
      setSessionPending(false);
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
    }
  };

  const handlePauseResume = async (pause: boolean) => {
    if (!activeSessionId || sessionPending) return;
    setSessionError(null);
    setSessionPending(true);
    try {
      const session = await (pause ? pauseSession(activeSessionId) : resumeSession(activeSessionId));
      await queryClient.cancelQueries({ queryKey: ["sessions"] });
      queryClient.setQueryData<WorkSession[]>(["sessions"], (current) =>
        current?.map((item) => item.id === session.id ? session : item));
      setSessionActive(!session.isPaused);
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
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
      await finishSession(activeSessionId, "Completed intentional focus block");
      setSessionActive(false);
      setActiveSessionId(null);
      setElapsedSeconds(0);
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
      queryClient.invalidateQueries({ queryKey: ["plans"] });
      queryClient.invalidateQueries({ queryKey: ["activity"] });
    } catch {
      setSessionError("The session could not be completed. Please try again.");
    } finally {
      setSessionPending(false);
    }
  };

  // Metric summaries
  const completedSessions = useMemo(() => {
    return sessions.filter((s) => Boolean(s.endedAt));
  }, [sessions]);

  const totalMinutes = useMemo(() => {
    return Math.round(
      completedSessions.reduce((acc, s) => acc + (s.durationSeconds || 0), 0) / 60
    );
  }, [completedSessions]);

  const avgMinutes = useMemo(() => {
    if (completedSessions.length === 0) return 0;
    return Math.round(totalMinutes / completedSessions.length);
  }, [completedSessions, totalMinutes]);

  const taskLinkedSessions = completedSessions.filter((s) => Boolean(s.taskId)).length;
  const isLimited = sessions.length >= 50;

  return (
    <PageContainer>
      <PageHeader
        title="Sessions"
        subtitle="Deliberate focus execution blocks and telemetry observation"
        breadcrumbs={[
          { label: "Home", href: "/" },
          { label: "Sessions" },
        ]}
        actions={
          isLimited ? (
            <span className="text-xs font-mono text-text-muted">showing most recent 50</span>
          ) : undefined
        }
      />

      {/* 1. VISUAL ANCHOR: CURRENT FOCUS CARD */}
      <Section>
        <CurrentFocusCard
          isActive={sessionActive}
          isPaused={Boolean(activeSessionId) && !sessionActive}
          isPending={sessionPending}
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

      {/* 2. METRIC SUMMARY RIBBON */}
      <Section>
        <div className="rounded-xl border border-border-subtle bg-bg-card grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-border-subtle overflow-hidden">
          <div className="p-4 sm:p-5">
            <span className="text-xs text-text-muted block mb-1">{isLimited ? "Sessions (last 50)" : "Total Sessions"}</span>
            <div className="text-xl sm:text-2xl font-semibold font-mono tabular-nums text-text-primary">
              {completedSessions.length}
            </div>
            <p className="text-[11px] text-text-muted mt-0.5">
              Completed focus blocks
            </p>
          </div>

          <div className="p-4 sm:p-5">
            <span className="text-xs text-text-muted block mb-1">{isLimited ? "Recorded minutes (last 50)" : "Total Focus Time"}</span>
            <div className="text-xl sm:text-2xl font-semibold font-mono tabular-nums text-text-primary">
              {totalMinutes}m
            </div>
            <p className="text-[11px] text-text-muted mt-0.5">
              Deliberate work recorded
            </p>
          </div>

          <div className="p-4 sm:p-5">
            <span className="text-xs text-text-muted block mb-1">Avg Duration</span>
            <div className="text-xl sm:text-2xl font-semibold font-mono tabular-nums text-text-primary">
              {avgMinutes > 0 ? `${avgMinutes}m` : "—"}
            </div>
            <p className="text-[11px] text-text-muted mt-0.5">
              Per completed block
            </p>
          </div>

          <div className="p-4 sm:p-5">
            <span className="text-xs text-text-muted block mb-1">Task-linked sessions</span>
            <div className="text-xl sm:text-2xl font-semibold font-mono tabular-nums text-text-primary">
              {taskLinkedSessions}
            </div>
            <p className="text-[11px] text-text-muted mt-0.5">
              Completed sessions linked to a task
            </p>
          </div>
        </div>
      </Section>

      {/* 3. SESSION HISTORY */}
      <Section>
        <div className="flex items-center justify-between mb-3">
          <SectionHeader
            title="Session History"
            description="Chronological log of deliberate focus blocks and observed activity"
          />
          <span className="text-xs font-mono text-text-muted">
            {sessions.length} {sessions.length === 1 ? "session" : "sessions"}
          </span>
        </div>

        {sessions.length === 0 ? (
          <EmptyState
            icon={History}
            title="No Sessions Recorded Yet"
            description="Start a focus block above or from the browser extension to begin capturing deliberate work periods."
          />
        ) : (
          <div className="rounded-xl border border-border-subtle bg-bg-card divide-y divide-border-subtle overflow-hidden">
            {sessions.map((sess) => {
              const task = tasks.find((t) => t.id === sess.taskId);
              const isLive = !sess.endedAt;
              const durationMins = Math.round((sess.durationSeconds || 0) / 60);

              return (
                <div
                  key={sess.id}
                  className="px-4 sm:px-5 py-3.5 flex items-center justify-between gap-3 hover:bg-bg-secondary/40 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`h-7 w-7 rounded-full flex items-center justify-center shrink-0 ${
                        isLive
                          ? "bg-bg-secondary text-text-primary border border-border-strong"
                          : "bg-bg-secondary text-text-muted border border-border-subtle"
                      }`}
                    >
                      {isLive ? <Play size={11} className="fill-current animate-pulse" /> : <CheckCircle2 size={13} />}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-text-primary truncate">
                          {task?.title ?? sess.notes ?? "Intentional Focus Session"}
                        </span>
                        {isLive && (
                          <span className="text-[10px] font-mono uppercase tracking-wider text-text-primary bg-bg-secondary border border-border-strong px-1.5 py-0.5 rounded">
                            Live
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-text-muted font-mono">
                        {(() => {
                          let startDate = new Date(sess.startedAt);
                          if (sess.endedAt && sess.durationSeconds) {
                            const endDate = new Date(sess.endedAt);
                            const wallClockSec = Math.round((endDate.getTime() - startDate.getTime()) / 1000);
                            if (wallClockSec < sess.durationSeconds) {
                              startDate = new Date(endDate.getTime() - sess.durationSeconds * 1000);
                            }
                          }
                          return format(startDate, "MMM d, h:mm a");
                        })()}
                        {sess.endedAt ? ` · ${durationMins}m` : " · Running now"}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 font-mono text-xs text-text-muted">
                    {isLive ? (
                      <span className="text-text-primary font-semibold">Running</span>
                    ) : (
                      <span>{durationMins}m</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Section>
    </PageContainer>
  );
}
