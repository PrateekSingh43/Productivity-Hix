"use client";

import { motion } from "framer-motion";
import { Compass, Sparkles, ArrowRight } from "lucide-react";
import Link from "next/link";

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.06 } },
};
const item = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35 } },
};

interface BaselinePlaceholderProps {
  title: string;
  subtitle: string;
  concept: string;
  metricsNeeded?: string;
  previewItems?: Array<{ label: string; value: string }>;
}

export function BaselinePlaceholder({
  title,
  subtitle,
  concept,
  metricsNeeded = "3–5 days of active focus sessions",
  previewItems = [],
}: BaselinePlaceholderProps) {
  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="space-y-8"
    >
      {/* Header */}
      <motion.div variants={item}>
        <h1 className="text-2xl font-semibold text-white">{title}</h1>
        <p className="text-sm text-slate-500 mt-1">{subtitle}</p>
      </motion.div>

      {/* Main Baseline Card */}
      <motion.div
        variants={item}
        className="bg-[#111111] border border-white/[0.06] rounded-2xl p-8 space-y-6 relative overflow-hidden"
      >
        <div className="pointer-events-none absolute -right-12 -top-12 h-48 w-48 rounded-full bg-indigo-500/5 blur-2xl" />

        <div className="flex items-center gap-3 relative">
          <div className="h-9 w-9 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 flex items-center justify-center">
            <Compass size={18} />
          </div>
          <div>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-indigo-400">
              Personal Operating System
            </span>
            <h2 className="text-lg font-semibold tracking-tight text-white">
              Building Your {title} Baseline
            </h2>
          </div>
        </div>

        <p className="text-sm text-slate-400 leading-relaxed max-w-2xl">
          {concept} ProductiveHix analyzes your desktop focus and
          self-reflections to construct this view without fabricating synthetic
          metrics.
        </p>

        {/* Current Status */}
        <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-4 space-y-3">
          <div className="flex items-center justify-between text-xs font-semibold text-white">
            <span className="flex items-center gap-1.5">
              <Sparkles size={13} className="text-indigo-400" /> Data Signal
              Collection
            </span>
            <span className="text-[10px] text-slate-500">In Progress</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 text-xs">
            <div className="flex flex-col">
              <span className="text-slate-500 text-[11px]">Requirement</span>
              <span className="text-white font-medium mt-0.5">
                {metricsNeeded}
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-slate-500 text-[11px]">
                Current Tracked
              </span>
              <span className="text-white font-medium mt-0.5">
                Today active
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-slate-500 text-[11px]">Verification</span>
              <span className="text-emerald-400 font-medium mt-0.5">
                Desktop bridge active
              </span>
            </div>
          </div>
        </div>

        {/* Preview metrics */}
        {previewItems.length > 0 && (
          <div className="pt-2 border-t border-white/[0.06] space-y-2">
            <span className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
              Preview Metrics Model
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {previewItems.map((pi, idx) => (
                <div
                  key={idx}
                  className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]"
                >
                  <span className="text-[11px] text-slate-500">{pi.label}</span>
                  <p className="text-xs font-semibold text-white mt-0.5">
                    {pi.value}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="pt-2 flex items-center gap-3">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-medium text-white hover:bg-indigo-500 transition-colors"
          >
            Back to Overview <ArrowRight size={12} />
          </Link>
          <Link
            href="/timeline"
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs font-medium text-slate-400 hover:text-white transition-colors"
          >
            Inspect Timeline
          </Link>
        </div>
      </motion.div>
    </motion.div>
  );
}
