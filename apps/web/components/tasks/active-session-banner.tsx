"use client";

import { useEffect, useState } from "react";
import { Play, Square, ExternalLink, Activity } from "lucide-react";
import type { Task, WorkSession } from "@repo/types";
import { useEndTaskSessionMutation } from "../../src/hooks/mutations/use-task-mutations";

interface ActiveSessionBannerProps {
  sessions: WorkSession[];
  tasks: Task[];
  onSelectTask?: (task: Task) => void;
}

export function ActiveSessionBanner({ sessions, tasks, onSelectTask }: ActiveSessionBannerProps) {
  const activeSession = sessions.find((s) => !s.endedAt);
  const endSessionMutation = useEndTaskSessionMutation();

  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    if (!activeSession) {
      setElapsedSeconds(0);
      return;
    }

    const startTimestamp = new Date(activeSession.startedAt).getTime();
    const updateElapsed = () => {
      const now = Date.now();
      const diff = Math.max(0, Math.floor((now - startTimestamp) / 1000));
      setElapsedSeconds(diff);
    };

    updateElapsed();
    const interval = setInterval(updateElapsed, 1000);
    return () => clearInterval(interval);
  }, [activeSession]);

  if (!activeSession) return null;

  const linkedTask = tasks.find((t) => t.id === activeSession.taskId);

  const formatTimer = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) {
      return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
    }
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div className="rounded-[var(--radius-lg)] border border-emerald-500/30 bg-gradient-to-r from-emerald-950/40 via-[#111319] to-[#111319] p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-[0_0_24px_rgba(16,185,129,0.08)] animate-in fade-in slide-in-from-top-2 duration-300">
      <div className="flex items-center gap-3.5 min-w-0">
        <div className="h-10 w-10 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
          <Activity size={18} className="animate-pulse" />
        </div>

        <div className="min-w-0 space-y-0.5">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[var(--radius-sm)] text-[10px] font-bold tracking-wider uppercase bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping" />
              Focus Session In Progress
            </span>
            <span className="text-xs text-[#6b7280]">
              {linkedTask ? "Linked to task" : "Ad-hoc session"}
            </span>
          </div>

          <h3 className="text-sm font-semibold text-[#f4f4f6] truncate max-w-md">
            {linkedTask ? linkedTask.title : "Active Focus Session"}
          </h3>
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0 self-end sm:self-auto">
        <div className="text-right">
          <div className="font-mono text-base sm:text-lg font-bold tracking-tight text-emerald-400">
            {formatTimer(elapsedSeconds)}
          </div>
          <span className="text-[10px] text-[#6b7280]">elapsed</span>
        </div>

        <div className="flex items-center gap-2">
          {linkedTask && onSelectTask && (
            <button
              onClick={() => onSelectTask(linkedTask)}
              className="inline-flex items-center gap-1 px-3 py-2 rounded-[var(--radius-sm)] border border-[#272b38] bg-[#161822] text-xs font-medium text-[#9ca3af] hover:text-[#f4f4f6] hover:border-[#383e50] transition-colors"
            >
              <ExternalLink size={13} />
              Details
            </button>
          )}

          <button
            onClick={() => endSessionMutation.mutate(activeSession.id)}
            disabled={endSessionMutation.isPending}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-[var(--radius-sm)] bg-red-500/20 border border-red-500/30 text-xs font-semibold text-red-400 hover:bg-red-500/30 hover:text-red-300 transition-colors disabled:opacity-50"
          >
            <Square size={13} />
            {endSessionMutation.isPending ? "Ending..." : "End Session"}
          </button>
        </div>
      </div>
    </div>
  );
}
