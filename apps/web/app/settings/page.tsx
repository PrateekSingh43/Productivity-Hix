"use client";

import { motion } from "framer-motion";
import { User, Shield, Laptop, Database, ExternalLink, Sun, Moon } from "lucide-react";
import Link from "next/link";
import { useTheme, type ThemeMode } from "../../src/lib/theme-provider";

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.05 } },
};
const item = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3 } },
};

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="max-w-4xl space-y-8"
    >
      {/* Header */}
      <motion.div variants={item}>
        <h1 className="text-2xl font-semibold text-text-primary tracking-tight">Settings</h1>
        <p className="text-sm text-text-secondary mt-1">
          Configure appearance, telemetry filters, privacy thresholds, and personal data exports.
        </p>
      </motion.div>

      <div className="space-y-4">
        {/* Appearance (Theme Switcher) */}
        <motion.div
          variants={item}
          className="bg-bg-card border border-border-subtle rounded-2xl p-6 space-y-4 shadow-xs"
        >
          <div className="flex items-center gap-2.5">
            <Sun size={16} className="text-accent-default" />
            <h3 className="text-sm font-semibold text-text-primary">Appearance</h3>
          </div>
          <p className="text-xs text-text-secondary">
            Select your preferred interface theme for ProductiveHix.
          </p>
          <div className="grid grid-cols-3 gap-2.5 max-w-sm">
            <button
              type="button"
              onClick={() => setTheme("light")}
              className={`flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl border text-xs font-medium transition-all ${
                theme === "light"
                  ? "border-accent-default bg-accent-subtle text-accent-default shadow-xs font-semibold"
                  : "border-border-default bg-bg-secondary text-text-secondary hover:text-text-primary hover:bg-bg-tertiary"
              }`}
            >
              <Sun size={14} /> Light
            </button>
            <button
              type="button"
              onClick={() => setTheme("dark")}
              className={`flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl border text-xs font-medium transition-all ${
                theme === "dark"
                  ? "border-accent-default bg-accent-subtle text-accent-default shadow-xs font-semibold"
                  : "border-border-default bg-bg-secondary text-text-secondary hover:text-text-primary hover:bg-bg-tertiary"
              }`}
            >
              <Moon size={14} /> Dark
            </button>
            <button
              type="button"
              onClick={() => setTheme("system")}
              className={`flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl border text-xs font-medium transition-all ${
                theme === "system"
                  ? "border-accent-default bg-accent-subtle text-accent-default shadow-xs font-semibold"
                  : "border-border-default bg-bg-secondary text-text-secondary hover:text-text-primary hover:bg-bg-tertiary"
              }`}
            >
              <Laptop size={14} /> System
            </button>
          </div>
        </motion.div>

        {/* Account & Profile */}
        <motion.div
          variants={item}
          className="bg-bg-card border border-border-subtle rounded-2xl p-6 space-y-4 shadow-xs"
        >
          <div className="flex items-center gap-2.5">
            <User size={16} className="text-accent-default" />
            <h3 className="text-sm font-semibold text-text-primary">
              Personal Profile
            </h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div className="flex flex-col gap-1">
              <span className="text-text-secondary">User Name</span>
              <span className="text-text-primary font-medium">Prateek</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-text-secondary">Account Tier</span>
              <span className="text-accent-default font-medium">
                Developer Edition (Local)
              </span>
            </div>
          </div>
        </motion.div>

        {/* Privacy & Telemetry */}
        <motion.div
          variants={item}
          className="bg-bg-card border border-border-subtle rounded-2xl p-6 space-y-4 shadow-xs"
        >
          <div className="flex items-center gap-2.5">
            <Shield size={16} className="text-accent-default" />
            <h3 className="text-sm font-semibold text-text-primary">
              Telemetry & Privacy
            </h3>
          </div>
          <p className="text-xs text-text-secondary leading-relaxed">
            ProductiveHix stores window titles locally and normalizes browser
            URLs to domain-only representations.
          </p>
          <div className="rounded-xl bg-bg-secondary border border-border-subtle p-3 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-text-secondary">
                Browser Title Anonymization
              </span>
              <span className="text-emerald-500 dark:text-emerald-400 font-medium">Active</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-text-secondary">
                Ignored Windows (Private/Passwords)
              </span>
              <span className="text-emerald-500 dark:text-emerald-400 font-medium">Filtered</span>
            </div>
          </div>
        </motion.div>

        {/* Devices Link */}
        <motion.div
          variants={item}
          className="bg-bg-card border border-border-subtle rounded-2xl p-6 flex items-center justify-between shadow-xs"
        >
          <div className="flex items-center gap-3">
            <Laptop size={18} className="text-accent-default" />
            <div>
              <h3 className="text-sm font-semibold text-text-primary">
                Devices & Diagnostics
              </h3>
              <p className="text-xs text-text-secondary">
                Manage local ActivityWatch collectors and view technical streams.
              </p>
            </div>
          </div>
          <Link
            href="/devices"
            className="inline-flex items-center gap-1.5 rounded-xl border border-border-default bg-bg-secondary px-3 py-1.5 text-xs font-medium text-text-primary hover:bg-bg-tertiary transition-colors"
          >
            Open Devices <ExternalLink size={12} />
          </Link>
        </motion.div>

        {/* Data Storage */}
        <motion.div
          variants={item}
          className="bg-bg-card border border-border-subtle rounded-2xl p-6 space-y-3 shadow-xs"
        >
          <div className="flex items-center gap-2.5">
            <Database size={16} className="text-accent-default" />
            <h3 className="text-sm font-semibold text-text-primary">
              Storage & DuckDB
            </h3>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-text-secondary">Local Database Path</span>
            <span className="font-mono text-text-tertiary">
              ProductiveHix/data/local.duckdb
            </span>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}
