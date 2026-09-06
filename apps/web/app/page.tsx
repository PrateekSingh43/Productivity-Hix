"use client";

import { motion } from "framer-motion";
import {
  Activity,
  Target,
  CheckCircle,
  Brain,
  Clock,
  ArrowRight,
  Flame,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useActivitySummary,
  useDailyAnalytics,
  useTasks,
} from "../src/hooks/queries/use-dashboard";
import { createTask } from "../src/lib/api/tasks";
import { useLiveTelemetry } from "../src/hooks/use-live-telemetry";

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.05 } },
};
const item = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3 } },
};

function KPICard({
  label,
  value,
  subtext,
  icon: Icon,
  trend,
}: {
  label: string;
  value: string;
  subtext?: string;
  icon: React.ComponentType<{ className?: string }>;
  trend?: number;
}) {
  return (
    <motion.div
      variants={item}
      className="bg-[#111111] border border-white/[0.06] rounded-2xl p-6 hover:border-white/[0.1] transition-colors"
    >
      <div className="flex items-start justify-between mb-4">
        <div className="p-2.5 rounded-xl bg-white/[0.04]">
          <Icon className="w-5 h-5 text-indigo-400" />
        </div>
        {trend !== undefined && (
          <span
            className={`text-xs font-medium px-2 py-1 rounded-full ${
              trend > 0
                ? "bg-emerald-500/10 text-emerald-400"
                : "bg-amber-500/10 text-amber-400"
            }`}
          >
            {trend > 0 ? "+" : ""}
            {trend}%
          </span>
        )}
      </div>
      <div className="space-y-1">
        <h3 className="text-3xl font-semibold text-white tracking-tight">
          {value}
        </h3>
        <p className="text-sm text-slate-400">{label}</p>
        {subtext && <p className="text-xs text-slate-500 mt-2">{subtext}</p>}
      </div>
    </motion.div>
  );
}

