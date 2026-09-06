"use client";

import { motion } from "framer-motion";
import { User, Shield, Laptop, Database, ExternalLink } from "lucide-react";
import Link from "next/link";

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.05 } },
};
const item = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3 } },
};

export default function SettingsPage() {
  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="max-w-4xl space-y-8"
    >
      {/* Header */}
      <motion.div variants={item}>
        <h1 className="text-2xl font-semibold text-white">Settings</h1>
        <p className="text-sm text-slate-500 mt-1">
          Configure telemetry filters, privacy thresholds, and personal data
          exports.
        </p>
      </motion.div>

      <div className="space-y-4">
        {/* Account & Profile */}
        <motion.div
          variants={item}
          className="bg-[#111111] border border-white/[0.06] rounded-2xl p-6 space-y-4"
        >
          <div className="flex items-center gap-2.5">
            <User size={16} className="text-indigo-400" />
            <h3 className="text-sm font-semibold text-white">
              Personal Profile
            </h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div className="flex flex-col gap-1">
              <span className="text-slate-500">User Name</span>
              <span className="text-white font-medium">Prateek</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-slate-500">Account Tier</span>
              <span className="text-indigo-400 font-medium">
                Developer Edition (Local)
              </span>
            </div>
          </div>
        </motion.div>

        {/* Privacy & Telemetry */}
        <motion.div
          variants={item}
          className="bg-[#111111] border border-white/[0.06] rounded-2xl p-6 space-y-4"
        >
          <div className="flex items-center gap-2.5">
            <Shield size={16} className="text-indigo-400" />
            <h3 className="text-sm font-semibold text-white">
              Telemetry & Privacy
            </h3>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            ProductiveHix stores window titles locally and normalizes browser
            URLs to domain-only representations.
          </p>
          <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-400">
                Browser Title Anonymization
              </span>
              <span className="text-emerald-400 font-medium">Active</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">
                Ignored Windows (Private/Passwords)
              </span>
              <span className="text-emerald-400 font-medium">Filtered</span>
            </div>
          </div>
        </motion.div>

        {/* Devices Link */}
        <motion.div
          variants={item}
          className="bg-[#111111] border border-white/[0.06] rounded-2xl p-6 flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <Laptop size={18} className="text-indigo-400" />
            <div>
              <h3 className="text-sm font-semibold text-white">
                Devices & Diagnostics
              </h3>
              <p className="text-xs text-slate-400">
                Manage local ActivityWatch collectors and view technical streams.
              </p>
            </div>
          </div>
          <Link
            href="/devices"
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-white hover:bg-white/[0.06] transition-colors"
          >
            Open Devices <ExternalLink size={12} />
          </Link>
        </motion.div>

        {/* Data Storage */}
        <motion.div
          variants={item}
          className="bg-[#111111] border border-white/[0.06] rounded-2xl p-6 space-y-3"
        >
          <div className="flex items-center gap-2.5">
            <Database size={16} className="text-indigo-400" />
            <h3 className="text-sm font-semibold text-white">
              Storage & DuckDB
            </h3>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400">Local Database Path</span>
            <span className="font-mono text-slate-500">
              ProductiveHix/data/local.duckdb
            </span>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}
