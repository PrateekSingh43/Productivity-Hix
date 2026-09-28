"use client";

import { useState, useMemo, useEffect } from "react";
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
  Sliders,
  Keyboard,
  LifeBuoy,
  Settings2,
} from "lucide-react";
import Link from "next/link";
import { useTheme } from "@shared/lib/theme-provider";
import { exportTelemetry } from "../api/client";
import {
  useUserPreferences,
  useUpdateUserPreferences,
} from "../api/queries";
import {
  getDayBoundaryOptions,
  getQuietHoursOptions,
  normalizeTimezone,
} from "@repo/validation";
import type { UserPreferences } from "../types";
import { ActivityRulesSection } from "./activity-rules-section";

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.04 } },
};

const item = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, transition: { duration: 0.25 } },
};

type SettingsSectionId =
  | "general"
  | "classification"
  | "privacy"
  | "devices"
  | "ai"
  | "shortcuts"
  | "help"
  | "account";

const SECTIONS: Array<{ id: SettingsSectionId; label: string; hint: string; icon: typeof User }> = [
  { id: "general", label: "General", hint: "Schedule, appearance, timezone", icon: Settings2 },
  { id: "classification", label: "Classification", hint: "Activity rules & overrides", icon: Sliders },
  { id: "privacy", label: "Privacy & Data", hint: "Telemetry, storage, export", icon: Shield },
  { id: "devices", label: "Devices", hint: "Collectors & diagnostics", icon: Laptop },
  { id: "ai", label: "AI & Insights", hint: "How AI uses your data", icon: Sparkles },
  { id: "shortcuts", label: "Shortcuts", hint: "Keyboard reference", icon: Keyboard },
  { id: "help", label: "Help", hint: "Guides & support", icon: LifeBuoy },
  { id: "account", label: "Account", hint: "Profile & tier", icon: User },
];

function sectionFromUrl(): SettingsSectionId {
  if (typeof window === "undefined") return "general";
  const raw = new URLSearchParams(window.location.search).get("section");
  return SECTIONS.some((s) => s.id === raw) ? (raw as SettingsSectionId) : "general";
}

function CardShell({
  icon,
  title,
  description,
  children,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <motion.section
      variants={item}
      className="rounded-xl border border-border-subtle bg-bg-card shadow-2xs overflow-hidden"
    >
      <div className="px-5 py-3.5 border-b border-border-subtle flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-accent-subtle flex items-center justify-center text-accent-default shrink-0">
            {icon}
          </div>
          <div>
            <h2 className="text-sm font-medium text-text-primary">{title}</h2>
            <p className="text-[11px] text-text-muted">{description}</p>
          </div>
        </div>
        {action}
      </div>
      {children}
    </motion.section>
  );
}

type MutatePrefs = (input: {
  dayBoundary?: string;
  quietHoursEnabled?: boolean;
  quietHoursStart?: string;
  quietHoursEnd?: string;
  suppressCheckInsDuringFocus?: boolean;
}) => void;

