"use client";

import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import {
  User,
  Shield,
  Laptop,
  Database,
  ExternalLink,
  Sun,
  Moon,
  Download,
  Clock,
  Globe,
  Check,
  Sparkles,
  Monitor,
  Palette,
} from "lucide-react";
import Link from "next/link";
import { useTheme } from "@shared/lib/theme-provider";
import { exportTelemetry } from "../api/client";
import {
  useUserPreferences,
  useUpdateUserPreferences,
} from "../api/queries";
import { ActivityRulesSection } from "./activity-rules-section";
import {
  getDayBoundaryOptions,
  getQuietHoursOptions,
  normalizeTimezone,
} from "@repo/validation";

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.04 } },
};
const item = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.25 } },
};

export function SettingsView() {
  const { theme, setTheme } = useTheme();
  const [isExporting, setIsExporting] = useState(false);

  const { data: preferences } = useUserPreferences();
  const updatePreferences = useUpdateUserPreferences();

  // Detect browser timezone and normalize deprecated IANA identifiers
  const detectedTimezone = useMemo(() => {
    try {
      const raw = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
      return normalizeTimezone(raw) || "UTC";
    } catch {
      return "UTC";
    }
  }, []);

  const dayBoundaryOptions = useMemo(() => getDayBoundaryOptions(), []);

  const quietHoursStartOptions = useMemo(() => {
    return getQuietHoursOptions([preferences?.quietHoursStart ?? "23:58"]);
  }, [preferences?.quietHoursStart]);

  const quietHoursEndOptions = useMemo(() => {
    return getQuietHoursOptions([preferences?.quietHoursEnd ?? "08:00"]);
  }, [preferences?.quietHoursEnd]);

  const handleExportTelemetry = async () => {
    try {
      setIsExporting(true);
      const data = await exportTelemetry();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `productivehix-telemetry-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Failed to export telemetry:", error);
      alert("Failed to export telemetry data.");
    } finally {
      setIsExporting(false);
    }
  };

  const currentBoundary = preferences?.dayBoundary ?? "00:00";
  const quietEnabled = preferences?.quietHoursEnabled ?? true;
  const quietStart = preferences?.quietHoursStart ?? "23:58";
  const quietEnd = preferences?.quietHoursEnd ?? "08:00";
  const suppressFocusCheckIns = preferences?.suppressCheckInsDuringFocus ?? true;
  const activeTimezone = normalizeTimezone(preferences?.timezone) || detectedTimezone;

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="max-w-3xl space-y-6 pb-12"
    >
      {/* Page Header */}
      <motion.div variants={item} className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-text-primary tracking-tight">
            Settings
          </h1>
          <p className="text-xs text-text-muted mt-1">
            Configure your schedule, interface appearance, privacy filters, and data storage.
          </p>
        </div>
        {updatePreferences.isPending ? (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium text-accent-default bg-accent-subtle/50 border border-accent-default/20">
            <Sparkles size={11} className="animate-spin" /> Saving...
          </span>
        ) : updatePreferences.isSuccess ? (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium text-emerald-500 bg-emerald-500/10 border border-emerald-500/20">
            <Check size={11} /> Saved
          </span>
        ) : null}
      </motion.div>

      <div className="space-y-4">
        {/* 1. PRODUCTIVE SCHEDULE & DAY CYCLE */}
        <motion.section
          variants={item}
          className="rounded-xl border border-border-subtle bg-bg-card shadow-2xs overflow-hidden"
        >
          {/* Card Header */}
          <div className="px-5 py-3.5 border-b border-border-subtle flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-accent-subtle flex items-center justify-center text-accent-default shrink-0">
                <Clock size={14} />
              </div>
              <div>
                <h2 className="text-sm font-medium text-text-primary">Productive Schedule</h2>
                <p className="text-[11px] text-text-muted">
                  Daily rollover boundary, quiet hours, and system timezone.
                </p>
              </div>
            </div>
          </div>

          {/* Card Rows */}
          <div className="divide-y divide-border-subtle">
            {/* Day Boundary Rollover */}
            <div className="px-5 py-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <label
                  htmlFor="day-boundary-select"
                  className="text-xs font-medium text-text-primary block"
                >
                  Day Rollover Boundary
                </label>
                <p className="text-[11px] text-text-muted mt-0.5 max-w-md leading-relaxed">
                  The hour your productive day resets. Daily goals, tasks, and telemetry align to
                  this cutoff.
                </p>
              </div>
              <div className="shrink-0">
                <select
                  id="day-boundary-select"
                  value={currentBoundary}
                  onChange={(e) => {
                    updatePreferences.mutate({ dayBoundary: e.target.value });
                  }}
                  className="w-full sm:w-56 text-xs bg-bg-secondary border border-border-default hover:border-border-hover rounded-lg px-3 py-1.5 text-text-primary font-medium outline-none focus:border-accent-default cursor-pointer transition-colors"
                >
                  {dayBoundaryOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Rest & Quiet Hours Toggle */}
            <div className="px-5 py-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <span className="text-xs font-medium text-text-primary block">
                  Rest Schedule (Quiet Hours)
                </span>
                <p className="text-[11px] text-text-muted mt-0.5 max-w-md leading-relaxed">
                  Silences check-in prompts and away notifications overnight. Gaps during rest do
                  not create backlog or penalize focus.
                </p>
              </div>
              <div className="shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    updatePreferences.mutate({ quietHoursEnabled: !quietEnabled });
                  }}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all cursor-pointer ${
                    quietEnabled
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-500 font-semibold"
                      : "border-border-default bg-bg-secondary text-text-muted hover:text-text-primary"
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      quietEnabled ? "bg-emerald-500" : "bg-text-muted"
                    }`}
                  />
                  {quietEnabled ? "Active" : "Disabled"}
                </button>
              </div>
            </div>

            {/* Rest Hours Start / End */}
            {quietEnabled && (
              <div className="px-5 py-3.5 bg-bg-secondary/40 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <span className="text-xs font-medium text-text-primary block">
                    Bedtime & Wake Up
                  </span>
                  <p className="text-[11px] text-text-muted mt-0.5 max-w-md leading-relaxed">
                    Set the window when you are resting off the clock.
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] uppercase tracking-wider text-text-muted font-medium">
                      Bedtime (Rest Begins)
                    </span>
                    <select
                      id="quiet-start-select"
                      value={quietStart}
                      onChange={(e) => {
                        updatePreferences.mutate({ quietHoursStart: e.target.value });
                      }}
                      className="text-xs bg-bg-secondary border border-border-default hover:border-border-hover rounded-lg px-2.5 py-1.5 text-text-primary font-medium outline-none focus:border-accent-default cursor-pointer transition-colors"
                    >
                      {quietHoursStartOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <span className="text-xs text-text-muted pt-4 px-0.5">to</span>
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] uppercase tracking-wider text-text-muted font-medium">
                      Wake Up (Rest Ends)
                    </span>
                    <select
                      id="quiet-end-select"
                      value={quietEnd}
                      onChange={(e) => {
                        updatePreferences.mutate({ quietHoursEnd: e.target.value });
                      }}
                      className="text-xs bg-bg-secondary border border-border-default hover:border-border-hover rounded-lg px-2.5 py-1.5 text-text-primary font-medium outline-none focus:border-accent-default cursor-pointer transition-colors"
                    >
                      {quietHoursEndOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* Silence Check-ins During Focus */}
            <div className="px-5 py-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <span className="text-xs font-medium text-text-primary block">
                  Silence Check-ins During Focus Mode
                </span>
                <p className="text-[11px] text-text-muted mt-0.5 max-w-md leading-relaxed">
                  Automatically suppress standard 50-minute periodic check-ins while a Deliberate Focus session is active.
                </p>
              </div>
              <div className="shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    updatePreferences.mutate({
                      suppressCheckInsDuringFocus: !suppressFocusCheckIns,
                    });
                  }}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all cursor-pointer ${
                    suppressFocusCheckIns
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-500 font-semibold"
                      : "border-border-default bg-bg-secondary text-text-muted hover:text-text-primary"
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      suppressFocusCheckIns ? "bg-emerald-500" : "bg-text-muted"
                    }`}
                  />
                  {suppressFocusCheckIns ? "Active" : "Disabled"}
                </button>
              </div>
            </div>

            {/* Timezone */}
            <div className="px-5 py-3.5 flex items-center justify-between">
              <div>
                <span className="text-xs font-medium text-text-primary flex items-center gap-1.5">
                  <Globe size={13} className="text-accent-default" />
                  System Timezone
                </span>
                <p className="text-[11px] text-text-muted mt-0.5">
                  Automatically detected from your browser environment.
                </p>
              </div>
              <span className="text-xs font-mono font-medium px-2.5 py-1 rounded-md bg-bg-secondary text-text-secondary border border-border-subtle">
                {activeTimezone}
              </span>
            </div>
          </div>
        </motion.section>

        {/* 2. APPEARANCE */}
        <motion.section
          variants={item}
          className="rounded-xl border border-border-subtle bg-bg-card shadow-2xs overflow-hidden"
        >
          <div className="px-5 py-3.5 border-b border-border-subtle flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-accent-subtle flex items-center justify-center text-accent-default shrink-0">
                <Palette size={14} />
              </div>
              <div>
                <h2 className="text-sm font-medium text-text-primary">Appearance</h2>
                <p className="text-[11px] text-text-muted">
                  Interface color theme and contrast settings.
                </p>
              </div>
            </div>
          </div>

          <div className="px-5 py-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <span className="text-xs font-medium text-text-primary block">Interface Theme</span>
              <p className="text-[11px] text-text-muted mt-0.5 leading-relaxed">
                Choose light, dark, or automatic system appearance.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-1 bg-bg-secondary p-1 rounded-lg border border-border-subtle w-full sm:w-auto">
              <button
                type="button"
                onClick={() => setTheme("light")}
                className={`flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer ${
                  theme === "light"
                    ? "bg-bg-card text-text-primary font-semibold shadow-xs border border-border-default/60"
                    : "text-text-secondary hover:text-text-primary"
                }`}
              >
                <Sun size={13} /> Light
              </button>
              <button
                type="button"
                onClick={() => setTheme("dark")}
                className={`flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer ${
                  theme === "dark"
                    ? "bg-bg-card text-text-primary font-semibold shadow-xs border border-border-default/60"
                    : "text-text-secondary hover:text-text-primary"
                }`}
              >
                <Moon size={13} /> Dark
              </button>
              <button
                type="button"
                onClick={() => setTheme("system")}
                className={`flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer ${
                  theme === "system"
                    ? "bg-bg-card text-text-primary font-semibold shadow-xs border border-border-default/60"
                    : "text-text-secondary hover:text-text-primary"
                }`}
              >
                <Monitor size={13} /> System
              </button>
            </div>
          </div>
        </motion.section>

        {/* 3. ACTIVITY CLASSIFICATION RULES & OVERRIDES */}
        <ActivityRulesSection />

        {/* 4. TELEMETRY & PRIVACY */}
        <motion.section
          variants={item}
          className="rounded-xl border border-border-subtle bg-bg-card shadow-2xs overflow-hidden"
        >
          <div className="px-5 py-3.5 border-b border-border-subtle flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-accent-subtle flex items-center justify-center text-accent-default shrink-0">
                <Shield size={14} />
              </div>
              <div>
                <h2 className="text-sm font-medium text-text-primary">Telemetry & Privacy</h2>
                <p className="text-[11px] text-text-muted">
                  Local privacy thresholds, anonymization, and window exclusion rules.
                </p>
              </div>
            </div>
          </div>

          <div className="divide-y divide-border-subtle text-xs">
            <div className="px-5 py-3 flex items-center justify-between">
              <div>
                <span className="font-medium text-text-primary block">
                  Browser Title Anonymization
                </span>
                <p className="text-[11px] text-text-muted mt-0.5">
                  URL query parameters and personal identifiers are stripped locally.
                </p>
              </div>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                Active
              </span>
            </div>

            <div className="px-5 py-3 flex items-center justify-between">
              <div>
                <span className="font-medium text-text-primary block">
                  Ignored Windows & Credentials
                </span>
                <p className="text-[11px] text-text-muted mt-0.5">
                  Password managers and incognito windows are excluded from telemetry.
                </p>
              </div>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium bg-bg-secondary text-text-secondary border border-border-subtle">
                <span className="w-1.5 h-1.5 rounded-full bg-accent-default" />
                Filtered
              </span>
            </div>
          </div>
        </motion.section>

        {/* 5. DEVICES & DIAGNOSTICS */}
        <motion.section
          variants={item}
          className="rounded-xl border border-border-subtle bg-bg-card shadow-2xs overflow-hidden"
        >
          <div className="px-5 py-3.5 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-accent-subtle flex items-center justify-center text-accent-default shrink-0">
                <Laptop size={14} />
              </div>
              <div>
                <h2 className="text-sm font-medium text-text-primary">Devices & Diagnostics</h2>
                <p className="text-[11px] text-text-muted">
                  Desktop application and browser extension streams.
                </p>
              </div>
            </div>
            <Link
              href="/devices"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border-default bg-bg-secondary px-3 py-1.5 text-xs font-medium text-text-primary hover:bg-bg-tertiary transition-colors"
            >
              Open Devices <ExternalLink size={12} />
            </Link>
          </div>
        </motion.section>

        {/* 6. STORAGE & LOCAL DATA */}
        <motion.section
          variants={item}
          className="rounded-xl border border-border-subtle bg-bg-card shadow-2xs overflow-hidden"
        >
          <div className="px-5 py-3.5 border-b border-border-subtle flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-accent-subtle flex items-center justify-center text-accent-default shrink-0">
                <Database size={14} />
              </div>
              <div>
                <h2 className="text-sm font-medium text-text-primary">Storage & Export</h2>
                <p className="text-[11px] text-text-muted">
                  Embedded analytical database and raw telemetry export.
                </p>
              </div>
            </div>
          </div>

          <div className="divide-y divide-border-subtle text-xs">
            <div className="px-5 py-3 flex items-center justify-between">
              <div>
                <span className="font-medium text-text-primary block">Analytical Database</span>
                <p className="text-[11px] text-text-muted mt-0.5">
                  High-performance local analytical store.
                </p>
              </div>
              <code className="text-[11px] font-mono px-2 py-1 rounded bg-bg-secondary text-text-secondary border border-border-subtle">
                ProductiveHix/data/local.duckdb
              </code>
            </div>

            <div className="px-5 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <span className="font-medium text-text-primary block">Raw Telemetry Data</span>
                <p className="text-[11px] text-text-muted mt-0.5">
                  Download all local activity telemetry records in JSON format.
                </p>
              </div>
              <button
                type="button"
                onClick={handleExportTelemetry}
                disabled={isExporting}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-bg-secondary border border-border-default text-text-primary font-medium hover:bg-bg-tertiary transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0 cursor-pointer"
              >
                <Download size={13} />
                <span>{isExporting ? "Exporting..." : "Export to JSON"}</span>
              </button>
            </div>
          </div>
        </motion.section>

        {/* 7. ACCOUNT & PROFILE */}
        <motion.section
          variants={item}
          className="rounded-xl border border-border-subtle bg-bg-card shadow-2xs overflow-hidden"
        >
          <div className="px-5 py-3.5 border-b border-border-subtle flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-accent-subtle flex items-center justify-center text-accent-default shrink-0">
                <User size={14} />
              </div>
              <div>
                <h2 className="text-sm font-medium text-text-primary">Personal Profile</h2>
                <p className="text-[11px] text-text-muted">
                  Account identity and local developer license tier.
                </p>
              </div>
            </div>
          </div>

          <div className="px-5 py-3 grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <span className="text-[11px] text-text-muted block">User Identity</span>
              <span className="font-medium text-text-primary mt-0.5 block">Prateek</span>
            </div>
            <div>
              <span className="text-[11px] text-text-muted block">Instance Tier</span>
              <span className="font-medium text-accent-default mt-0.5 block">
                Developer Edition (Local)
              </span>
            </div>
          </div>
        </motion.section>
      </div>
    </motion.div>
  );
}
