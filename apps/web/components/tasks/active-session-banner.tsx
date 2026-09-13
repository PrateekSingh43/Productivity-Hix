import { useEffect, useState, useRef } from "react";
import { Square, ExternalLink, Activity, Pause, Play, Trash2 } from "lucide-react";
import type { Task, WorkSession } from "@repo/types";
import {
  useEndTaskSessionMutation,
  usePauseSessionMutation,
  useResumeSessionMutation,
  useDeleteSessionMutation,
} from "../../src/hooks/mutations/use-task-mutations";
import { ConfirmDiscardModal } from "./confirm-discard-modal";
import { FocusReflectionModal } from "./focus-reflection-modal";

interface ActiveSessionBannerProps {
  sessions: WorkSession[];
  tasks: Task[];
  onSelectTask?: (task: Task) => void;
}

export function ActiveSessionBanner({ sessions, tasks, onSelectTask }: ActiveSessionBannerProps) {
  const activeSession = sessions.find((s) => !s.endedAt);
  const endSessionMutation = useEndTaskSessionMutation();
  const pauseSessionMutation = usePauseSessionMutation();
  const resumeSessionMutation = useResumeSessionMutation();
  const deleteSessionMutation = useDeleteSessionMutation();

  const [now, setNow] = useState(Date.now());
  const [showDiscardModal, setShowDiscardModal] = useState(false);
  const [reflectionSession, setReflectionSession] = useState<{
    id: string;
    taskId?: string | null;
    taskTitle?: string | null;
    durationSeconds?: number | null;
  } | null>(null);
  const hasNotifiedTargetRef = useRef<string | null>(null);

  useEffect(() => {
    if (!activeSession) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [activeSession]);

  const linkedTask = activeSession ? tasks.find((t) => t.id === activeSession.taskId) : undefined;
  const isPaused = Boolean(activeSession?.isPaused);
  const baseDuration = activeSession?.durationSeconds ?? 0;

  const elapsedSeconds = !activeSession
    ? 0
    : isPaused
      ? baseDuration
      : baseDuration + Math.max(0, Math.floor((now - new Date(activeSession.startedAt).getTime()) / 1000));

  const targetDurationMinutes =
    activeSession?.targetDurationMinutes ??
    linkedTask?.plannedDurationMinutes ??
    25;
  const targetSeconds = targetDurationMinutes * 60;
  const remainingSeconds = targetSeconds - elapsedSeconds;
  const isOvertime = remainingSeconds < 0;

  // Fire Web Desktop Notification when target is reached (called unconditionally to satisfy Rules of Hooks)
  useEffect(() => {
    if (!activeSession || isPaused || remainingSeconds > 0) return;
    if (hasNotifiedTargetRef.current === activeSession.id) return;

    hasNotifiedTargetRef.current = activeSession.id;
    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
      const title = linkedTask ? linkedTask.title : activeSession.taskTitle || "Focus Block";
      try {
        new Notification("Focus Target Reached!", {
          body: `Completed planned ${targetDurationMinutes}m on "${title}". Continue in flow or wrap up & reflect.`,
          icon: "/icon.png",
        });
      } catch {}
    }
  }, [activeSession, isPaused, remainingSeconds, linkedTask, targetDurationMinutes]);

  if (!activeSession) return null;

  const formatTimer = (seconds: number) => {
    const s = Math.abs(seconds);
    const hours = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (hours > 0) {
      return `${hours}:${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
    }
    return `${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  };

  const handleDiscard = () => {
    setShowDiscardModal(true);
  };

  return (
    <div className="rounded-xl border border-border-strong bg-bg-secondary p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 animate-in fade-in slide-in-from-top-2 duration-300">
      <div className="flex items-center gap-3.5 min-w-0">
        <div className="h-10 w-10 rounded-full bg-bg-secondary border border-border-strong flex items-center justify-center text-text-primary shrink-0">
          <Activity size={18} className={isPaused ? "text-amber-500" : "animate-pulse text-emerald-500"} />
        </div>

        <div className="min-w-0 space-y-0.5">
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium border ${
              isPaused
                ? "bg-amber-500/15 border-amber-500/30 text-amber-600 dark:text-amber-400"
                : "bg-emerald-500/15 border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
            }`}>
              <span className={`h-1.5 w-1.5 rounded-full ${isPaused ? "bg-amber-500" : "bg-emerald-500 animate-ping"}`} />
              {isPaused ? "Focus Paused" : "Focus Session In Progress"}
            </span>
            <span className="text-xs text-text-muted">
              Target: {targetDurationMinutes}m
            </span>
          </div>

          <h3 className="text-sm font-semibold text-text-primary truncate max-w-md">
            {linkedTask ? linkedTask.title : activeSession.taskTitle || "Active Focus Session"}
          </h3>
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0 self-end sm:self-auto">
        <div className="text-right">
          <div className={`font-mono text-base sm:text-lg font-semibold tabular-nums tracking-tight ${
            isPaused ? "text-amber-500" : isOvertime ? "text-amber-400" : "text-text-primary"
          }`}>
            {isOvertime ? `+${formatTimer(remainingSeconds)}` : formatTimer(remainingSeconds)}
          </div>
          <span className="text-[11px] text-text-muted font-mono block">
            {isPaused ? "paused" : isOvertime ? "overtime (flow)" : "remaining"}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {isPaused ? (
            <button
              onClick={() => resumeSessionMutation.mutate(activeSession.id)}
              disabled={resumeSessionMutation.isPending}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-amber-500/15 border border-amber-500/30 text-xs font-medium text-amber-600 dark:text-amber-400 hover:bg-amber-500/25 transition-colors cursor-pointer"
              title="Resume session"
            >
              <Play size={13} className="fill-current" />
              <span>Resume</span>
            </button>
          ) : (
            <button
              onClick={() => pauseSessionMutation.mutate(activeSession.id)}
              disabled={pauseSessionMutation.isPending}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border-subtle bg-bg-card text-xs font-medium text-text-secondary hover:text-text-primary hover:border-border-hover transition-colors cursor-pointer"
              title="Pause session"
            >
              <Pause size={13} />
              <span>Pause</span>
            </button>
          )}

          {linkedTask && onSelectTask && (
            <button
              onClick={() => onSelectTask(linkedTask)}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md border border-border-subtle bg-bg-card text-xs font-medium text-text-secondary hover:text-text-primary hover:border-border-hover transition-colors cursor-pointer"
            >
              <ExternalLink size={13} />
              Details
            </button>
          )}

          <button
            onClick={() => {
              const sess = activeSession;
              endSessionMutation.mutate(sess.id, {
                onSuccess: () => {
                  setReflectionSession({
                    id: sess.id,
                    taskId: sess.taskId,
                    taskTitle: linkedTask?.title || sess.taskTitle,
                    durationSeconds: elapsedSeconds,
                  });
                },
              });
            }}
            disabled={endSessionMutation.isPending}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md bg-rose-500/15 border border-rose-500/30 text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-500/25 transition-colors disabled:opacity-50 cursor-pointer"
          >
            <Square size={13} />
            {endSessionMutation.isPending ? "Ending..." : "End"}
          </button>

          <button
            onClick={handleDiscard}
            disabled={deleteSessionMutation.isPending}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-border-subtle hover:border-red-500/40 hover:bg-red-500/10 text-xs font-medium text-text-muted hover:text-red-400 transition-colors cursor-pointer"
            title="Discard session"
          >
            <Trash2 size={13} />
            <span className="sr-only sm:not-sr-only sm:inline text-[11px]">Discard</span>
          </button>
        </div>
      </div>

      <ConfirmDiscardModal
        isOpen={showDiscardModal}
        onConfirm={() => {
          deleteSessionMutation.mutate(activeSession.id);
          setShowDiscardModal(false);
        }}
        onCancel={() => setShowDiscardModal(false)}
        isPending={deleteSessionMutation.isPending}
      />

      <FocusReflectionModal
        isOpen={Boolean(reflectionSession)}
        onClose={() => setReflectionSession(null)}
        session={reflectionSession}
      />
    </div>
  );
}