function GeneralSection({
  preferences,
  mutate,
  theme,
  setTheme,
  detectedTimezone,
}: {
  preferences: UserPreferences | undefined;
  mutate: MutatePrefs;
  theme: string;
  setTheme: (t: "light" | "dark" | "system") => void;
  detectedTimezone: string;
}) {
  const dayBoundaryOptions = useMemo(() => getDayBoundaryOptions(), []);
  const quietHoursStartOptions = useMemo(() => {
    return getQuietHoursOptions([preferences?.quietHoursStart ?? "23:58"]);
  }, [preferences?.quietHoursStart]);
  const quietHoursEndOptions = useMemo(() => {
    return getQuietHoursOptions([preferences?.quietHoursEnd ?? "08:00"]);
  }, [preferences?.quietHoursEnd]);

  const currentBoundary = preferences?.dayBoundary ?? "00:00";
  const quietEnabled = preferences?.quietHoursEnabled ?? true;
  const quietStart = preferences?.quietHoursStart ?? "23:58";
  const quietEnd = preferences?.quietHoursEnd ?? "08:00";
  const suppressFocusCheckIns = preferences?.suppressCheckInsDuringFocus ?? true;
  const activeTimezone = normalizeTimezone(preferences?.timezone) || detectedTimezone;

  return (
    <div className="space-y-4">
      <CardShell
        icon={<Clock size={14} />}
        title="Productive Schedule"
        description="Daily rollover boundary, quiet hours, and system timezone."
      >
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
                  mutate({ dayBoundary: e.target.value });
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
                  mutate({ quietHoursEnabled: !quietEnabled });
                }}
                className={`inline-flex items-center justify-center min-w-[54px] gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all cursor-pointer ${
                  quietEnabled
                    ? "border-border-hover bg-bg-active text-text-primary"
                    : "border-border-default bg-bg-secondary text-text-muted hover:text-text-primary"
                }`}
                aria-label="Toggle rest hours"
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    quietEnabled ? "bg-text-primary" : "bg-text-muted"
                  }`}
                />
                {quietEnabled ? "ON" : "OFF"}
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
                      mutate({ quietHoursStart: e.target.value });
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
                      mutate({ quietHoursEnd: e.target.value });
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
                Silence Check-ins During Focus
              </span>
              <p className="text-[11px] text-text-muted mt-0.5 max-w-md leading-relaxed">
                Turn ON to silence normal notifications during focus mode.
              </p>
            </div>
            <div className="shrink-0">
              <button
                type="button"
                onClick={() => {
                  mutate({
                    suppressCheckInsDuringFocus: !suppressFocusCheckIns,
                  });
                }}
                className={`inline-flex items-center justify-center min-w-[54px] gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all cursor-pointer ${
                  suppressFocusCheckIns
                    ? "border-border-hover bg-bg-active text-text-primary"
                    : "border-border-default bg-bg-secondary text-text-muted hover:text-text-primary"
                }`}
                aria-label="Toggle silence check-ins during focus"
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    suppressFocusCheckIns ? "bg-text-primary" : "bg-text-muted"
                  }`}
                />
                {suppressFocusCheckIns ? "ON" : "OFF"}
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
      </CardShell>

      <CardShell
        icon={<Palette size={14} />}
        title="Appearance"
        description="Interface color theme and contrast settings."
      >
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
      </CardShell>
    </div>
  );
}

function PrivacyDataSection() {
  const [isExporting, setIsExporting] = useState(false);

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

  return (
    <div className="space-y-4">
      <CardShell
        icon={<Shield size={14} />}
        title="Telemetry & Privacy"
        description="Local privacy thresholds, anonymization, and window exclusion rules."
      >
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
      </CardShell>

      <CardShell
        icon={<Database size={14} />}
        title="Storage & Export"
        description="Embedded analytical database and raw telemetry export."
      >
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
      </CardShell>
    </div>
  );
}

function DevicesSection() {
  return (
    <CardShell
      icon={<Laptop size={14} />}
      title="Devices & Diagnostics"
      description="Desktop application and browser extension streams."
      action={
        <Link
          href="/devices"
          className="inline-flex items-center gap-1.5 rounded-lg border border-border-default bg-bg-secondary px-3 py-1.5 text-xs font-medium text-text-primary hover:bg-bg-tertiary transition-colors"
        >
          Open Devices <ExternalLink size={12} />
        </Link>
      }
    >
      <div className="px-5 py-3 text-xs text-text-muted leading-relaxed">
        Collector health, connection status, and per-device diagnostics live on the Devices
        page. Pairing new collectors happens there too.
      </div>
    </CardShell>
  );
}

