"use client";

import { motion } from "framer-motion";
import {
  Calendar,
  Activity,
  Target,
  CheckCircle,
  Zap,
} from "lucide-react";
import { useLiveTelemetry } from "../../src/hooks/use-live-telemetry";

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.06 } },
};
const item = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35 } },
};

const timeBlocks = [
  { time: "09:00", label: "Deep Work", app: "VS Code", type: "focus", actual: true },
  { time: "10:30", label: "Documentation", app: "Browser", type: "research", actual: true },
  { time: "12:00", label: "Break", app: null, type: "rest", actual: false },
  { time: "13:00", label: "Implementation", app: "VS Code", type: "focus", actual: false },
  { time: "15:00", label: "Review", app: "ProductiveHix", type: "meta", actual: false },
];

export default function TodayPage() {
  const telemetry = useLiveTelemetry();

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
          <h1 className="text-2xl font-semibold text-white">Today</h1>
          <p className="text-sm text-slate-500 mt-1">Daily Focus Summary</p>
        </div>
      </motion.div>

      {/* Hero: Daily Flow Strip */}
      <motion.div
        variants={item}
        className="bg-[#111111] border border-white/[0.06] rounded-2xl p-8 relative overflow-hidden"
      >
        <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />

        <div className="relative">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20">
              <Zap className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <p className="text-xs font-medium text-indigo-400 uppercase tracking-wider">
                Personal Operating System
              </p>
              <h2 className="text-xl font-semibold text-white mt-0.5">
                Building Your Today Baseline
              </h2>
            </div>
          </div>

          <p className="text-sm text-slate-400 max-w-2xl leading-relaxed mb-8">
            Provides a consolidated breakdown of today&apos;s intentions, focus
            sessions, context switches, and completed outcomes. ProductiveHix
            analyzes your desktop focus and self-reflections to construct this
            view without fabricating synthetic metrics.
          </p>

          {/* Horizontal Time Strip */}
          <div className="flex items-center gap-1">
            {timeBlocks.map((block, i) => (
              <div key={i} className="flex-1 group cursor-pointer">
                <div
                  className={`h-2 rounded-full mb-2 transition-all ${
                    block.actual
                      ? block.type === "focus"
                        ? "bg-indigo-500"
                        : "bg-violet-500"
                      : "bg-white/[0.06] group-hover:bg-white/[0.1]"
                  }`}
                />
                <p className="text-[10px] text-slate-500 group-hover:text-slate-300 transition-colors">
                  {block.time}
                </p>
                <p className="text-[10px] text-slate-600 group-hover:text-slate-400 transition-colors truncate">
                  {block.label}
                </p>
              </div>
            ))}
          </div>
        </div>
      </motion.div>

      {/* Main Grid */}
      <div className="grid grid-cols-12 gap-6">
        {/* Session Plan — 7 cols */}
        <motion.div
          variants={item}
          className="col-span-7 bg-[#111111] border border-white/[0.06] rounded-2xl p-6"
        >
          <h3 className="text-sm font-medium text-white mb-4">
            Planned Sessions
          </h3>
          <div className="space-y-3">
            {timeBlocks.map((block, i) => (
              <div
                key={i}
                className="flex items-center gap-4 p-3 rounded-xl hover:bg-white/[0.04] transition-colors group"
              >
                <div
                  className={`w-1 h-8 rounded-full ${
                    block.type === "focus"
                      ? "bg-indigo-500"
                      : block.type === "research"
                      ? "bg-violet-500"
                      : block.type === "rest"
                      ? "bg-slate-600"
                      : "bg-amber-500"
                  }`}
                />
                <div className="w-14 text-xs text-slate-500 font-mono">
                  {block.time}
                </div>
                <div className="flex-1">
                  <p className="text-sm text-slate-200">{block.label}</p>
                  {block.app && (
                    <p className="text-xs text-slate-500">{block.app}</p>
                  )}
                </div>
                {block.actual ? (
                  <span className="text-[10px] font-medium text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded-full">
                    Done
                  </span>
                ) : (
                  <span className="text-[10px] font-medium text-slate-500 bg-white/[0.06] px-2 py-1 rounded-full">
                    Planned
                  </span>
                )}
              </div>
            ))}
          </div>
        </motion.div>

        {/* Metrics Preview — 5 cols */}
        <motion.div variants={item} className="col-span-5 space-y-6">
          <div className="bg-[#111111] border border-white/[0.06] rounded-2xl p-6">
            <h3 className="text-sm font-medium text-white mb-4">
              Preview Metrics
            </h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                <div className="flex items-center gap-3">
                  <Target className="w-4 h-4 text-indigo-400" />
                  <span className="text-sm text-slate-300">
                    Target Sessions
                  </span>
                </div>
                <span className="text-lg font-semibold text-white">
                  4{" "}
                  <span className="text-sm text-slate-500 font-normal">
                    blocks
                  </span>
                </span>
              </div>
              <div className="flex items-center justify-between p-4 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                <div className="flex items-center gap-3">
                  <CheckCircle className="w-4 h-4 text-emerald-400" />
                  <span className="text-sm text-slate-300">Planned Tasks</span>
                </div>
                <span className="text-lg font-semibold text-white">
                  3{" "}
                  <span className="text-sm text-slate-500 font-normal">
                    priorities
                  </span>
                </span>
              </div>
              <div className="flex items-center justify-between p-4 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                <div className="flex items-center gap-3">
                  <Activity className="w-4 h-4 text-violet-400" />
                  <span className="text-sm text-slate-300">
                    Current Focus Depth
                  </span>
                </div>
                <span className="text-lg font-semibold text-white">
                  {telemetry.connected ? "Active" : "—"}{" "}
                  <span className="text-sm text-slate-500 font-normal">
                    {telemetry.connected ? "tracking" : "offline"}
                  </span>
                </span>
              </div>
            </div>
          </div>

          <div className="bg-[#111111] border border-white/[0.06] rounded-2xl p-6">
            <h3 className="text-sm font-medium text-white mb-3">
              Data Signal Collection
            </h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500">
                  Daily session activity
                </span>
                <span
                  className={`text-xs font-medium ${
                    telemetry.connected
                      ? "text-emerald-400"
                      : "text-slate-500"
                  }`}
                >
                  {telemetry.connected ? "Today active" : "Waiting..."}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500">Verification</span>
                <span
                  className={`text-xs font-medium ${
                    telemetry.connected
                      ? "text-emerald-400"
                      : "text-slate-500"
                  }`}
                >
                  {telemetry.connected
                    ? "Desktop bridge active"
                    : "Not connected"}
                </span>
              </div>
            </div>
            <div className="mt-4 h-1 rounded-full bg-white/[0.06] overflow-hidden">
              <div
                className={`h-full rounded-full ${
                  telemetry.connected ? "bg-emerald-500 w-[75%]" : "bg-slate-600 w-[10%]"
                }`}
              />
            </div>
            <p className="text-[10px] text-slate-600 mt-2">
              {telemetry.connected
                ? "In Progress — syncing"
                : "Waiting for desktop bridge connection"}
            </p>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}
