"use client";

import React, { useState, useEffect, useMemo } from "react";
import { PageContainer } from "../../components/layout/page-container";
import { PageHeader } from "../../components/layout/page-header";
import { Section } from "../../components/layout/section";
import { SectionHeader } from "../../components/layout/section-header";
import { StatCard } from "../../components/primitives/stat-card";
import { EmptyState } from "../../components/primitives/empty-state";
import { CurrentFocusCard } from "../../components/primitives/current-focus-card";
import { Clock, Zap, Target, History, CheckCircle2, Play } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useTasks } from "../../src/hooks/queries/use-dashboard";
import { useSessionsList } from "../../src/hooks/queries/use-tasks";
import { useLiveTelemetry } from "../../src/hooks/use-live-telemetry";
import { createSession, finishSession } from "../../src/lib/api/sessions";
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

  // Sync active session from backend
  const liveActiveSession = useMemo(() => {
    return sessions.find((s) => !s.endedAt) ?? null;
  }, [sessions]);

  useEffect(() => {
    if (liveActiveSession) {
      setActiveSessionId(liveActiveSession.id);
      setSessionActive(true);
      const startMs = Date.parse(liveActiveSession.startedAt);
      if (!isNaN(startMs)) {
        setElapsedSeconds(Math.max(0, Math.floor((Date.now() - startMs) / 1000)));
      }
      if (liveActiveSession.taskId) {
        const found = tasks.find((t) => t.id === liveActiveSession.taskId);
        if (found) setSelectedTask(found);
      }
    } else if (activeSessionId && !liveActiveSession) {
      // Session ended externally (e.g. from extension)
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
    if (!selectedTask) return;
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
      setSessionActive(true);
    }
  };

  const handleCompleteFocus = async () => {
    if (activeSessionId) {
      await finishSession(activeSessionId, "Completed intentional focus block");
    }
    if (selectedTask) {
      await updateTask(selectedTask.id, { status: "done" });
    }
    setSessionActive(false);
    setActiveSessionId(null);
    setElapsedSeconds(0);
    queryClient.invalidateQueries({ queryKey: ["tasks"] });
    queryClient.invalidateQueries({ queryKey: ["sessions"] });
    queryClient.invalidateQueries({ queryKey: ["plans"] });
    queryClient.invalidateQueries({ queryKey: ["activity"] });
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

  const taskAlignmentPercent = useMemo(() => {
    if (completedSessions.length === 0) return 0;
    const aligned = completedSessions.filter((s) => Boolean(s.taskId)).length;
    return Math.round((aligned / completedSessions.length) * 100);
  }, [completedSessions]);

  return (
    <PageContainer>
      <PageHeader
        title="Focus & Sessions"
        subtitle="Deliberate execution blocks — comparing intention to observed telemetry and outcomes"
        breadcrumbs={[
          { label: "ProductiveHix", href: "/" },
          { label: "Focus & Sessions" },
        ]}
      />

      {/* 1. CURRENT FOCUS EXECUTION CARD */}
      <Section>
        <CurrentFocusCard
          isActive={sessionActive}
          selectedTask={selectedTask}
          availableTasks={tasks}
          elapsedSeconds={elapsedSeconds}
          observedApplication={telemetry.activeApp || undefined}
          observedDomain={telemetry.activeDomain || undefined}
          observedTitle={telemetry.windowTitle || undefined}
          onSelectTask={(task) => setSelectedTask(task)}
          onStartFocus={handleStartFocus}
          onPause={() => setSessionActive(false)}
          onResume={() => setSessionActive(true)}
          onComplete={handleCompleteFocus}
        />
      </Section>

      {/* 2. Metric Summary */}
      <Section>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard
            label="Total Sessions"
            value={completedSessions.length}
            subtext={
              completedSessions.length > 0
                ? `${totalMinutes}m total deliberate work`
                : "No completed sessions yet"
            }
            state={completedSessions.length > 0 ? "ready" : "empty"}
            icon={Zap}
          />
          <StatCard
            label="Avg Duration"
            value={avgMinutes > 0 ? `${avgMinutes}m` : "—"}
            subtext="Calculated across completed blocks"
            state={avgMinutes > 0 ? "ready" : "empty"}
            icon={Clock}
          />
          <StatCard
            label="Task Alignment"
            value={completedSessions.length > 0 ? `${taskAlignmentPercent}%` : "—"}
            subtext="Linked directly to planned priorities"
            state={completedSessions.length > 0 ? "ready" : "empty"}
            icon={Target}
          />
        </div>
      </Section>

      {/* 3. Session History */}
      <Section>
        <SectionHeader
          title="Session History"
          description="Detailed logs of deliberate focus blocks, self-reported blockers, and observed activity"
        />

        {sessions.length === 0 ? (
          <EmptyState
            icon={History}
            title="No Sessions Recorded Yet"
            description="Start a focus session above or from the browser extension to begin capturing deliberate work periods and comparing intention with telemetry."
          />
        ) : (
          <div className="rounded-[var(--radius-md)] border border-border-subtle bg-bg-card overflow-hidden divide-y divide-border-subtle shadow-xs">
            {sessions.map((sess) => {
              const task = tasks.find((t) => t.id === sess.taskId);
              const isLive = !sess.endedAt;
              const durationMins = Math.round((sess.durationSeconds || 0) / 60);

              return (
                <div
                  key={sess.id}
                  className="p-3.5 sm:p-4 flex items-center justify-between gap-3 transition-colors hover:bg-bg-secondary/60"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`h-7 w-7 rounded-full flex items-center justify-center shrink-0 ${
                        isLive
                          ? "bg-emerald-500/15 text-emerald-500 dark:text-emerald-400 border border-emerald-500/30"
                          : "bg-bg-secondary text-text-secondary border border-border-default"
                      }`}
                    >
                      {isLive ? <Play size={12} fill="currentColor" /> : <CheckCircle2 size={13} />}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-text-primary truncate">
                          {task?.title ?? sess.notes ?? "Intentional Focus Session"}
                        </span>
                        {isLive && (
                          <span className="text-[9px] font-mono uppercase tracking-wider text-emerald-500 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/25 px-1.5 py-0.5 rounded">
                            Active
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-text-tertiary">
                        {format(new Date(sess.startedAt), "MMM d, HH:mm")}
                        {sess.endedAt ? ` · ${durationMins} min` : " · Running now"}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 font-mono text-xs text-text-secondary">
                    {isLive ? (
                      <span className="text-emerald-500 dark:text-emerald-400 font-bold">Live</span>
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