function AiSection() {
  return (
    <CardShell
      icon={<Sparkles size={14} />}
      title="AI & Insights"
      description="How assistant synthesis uses your data — and its limits."
    >
      <div className="divide-y divide-border-subtle text-xs">
        <div className="px-5 py-3">
          <span className="font-medium text-text-primary block">Aggregates only, never raw telemetry</span>
          <p className="text-[11px] text-text-muted mt-0.5 leading-relaxed">
            The assistant reasons over summaries, patterns, and your own reflections. Hundreds
            of raw window events never enter its context.
          </p>
        </div>
        <div className="px-5 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <span className="font-medium text-text-primary block">Ask about your data</span>
            <p className="text-[11px] text-text-muted mt-0.5">
              Grounded chat over your tasks, sessions, patterns, and insights.
            </p>
          </div>
          <Link
            href="/ai"
            className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-bg-secondary border border-border-default text-text-primary font-medium hover:bg-bg-tertiary transition-colors shrink-0"
          >
            Open AI Chat
          </Link>
        </div>
        <div className="px-5 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <span className="font-medium text-text-primary block">Behavioral evidence</span>
            <p className="text-[11px] text-text-muted mt-0.5">
              Deterministic patterns and evidence-backed insights behind AI answers.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Link
              href="/insights"
              className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-bg-secondary border border-border-default text-text-primary font-medium hover:bg-bg-tertiary transition-colors"
            >
              Insights
            </Link>
            <Link
              href="/patterns"
              className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-bg-secondary border border-border-default text-text-primary font-medium hover:bg-bg-tertiary transition-colors"
            >
              Patterns
            </Link>
          </div>
        </div>
      </div>
    </CardShell>
  );
}

const SHORTCUTS: Array<{ keys: string; what: string; where: string }> = [
  { keys: "j / ↓", what: "Select next block", where: "Timeline" },
  { keys: "k / ↑", what: "Select previous block", where: "Timeline" },
  { keys: "Enter / Space", what: "Toggle block detail", where: "Timeline" },
  { keys: "c / e", what: "Correct selected block", where: "Timeline" },
  { keys: "r", what: "Create rule from selected block", where: "Timeline" },
  { keys: "t", what: "Jump to today", where: "Timeline" },
  { keys: "[ / ]", what: "Previous / next day", where: "Timeline" },
  { keys: "?", what: "Toggle shortcuts reference", where: "Timeline" },
  { keys: "Esc", what: "Close modal / drawer", where: "Everywhere" },
];

function ShortcutsSection() {
  return (
    <CardShell
      icon={<Keyboard size={14} />}
      title="Keyboard Shortcuts"
      description="Work faster without leaving the keyboard."
    >
      <div className="divide-y divide-border-subtle">
        {SHORTCUTS.map((s) => (
          <div key={`${s.keys}-${s.what}`} className="px-5 py-2.5 flex items-center justify-between gap-3 text-xs">
            <span className="text-text-primary font-medium">{s.what}</span>
            <span className="inline-flex items-center gap-2 shrink-0">
              <span className="text-[10px] text-text-muted">{s.where}</span>
              <kbd className="font-mono text-[11px] px-2 py-0.5 rounded-md bg-bg-secondary border border-border-default text-text-secondary">
                {s.keys}
              </kbd>
            </span>
          </div>
        ))}
      </div>
    </CardShell>
  );
}

function HelpSection() {
  return (
    <CardShell
      icon={<LifeBuoy size={14} />}
      title="Help & Guides"
      description="Find your way around ProductiveHix."
    >
      <div className="divide-y divide-border-subtle text-xs">
        {[
          { href: "/today", label: "Today", desc: "Plan the day: goal, priorities, sessions." },
          { href: "/tasks", label: "Tasks", desc: "Intentions, backlog, and daily logbook." },
          { href: "/timeline", label: "Timeline", desc: "What actually happened, and when." },
          { href: "/insights", label: "Insights", desc: "Evidence-backed behavioral readouts." },
          { href: "/devices", label: "Devices", desc: "Pair collectors and check stream health." },
          { href: "/ai", label: "AI Chat", desc: "Ask grounded questions about your data." },
        ].map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="px-5 py-2.5 flex items-center justify-between gap-3 hover:bg-bg-secondary/40 transition-colors"
          >
            <span>
              <span className="font-medium text-text-primary block">{l.label}</span>
              <span className="text-[11px] text-text-muted">{l.desc}</span>
            </span>
            <ExternalLink size={12} className="text-text-muted shrink-0" />
          </Link>
        ))}
        <div className="px-5 py-3">
          <span className="font-medium text-text-primary block">Report an issue</span>
          <p className="text-[11px] text-text-muted mt-0.5 leading-relaxed">
            Include the page, the day involved, and what you expected. Diagnostics live under
            Devices; raw data can be exported from Privacy &amp; Data.
          </p>
        </div>
      </div>
    </CardShell>
  );
}