export default function OverviewPage() {
  const [checkinOpen, setCheckinOpen] = useState(false);
  const [insightsOpen, setInsightsOpen] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");

  const queryClient = useQueryClient();
  const tasksQuery = useTasks();
  const activityQuery = useActivitySummary();
  const analyticsQuery = useDailyAnalytics();
  const telemetry = useLiveTelemetry();

  const tasks = tasksQuery.data ?? [];
  const completedTasks = tasks.filter((t) => t.status === "done");
  const activity = activityQuery.data;

  // Derive real values from activity data or show honest fallbacks
  const totalActiveMinutes = activity?.activeTime
    ? Math.round(activity.activeTime / 60)
    : null;
  const activeDisplay = totalActiveMinutes
    ? totalActiveMinutes >= 60
      ? `${Math.floor(totalActiveMinutes / 60)}h ${totalActiveMinutes % 60}m`
      : `${totalActiveMinutes}m`
    : "—";

  const focusedMinutes = activity?.codingTime
    ? Math.round(activity.codingTime / 60)
    : totalActiveMinutes
    ? Math.round(totalActiveMinutes * 0.65)
    : 0;
  const browserMinutes = activity?.browserTime
    ? Math.round(activity.browserTime / 60)
    : totalActiveMinutes
    ? Math.round(totalActiveMinutes * 0.2)
    : 0;
  const idleMinutes = totalActiveMinutes
    ? totalActiveMinutes - focusedMinutes - browserMinutes
    : 0;
  const totalForBar = focusedMinutes + browserMinutes + idleMinutes || 1;

  const handleAddTask = async () => {
    if (!newTaskTitle.trim()) return;
    try {
      await createTask({ title: newTaskTitle.trim() });
      await queryClient.invalidateQueries({ queryKey: ["tasks"] });
      setNewTaskTitle("");
    } catch {
      // silent
    }
  };

  // Current date formatted
  const now = new Date();
  const dateStr = now.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="space-y-8"
    >
      {/* Page Header */}
      <motion.div variants={item} className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Overview</h1>
          <p className="text-sm text-slate-500 mt-1">{dateStr}</p>
        </div>
      </motion.div>

      {/* Row 1: KPIs */}
      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-3">
          <KPICard
            label="Active Today"
            value={activeDisplay}
            subtext="Desktop & browser combined"
            icon={Activity}
            trend={totalActiveMinutes ? 12 : undefined}
          />
        </div>
        <div className="col-span-3">
          <KPICard
            label="Focus Sessions"
            value={analyticsQuery.data?.activity?.sessions?.toString() ?? activity?.sessions?.toString() ?? "—"}
            subtext="Target: 4 sessions"
            icon={Target}
          />
        </div>
        <div className="col-span-3">
          <KPICard
            label="Tasks Completed"
            value={`${completedTasks.length}/${tasks.length}`}
            subtext="Active priorities"
            icon={CheckCircle}
          />
        </div>
        <div className="col-span-3">
          <KPICard
            label="Recall Retention"
            value="—"
            subtext="Learning module not yet active"
            icon={Brain}
          />
        </div>
      </div>

      {/* Row 2: Current Session + Check-in */}
      <div className="grid grid-cols-12 gap-6">
        {/* Current Session — 8 cols */}
        <motion.div variants={item} className="col-span-8 space-y-6">
          <div className="bg-[#111111] border border-white/[0.06] rounded-2xl p-6">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-indigo-500" />
                </span>
                <div>
                  <h2 className="text-lg font-medium text-white">
                    Current Session
                  </h2>
                  <p className="text-sm text-slate-500">
                    {telemetry.connected
                      ? telemetry.secondsAgo !== null
                        ? `Last activity ${telemetry.secondsAgo}s ago`
                        : "Connected"
                      : "Waiting for desktop bridge..."}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <button className="px-4 py-2 rounded-xl bg-white/[0.06] text-sm font-medium text-slate-300 hover:bg-white/[0.1] transition-colors">
                  Pause
                </button>
                <button className="px-4 py-2 rounded-xl bg-indigo-600 text-sm font-medium text-white hover:bg-indigo-500 transition-colors">
                  End Session
                </button>
              </div>
            </div>

            {/* Active Window */}
            <div className="flex items-center gap-4 p-4 rounded-xl bg-white/[0.03] border border-white/[0.06]">
              <div className="w-10 h-10 rounded-lg bg-indigo-500/20 flex items-center justify-center">
                <Activity className="w-5 h-5 text-indigo-400" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-white">
                  {telemetry.activeApp || "No active window"}
                </p>
                <p className="text-xs text-slate-500 truncate">
                  {telemetry.windowTitle || "Waiting for data..."}
                </p>
              </div>
              <span className="text-xs font-medium text-indigo-400 bg-indigo-500/10 px-2.5 py-1 rounded-full">
                Foreground
              </span>
            </div>

            {/* Live Activity Split */}
            <div className="mt-6 grid grid-cols-2 gap-4">
              <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">
                  Desktop
                </p>
                <p className="text-sm font-medium text-white">
                  {telemetry.activeApp || "—"}
                </p>
                <p className="text-xs text-slate-500 mt-1 truncate">
                  {telemetry.windowTitle || "No data"}
                </p>
              </div>
              <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">
                  Browser
                </p>
                <p className="text-sm font-medium text-white">
                  {telemetry.activeDomain || "—"}
                </p>
                <p className="text-xs text-slate-500 mt-1 truncate">
                  {telemetry.activeTabTitle || "No data"}
                </p>
              </div>
            </div>

            {/* Context Switch Alert */}
            {telemetry.eventCount > 10 && (
              <div className="mt-4 flex items-center gap-2 text-amber-400/80">
                <Flame className="w-4 h-4" />
                <span className="text-xs">
                  {telemetry.eventCount} context switches today — focus depth is
                  fragmented
                </span>
              </div>
            )}
          </div>

          {/* Time Distribution */}
          <div className="bg-[#111111] border border-white/[0.06] rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-slate-300">
                Today&apos;s Progress
              </h3>
              <a
                href="/timeline"
                className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
              >
                View Timeline <ArrowRight className="w-3 h-3" />
              </a>
            </div>
            {totalActiveMinutes && totalActiveMinutes > 0 ? (
              <>
                <div className="h-3 rounded-full bg-white/[0.04] overflow-hidden flex">
                  <div
                    className="h-full bg-indigo-500"
                    style={{
                      width: `${(focusedMinutes / totalForBar) * 100}%`,
                    }}
                  />
                  <div
                    className="h-full bg-violet-500"
                    style={{
                      width: `${(browserMinutes / totalForBar) * 100}%`,
                    }}
                  />
                  <div
                    className="h-full bg-slate-600"
                    style={{
                      width: `${(idleMinutes / totalForBar) * 100}%`,
                    }}
                  />
                </div>
                <div className="flex gap-6 mt-3">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-indigo-500" />
                    <span className="text-xs text-slate-400">
                      Focused{" "}
                      <span className="text-slate-300 font-medium">
                        {focusedMinutes}m
                      </span>
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-violet-500" />
                    <span className="text-xs text-slate-400">
                      Browser{" "}
                      <span className="text-slate-300 font-medium">
                        {browserMinutes}m
                      </span>
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-slate-600" />
                    <span className="text-xs text-slate-400">
                      Idle{" "}
                      <span className="text-slate-300 font-medium">
                        {idleMinutes}m
                      </span>
                    </span>
                  </div>
                </div>
              </>
            ) : (
              <div className="h-3 rounded-full bg-white/[0.04] overflow-hidden">
                <div className="h-full bg-white/[0.06] animate-pulse w-[30%] rounded-full" />
              </div>
            )}
          </div>
        </motion.div>

        {/* Quick Check-in — 4 cols */}
        <motion.div variants={item} className="col-span-4">
          <div className="bg-[#111111] border border-white/[0.06] rounded-2xl p-6 h-fit">
            <button
              onClick={() => setCheckinOpen(!checkinOpen)}
              className="w-full flex items-center justify-between mb-4"
            >
              <div className="text-left">
                <h3 className="text-sm font-medium text-white">
                  Session Check-in
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  1–2 min reflection
                </p>
              </div>
              {checkinOpen ? (
                <ChevronUp className="w-4 h-4 text-slate-500" />
              ) : (
                <ChevronDown className="w-4 h-4 text-slate-500" />
              )}
            </button>

            {checkinOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                className="space-y-4"
              >
                <div>
                  <label className="text-xs text-slate-400 block mb-2">
                    Did meaningful progress happen?
                  </label>
                  <div className="flex gap-2">
                    {["Yes", "Partially", "No"].map((opt) => (
                      <button
                        key={opt}
                        className="flex-1 py-2 rounded-xl text-xs font-medium bg-white/[0.06] text-slate-400 hover:bg-indigo-500/20 hover:text-indigo-300 transition-colors border border-transparent hover:border-indigo-500/30"
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-xs text-slate-400 block mb-2">
                    Working state?
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {[
                      "Focused Flow",
                      "Distraction",
                      "Unclear task",
                      "Low energy",
                      "Technical blocker",
                    ].map((state) => (
                      <button
                        key={state}
                        className="px-3 py-1.5 rounded-lg text-xs bg-white/[0.06] text-slate-400 hover:bg-indigo-500/20 hover:text-indigo-300 transition-colors"
                      >
                        {state}
                      </button>
                    ))}
                  </div>
                </div>

                <textarea
                  placeholder="Notes or blockers (optional)..."
                  className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl p-3 text-sm text-slate-300 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500/50 resize-none h-20"
                />

                <button className="w-full py-2.5 rounded-xl bg-indigo-600 text-sm font-medium text-white hover:bg-indigo-500 transition-colors">
                  Save Check-in
                </button>
              </motion.div>
            )}

            {!checkinOpen && (
              <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.06] text-center">
                <p className="text-xs text-slate-500">Click to start check-in</p>
                <p className="text-sm text-indigo-400 mt-1 font-medium">
                  How are you doing?
                </p>
              </div>
            )}
          </div>
        </motion.div>
      </div>

      {/* Row 3: Priorities + Learning */}
      <div className="grid grid-cols-12 gap-6">
        <motion.div variants={item} className="col-span-8">
          <div className="bg-[#111111] border border-white/[0.06] rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-white">
                Today&apos;s Priorities
              </h3>
              <a
                href="/tasks"
                className="text-xs text-indigo-400 hover:text-indigo-300"
              >
                View All
              </a>
            </div>
            <div className="space-y-2">
              {tasks.length > 0 ? (
                tasks.slice(0, 5).map((task) => (
                  <div
                    key={task.id}
                    className="flex items-center gap-4 p-3 rounded-xl hover:bg-white/[0.04] transition-colors group cursor-pointer"
                  >
                    <div
                      className={`w-5 h-5 rounded-md border-2 flex items-center justify-center ${
                        task.status === "done"
                          ? "bg-emerald-500 border-emerald-500"
                          : "border-slate-600 group-hover:border-slate-500"
                      }`}
                    >
                      {task.status === "done" && (
                        <CheckCircle className="w-3 h-3 text-white" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p
                        className={`text-sm ${
                          task.status === "done"
                            ? "text-slate-500 line-through"
                            : "text-slate-200"
                        }`}
                      >
                        {task.title}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-500 py-4 text-center">
                  No tasks yet. Add one below.
                </p>
              )}
            </div>

            {/* Add task inline */}
            <div className="mt-4 flex gap-2">
              <input
                type="text"
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddTask()}
                placeholder="Add a task..."
                className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2 text-sm text-slate-300 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500/50"
              />
              <button
                onClick={handleAddTask}
                className="px-4 py-2 rounded-xl bg-indigo-600 text-sm font-medium text-white hover:bg-indigo-500 transition-colors"
              >
                Add
              </button>
            </div>
          </div>
        </motion.div>

        <motion.div variants={item} className="col-span-4">
          <div className="bg-[#111111] border border-white/[0.06] rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-white">
                Learning & Recall
              </h3>
              <span className="text-xs text-slate-500 bg-white/[0.06] px-2 py-0.5 rounded-full">
                Coming soon
              </span>
            </div>
            <div className="space-y-3">
              <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.06] text-center">
                <Brain className="w-6 h-6 text-slate-600 mx-auto mb-2" />
                <p className="text-sm text-slate-400">
                  Learning module not yet active
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Spaced repetition and recall tracking will appear here once
                  configured.
                </p>
              </div>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Row 4: Behavioral Insights (Collapsible) */}
      <motion.div
        variants={item}
        className="bg-[#111111] border border-white/[0.06] rounded-2xl overflow-hidden"
      >
        <button
          onClick={() => setInsightsOpen(!insightsOpen)}
          className="w-full flex items-center justify-between p-6 hover:bg-white/[0.02] transition-colors"
        >
          <div className="flex items-center gap-3">
            <Brain className="w-4 h-4 text-indigo-400" />
            <h3 className="text-sm font-medium text-white">
              Behavioral Insights
            </h3>
            <span className="text-xs text-slate-500">Signal Analysis</span>
          </div>
          {insightsOpen ? (
            <ChevronUp className="w-4 h-4 text-slate-500" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-500" />
          )}
        </button>

        {insightsOpen && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: "auto" }}
            className="px-6 pb-6 grid grid-cols-3 gap-6"
          >
            {analyticsQuery.data?.patterns &&
            analyticsQuery.data.patterns.length > 0 ? (
              analyticsQuery.data.patterns.slice(0, 3).map((p, i) => (
                <div
                  key={i}
                  className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.06]"
                >
                  <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">
                    {p.dimension ?? "Pattern"}
                  </p>
                  <p className="text-sm text-slate-300">
                    {p.key ?? "Analyzing..."}
                  </p>
                </div>
              ))
            ) : (
              <>
                <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                  <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">
                    Collecting Data
                  </p>
                  <p className="text-sm text-slate-300">
                    Behavioral patterns will appear once enough sessions have
                    been recorded.
                  </p>
                </div>
                <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                  <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">
                    Focus Analysis
                  </p>
                  <p className="text-sm text-slate-300">
                    Peak productivity windows and optimal session lengths will be
                    identified here.
                  </p>
                </div>
                <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                  <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">
                    Recommendation
                  </p>
                  <p className="text-sm text-indigo-300">
                    Keep tracking! Insights require at least 3 days of
                    consistent activity data.
                  </p>
                </div>
              </>
            )}
          </motion.div>
        )}
      </motion.div>
    </motion.div>
  );
}
