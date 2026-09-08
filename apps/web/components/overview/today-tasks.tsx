"use client";

import { useState } from "react";
import { CheckCircle2, Circle, Plus } from "lucide-react";
import type { Task } from "@repo/types";
import Link from "next/link";

interface TodayTasksProps {
  tasks?: Task[];
  onToggleTask?: (taskId: string, currentStatus: string) => void;
  onAddTask?: (title: string) => void;
}

export function TodayTasks({ tasks = [], onToggleTask, onAddTask }: TodayTasksProps) {
  const [newTitle, setNewTitle] = useState("");
  const [isAdding, setIsAdding] = useState(false);

  const displayTasks: Array<{
    id: string;
    title: string;
    status: "todo" | "in_progress" | "done";
    priority: "high" | "medium" | "low";
    effort?: string;
  }> = tasks.length > 0
    ? tasks.map((t) => ({
        id: t.id,
        title: t.title,
        status: (t.status as "todo" | "in_progress" | "done") || "todo",
        priority: "medium",
        effort: "30m",
      }))
    : [
        {
          id: "task-1",
          title: "Finish React Query architecture & custom telemetry hooks",
          status: "done",
          priority: "high",
          effort: "45m",
        },
        {
          id: "task-2",
          title: "Implement calm modern dashboard information hierarchy",
          status: "in_progress",
          priority: "high",
          effort: "1h 15m",
        },
        {
          id: "task-3",
          title: "Decouple ActivityWatch diagnostic UI into dedicated devices surface",
          status: "todo",
          priority: "medium",
          effort: "30m",
        },
      ];

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    onAddTask?.(newTitle.trim());
    setNewTitle("");
    setIsAdding(false);
  };

  return (
    <div className="rounded-[var(--radius-lg)] border border-[#232733] bg-[#111319] p-5 flex flex-col gap-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03)]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[#8f96a8]">
            Today's Priorities
          </span>
          <span className="text-[#4b5162]">•</span>
          <span className="text-xs text-[#9ca3af] font-medium">
            Intention & Execution
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsAdding(!isAdding)}
            className="inline-flex items-center gap-1 rounded-[var(--radius-sm)] border border-[#272b38] bg-[#161822] px-2.5 py-1 text-xs font-medium text-[#9ca3af] hover:text-[#f4f4f6] hover:border-[#383e50] transition-colors"
          >
            <Plus size={12} /> Add
          </button>
          <Link
            href="/tasks"
            className="text-xs text-[#6b7280] hover:text-[#707df7] transition-colors"
          >
            View All
          </Link>
        </div>
      </div>

      {/* Quick Add Input Bar */}
      {isAdding && (
        <form onSubmit={handleAddSubmit} className="flex gap-2">
          <input
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="What will you accomplish next?"
            className="flex-1 rounded-[var(--radius-sm)] border border-[#2e3444] bg-[#0c0d12] px-3 py-1.5 text-xs text-[#f4f4f6] outline-none focus:border-[#707df7] transition-colors"
            autoFocus
          />
          <button
            type="submit"
            disabled={!newTitle.trim()}
            className="rounded-[var(--radius-sm)] bg-[#707df7] px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            Create
          </button>
        </form>
      )}

      {/* Task List */}
      <div className="divide-y divide-[#1d212b] rounded-[var(--radius-md)] border border-[#1d212b] bg-[#0c0d12] overflow-hidden">
        {displayTasks.map((task) => {
          const isDone = task.status === "done";
          const isInProgress = task.status === "in_progress";

          return (
            <div
              key={task.id}
              className="flex items-center justify-between p-3 transition-colors hover:bg-[#151722] group cursor-pointer"
              onClick={() => onToggleTask?.(task.id, task.status)}
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <button
                  type="button"
                  className={`shrink-0 transition-colors ${
                    isDone
                      ? "text-emerald-400"
                      : isInProgress
                      ? "text-[#707df7]"
                      : "text-[#6b7280] group-hover:text-[#9ca3af]"
                  }`}
                >
                  {isDone ? (
                    <CheckCircle2 size={16} />
                  ) : (
                    <Circle size={16} />
                  )}
                </button>

                <div className="flex flex-col min-w-0">
                  <span
                    className={`text-xs font-medium truncate ${
                      isDone
                        ? "text-[#7e8597] opacity-75"
                        : "text-[#f4f4f6]"
                    }`}
                  >
                    {task.title}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0 ml-3">
                {task.effort && (
                  <span className="text-[10px] font-mono text-[#6b7280]">
                    {task.effort}
                  </span>
                )}
                {task.priority === "high" && (
                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-[var(--radius-sm)] bg-[#707df7]/15 text-[#707df7] border border-[#707df7]/25">
                    High
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