function AccountSection() {
  return (
    <CardShell
      icon={<User size={14} />}
      title="Personal Profile"
      description="Account identity and local developer license tier."
    >
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
    </CardShell>
  );
}

export function SettingsView() {
  const { theme, setTheme } = useTheme();
  const { data: preferences } = useUserPreferences();
  const updatePreferences = useUpdateUserPreferences();

  const [section, setSection] = useState<SettingsSectionId>(() => sectionFromUrl());

  useEffect(() => {
    const onPopState = () => setSection(sectionFromUrl());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const selectSection = (id: SettingsSectionId) => {
    setSection(id);
    const url = new URL(window.location.href);
    url.searchParams.set("section", id);
    window.history.replaceState(null, "", url.toString());
  };

  // Detect browser timezone and normalize deprecated IANA identifiers
  const detectedTimezone = useMemo(() => {
    try {
      const raw = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
      return normalizeTimezone(raw) || "UTC";
    } catch {
      return "UTC";
    }
  }, []);

  const mutate = useMemo(
    () => (input: Parameters<MutatePrefs>[0]) => updatePreferences.mutate(input),
    [updatePreferences]
  );

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="max-w-5xl space-y-6 pb-12"
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

      {/* Mobile section picker */}
      <div className="sm:hidden flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => selectSection(s.id)}
            className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors cursor-pointer ${
              section === s.id
                ? "bg-bg-card text-text-primary border-border-strong shadow-2xs"
                : "text-text-muted border-transparent hover:text-text-primary"
            }`}
          >
            <s.icon size={13} />
            {s.label}
          </button>
        ))}
      </div>

      <div className="flex gap-6 items-start">
        {/* Left nav (desktop) */}
        <motion.nav
          variants={item}
          aria-label="Settings sections"
          className="hidden sm:block w-52 shrink-0 sticky top-4 rounded-xl border border-border-subtle bg-bg-card shadow-2xs overflow-hidden"
        >
          <div className="p-1.5 space-y-0.5">
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => selectSection(s.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-colors cursor-pointer ${
                  section === s.id
                    ? "bg-bg-secondary text-text-primary"
                    : "text-text-muted hover:text-text-primary hover:bg-bg-secondary/50"
                }`}
              >
                <s.icon size={14} className={section === s.id ? "text-accent-default" : ""} />
                <span className="min-w-0">
                  <span className={`block text-xs font-medium ${section === s.id ? "font-semibold" : ""}`}>
                    {s.label}
                  </span>
                  <span className="block text-[10px] text-text-muted truncate">{s.hint}</span>
                </span>
              </button>
            ))}
          </div>
        </motion.nav>

        {/* Active panel */}
        <motion.div variants={item} className="flex-1 min-w-0" key={section}>
          {section === "general" && (
            <GeneralSection
              preferences={preferences}
              mutate={mutate}
              theme={theme}
              setTheme={setTheme}
              detectedTimezone={detectedTimezone}
            />
          )}
          {section === "classification" && <ActivityRulesSection />}
          {section === "privacy" && <PrivacyDataSection />}
          {section === "devices" && <DevicesSection />}
          {section === "ai" && <AiSection />}
          {section === "shortcuts" && <ShortcutsSection />}
          {section === "help" && <HelpSection />}
          {section === "account" && <AccountSection />}
        </motion.div>
      </div>
    </motion.div>
  );
}
