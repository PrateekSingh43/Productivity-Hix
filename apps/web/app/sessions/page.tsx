"use client";

import { motion } from "framer-motion";
import {
  Clock,
  TrendingUp,
  Monitor,
  ArrowUpRight,
  ArrowDownRight,
  Zap,
} from "lucide-react";
import React from "react";

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.05 } },
};
const item = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3 } },
};

function Sparkline({ data, color }: { data: number[]; color: string }) {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const points = data
    .map((d, i) => {
      const x = (i / (data.length - 1)) * 100;
      const y = 100 - ((d - min) / range) * 100;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="h-12 w-full opacity-60"
    >
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="2"
        points={points}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

const sessionHistory = [
  { date: "Sep 4", focusTime: "3h 12m", sessions: 4, contextSwitches: 8, depth: "High" as const },
  { date: "Sep 3", focusTime: "2h 45m", sessions: 3, contextSwitches: 12, depth: "Medium" as const },
  { date: "Sep 2", focusTime: "4h 01m", sessions: 5, contextSwitches: 5, depth: "High" as const },
  { date: "Sep 1", focusTime: "1h 30m", sessions: 2, contextSwitches: 15, depth: "Low" as const },
  { date: "Aug 31", focusTime: "3h 50m", sessions: 4, contextSwitches: 7, depth: "High" as const },
  { date: "Aug 30", focusTime: "2h 10m", sessions: 3, contextSwitches: 10, depth: "Medium" as const },
  { date: "Aug 29", focusTime: "3h 22m", sessions: 4, contextSwitches: 6, depth: "High" as const },
];

const heatmapData = [
  { hour: "06:00", values: [0, 0, 0, 0, 0, 0, 0] },
  { hour: "08:00", values: [2, 3, 1, 2, 0, 0, 0] },
  { hour: "10:00", values: [4, 5, 4, 5, 3, 2, 0] },
  { hour: "12:00", values: [3, 2, 3, 2, 4, 1, 0] },
  { hour: "14:00", values: [4, 4, 5, 4, 3, 0, 0] },
  { hour: "16:00", values: [2, 1, 2, 1, 2, 0, 0] },
  { hour: "18:00", values: [1, 0, 1, 0, 1, 0, 0] },
  { hour: "20:00", values: [0, 0, 0, 0, 0, 0, 0] },
];

const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function HeatmapCell({ value }: { value: number }) {
  const intensity =
    value === 0
      ? "bg-white/[0.02]"
      : value === 1
      ? "bg-indigo-500/10"
      : value === 2
      ? "bg-indigo-500/20"
      : value === 3
      ? "bg-indigo-500/30"
      : value === 4
      ? "bg-indigo-500/50"
      : "bg-indigo-500/70";

  return (
    <div
      className={`w-full aspect-square rounded-md ${intensity} transition-colors hover:ring-2 hover:ring-indigo-400/50`}
    />
  );
}

const depthColors = {
  High: "bg-emerald-500/10 text-emerald-400",
  Medium: "bg-amber-500/10 text-amber-400",
  Low: "bg-red-500/10 text-red-400",
};

export default function SessionsPage() {
  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="space-y-8"
    >
      {/* Header */}
      <motion.div variants={item} className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Sessions</h1>
          <p className="text-sm text-slate-500 mt-1">
            Intention → Behavior → Outcome
          </p>
        </div>
      </motion.div>

      {/* Hero Card */}
      <motion.div
        variants={item}
        className="bg-[#111111] border border-white/[0.06] rounded-2xl p-8 relative overflow-hidden"
      >
        <div className="absolute top-0 right-0 w-64 h-64 bg-violet-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
        <div className="relative flex items-center gap-3 mb-4">
          <div className="p-2 rounded-xl bg-violet-500/10 border border-violet-500/20">
            <Zap className="w-5 h-5 text-violet-400" />
          </div>
          <div>
            <p className="text-xs font-medium text-violet-400 uppercase tracking-wider">
              Personal Operating System
            </p>
            <h2 className="text-xl font-semibold text-white mt-0.5">
              Building Your Sessions Baseline
            </h2>
          </div>
        </div>
        <p className="text-sm text-slate-400 max-w-2xl leading-relaxed">
          Deep dives into each focused block, showing the original declared
          intent, observed window telemetry, self-reported blockers, and
          resulting output.
        </p>
      </motion.div>

      {/* Row 1: KPI Cards with Sparklines */}
      <div className="grid grid-cols-12 gap-6">
        <motion.div variants={item} className="col-span-4">
          <div className="bg-[#111111] border border-white/[0.06] rounded-2xl p-6 hover:border-white/[0.1] transition-colors">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-white/[0.04]">
                  <Clock className="w-4 h-4 text-indigo-400" />
                </div>
                <span className="text-sm text-slate-400">Avg Focus Block</span>
              </div>
              <span className="text-xs text-emerald-400 flex items-center gap-1">
                <ArrowUpRight className="w-3 h-3" /> 12%
              </span>
            </div>
            <h3 className="text-3xl font-semibold text-white mb-3">52m</h3>
            <Sparkline
              data={[30, 45, 52, 48, 55, 52, 58]}
              color="#6366f1"
            />
          </div>
        </motion.div>

        <motion.div variants={item} className="col-span-4">
          <div className="bg-[#111111] border border-white/[0.06] rounded-2xl p-6 hover:border-white/[0.1] transition-colors">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-white/[0.04]">
                  <TrendingUp className="w-4 h-4 text-violet-400" />
                </div>
                <span className="text-sm text-slate-400">
                  Longest Deep Flow
                </span>
              </div>
              <span className="text-xs text-emerald-400 flex items-center gap-1">
                <ArrowUpRight className="w-3 h-3" /> 8%
              </span>
            </div>
            <h3 className="text-3xl font-semibold text-white mb-3">1h 40m</h3>
            <Sparkline
              data={[60, 75, 90, 85, 100, 95, 100]}
              color="#8b5cf6"
            />
          </div>
        </motion.div>

        <motion.div variants={item} className="col-span-4">
          <div className="bg-[#111111] border border-white/[0.06] rounded-2xl p-6 hover:border-white/[0.1] transition-colors">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-white/[0.04]">
                  <Monitor className="w-4 h-4 text-amber-400" />
                </div>
                <span className="text-sm text-slate-400">Frequent Context</span>
              </div>
              <span className="text-xs text-amber-400 flex items-center gap-1">
                <ArrowDownRight className="w-3 h-3" /> 5%
              </span>
            </div>
            <h3 className="text-3xl font-semibold text-white mb-1">
              VS Code & Terminal
            </h3>
            <p className="text-xs text-slate-500 mb-3">
              Most common app pairing
            </p>
            <Sparkline data={[8, 7, 9, 6, 8, 7, 6]} color="#f59e0b" />
          </div>
        </motion.div>
      </div>

      {/* Row 2: Session History + Context Analysis */}
      <div className="grid grid-cols-12 gap-6">
        <motion.div variants={item} className="col-span-8">
          <div className="bg-[#111111] border border-white/[0.06] rounded-2xl p-6">
            <h3 className="text-sm font-medium text-white mb-4">
              Session History
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left border-b border-white/[0.06]">
                    <th className="pb-3 text-xs font-medium text-slate-500 uppercase tracking-wider">
                      Date
                    </th>
                    <th className="pb-3 text-xs font-medium text-slate-500 uppercase tracking-wider">
                      Focus Time
                    </th>
                    <th className="pb-3 text-xs font-medium text-slate-500 uppercase tracking-wider">
                      Sessions
                    </th>
                    <th className="pb-3 text-xs font-medium text-slate-500 uppercase tracking-wider">
                      Switches
                    </th>
                    <th className="pb-3 text-xs font-medium text-slate-500 uppercase tracking-wider">
                      Depth
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {sessionHistory.map((row, i) => (
                    <tr
                      key={i}
                      className="hover:bg-white/[0.02] transition-colors"
                    >
                      <td className="py-3 text-sm text-slate-300 font-medium">
                        {row.date}
                      </td>
                      <td className="py-3 text-sm text-slate-400">
                        {row.focusTime}
                      </td>
                      <td className="py-3 text-sm text-slate-400">
                        {row.sessions}
                      </td>
                      <td className="py-3 text-sm text-slate-400">
                        {row.contextSwitches}
                      </td>
                      <td className="py-3">
                        <span
                          className={`text-[10px] font-medium px-2 py-1 rounded-full ${depthColors[row.depth]}`}
                        >
                          {row.depth}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </motion.div>

        <motion.div variants={item} className="col-span-4">
          <div className="bg-[#111111] border border-white/[0.06] rounded-2xl p-6">
            <h3 className="text-sm font-medium text-white mb-4">
              Context Switch Analysis
            </h3>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-xs mb-2">
                  <span className="text-slate-400">App switching</span>
                  <span className="text-slate-300">14 today</span>
                </div>
                <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden">
                  <div className="h-full bg-amber-500 rounded-full w-[70%]" />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-xs mb-2">
                  <span className="text-slate-400">Domain switching</span>
                  <span className="text-slate-300">8 today</span>
                </div>
                <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden">
                  <div className="h-full bg-violet-500 rounded-full w-[45%]" />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-xs mb-2">
                  <span className="text-slate-400">Window switching</span>
                  <span className="text-slate-300">22 today</span>
                </div>
                <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden">
                  <div className="h-full bg-red-500 rounded-full w-[85%]" />
                </div>
              </div>
            </div>
            <div className="mt-6 p-4 rounded-xl bg-amber-500/5 border border-amber-500/10">
              <p className="text-xs text-amber-400/80 leading-relaxed">
                <strong className="text-amber-400">Pattern detected:</strong>{" "}
                Window switching is 2.3x higher on days with &ldquo;Unclear
                task&rdquo; self-reports.
              </p>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Row 3: Weekly Heatmap */}
      <motion.div
        variants={item}
        className="bg-[#111111] border border-white/[0.06] rounded-2xl p-6"
      >
        <h3 className="text-sm font-medium text-white mb-4">
          Weekly Focus Heatmap
        </h3>
        <div className="overflow-x-auto">
          <div className="min-w-[600px]">
            <div className="grid grid-cols-8 gap-2">
              <div className="text-xs text-slate-600 font-medium pb-2">
                Hour
              </div>
              {days.map((d) => (
                <div
                  key={d}
                  className="text-xs text-slate-600 font-medium text-center pb-2"
                >
                  {d}
                </div>
              ))}
              {heatmapData.map((row, i) => (
                <React.Fragment key={i}>
                  <div className="text-xs text-slate-500 py-1">{row.hour}</div>
                  {row.values.map((v, j) => (
                    <HeatmapCell key={`${i}-${j}`} value={v} />
                  ))}
                </React.Fragment>
              ))}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4 mt-4 justify-end">
          <span className="text-xs text-slate-600">Less</span>
          <div className="flex gap-1">
            {[0, 1, 2, 3, 4, 5].map((v) => (
              <div key={v} className="w-4 h-4">
                <HeatmapCell value={v} />
              </div>
            ))}
          </div>
          <span className="text-xs text-slate-600">More</span>
        </div>
      </motion.div>
    </motion.div>
  );
}
