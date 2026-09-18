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
  Sliders,
  Plus,
  Trash2,
  X,
  Tag,
  AlertCircle,
} from "lucide-react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTheme } from "../../src/lib/theme-provider";
import { apiFetch } from "../../src/lib/api/client";
import {
  getActivityRules,
  createActivityRule,
  updateActivityRule,
  deleteActivityRule,
  getActivityOverrides,
  deleteActivityOverride,
} from "../../src/lib/api";
import {
  useUserPreferences,
  useUpdateUserPreferences,
} from "../../src/hooks/queries/use-user-preferences";
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

const MODALITIES = [
  { value: "development", label: "Development" },
  { value: "reading_research", label: "Reading & Research" },
  { value: "writing_documentation", label: "Writing & Docs" },
  { value: "communication", label: "Communication" },
  { value: "administration", label: "Administration" },
  { value: "media_consumption", label: "Media" },
  { value: "gaming", label: "Gaming" },
  { value: "idle_away", label: "Away (Idle)" },
  { value: "system_maintenance", label: "System" },
  { value: "unknown", label: "Unknown" },
];

function ActivityRulesSection() {
  const queryClient = useQueryClient();
  const { data: rulesData, isLoading: loadingRules } = useQuery({
    queryKey: ["activity-rules", "rules"],
    queryFn: getActivityRules,
  });
  const { data: overridesData, isLoading: loadingOverrides } = useQuery({
    queryKey: ["activity-rules", "overrides"],
    queryFn: getActivityOverrides,
  });

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [name, setName] = useState("");
  const [priority, setPriority] = useState(100);
  const [appPattern, setAppPattern] = useState("");
  const [domainPattern, setDomainPattern] = useState("");
  const [titlePattern, setTitlePattern] = useState("");
  const [assignedModality, setAssignedModality] = useState("development");
  const [assignedContext, setAssignedContext] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const rules = rulesData?.rules ?? [];
  const overrides = overridesData?.overrides ?? [];

  const handleCreateRule = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setCreateError(null);
    try {
      if (!appPattern.trim() && !domainPattern.trim() && !titlePattern.trim()) {
        throw new Error("At least one pattern (App, Domain, or Title) is required");
      }
      await createActivityRule({
        name: name.trim(),
        priority: Number(priority),
        isEnabled: true,
        applicationPattern: appPattern.trim() || undefined,
        domainPattern: domainPattern.trim() || undefined,
        titlePattern: titlePattern.trim() || undefined,
        assignedModality: (assignedModality as any) || undefined,
        assignedContext: assignedContext.trim() || undefined,
      });
      queryClient.invalidateQueries({ queryKey: ["activity-rules", "rules"] });
      queryClient.invalidateQueries({ queryKey: ["activity", "timeline"] });
      setShowCreateModal(false);
      setName("");
      setPriority(100);
      setAppPattern("");
      setDomainPattern("");
      setTitlePattern("");
      setAssignedContext("");
    } catch (err: unknown) {
      setCreateError(err instanceof Error ? err.message : "Failed to create rule");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleRule = async (ruleId: string, currentEnabled: boolean) => {
    await updateActivityRule(ruleId, { isEnabled: !currentEnabled });
    queryClient.invalidateQueries({ queryKey: ["activity-rules", "rules"] });
    queryClient.invalidateQueries({ queryKey: ["activity", "timeline"] });
  };

  const handleDeleteRule = async (ruleId: string) => {
    if (!confirm("Are you sure you want to delete this rule?")) return;
    await deleteActivityRule(ruleId);
    queryClient.invalidateQueries({ queryKey: ["activity-rules", "rules"] });
    queryClient.invalidateQueries({ queryKey: ["activity", "timeline"] });
  };

  const handleDeleteOverride = async (overrideId: string) => {
    await deleteActivityOverride(overrideId);
    queryClient.invalidateQueries({ queryKey: ["activity-rules", "overrides"] });
    queryClient.invalidateQueries({ queryKey: ["activity", "timeline"] });
  };

  return (
    <motion.section
      variants={item}
      className="rounded-xl border border-border-subtle bg-bg-card shadow-2xs overflow-hidden"
    >
      <div className="px-5 py-3.5 border-b border-border-subtle flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-accent-subtle flex items-center justify-center text-accent-default shrink-0">
            <Sliders size={14} />
          </div>
          <div>
            <h2 className="text-sm font-medium text-text-primary">Activity Classification Rules &amp; Overrides</h2>
            <p className="text-[11px] text-text-muted">
              Deterministic matching rules and manual correction overrides.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShowCreateModal(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-accent-default/30 bg-accent-subtle text-accent-default text-xs font-medium hover:bg-accent-default/20 transition-all cursor-pointer"
        >
          <Plus size={13} />
          <span>New Rule</span>
        </button>
      </div>

      <div className="divide-y divide-border-subtle">
        <div className="px-5 py-2 bg-bg-secondary/40 flex items-center justify-between text-[11px] font-medium text-text-muted">
          <span>CLASSIFICATION RULES (EVALUATED BY PRIORITY ASC)</span>
          <span>{rules.length} active</span>
        </div>

        {loadingRules ? (
          <div className="p-5 text-center text-xs text-text-muted">Loading classification rules...</div>
        ) : rules.length === 0 ? (
          <div className="p-5 text-center text-xs text-text-muted">
            No custom rules configured yet. The deterministic system classifier is active.
          </div>
        ) : (
          rules.map((rule) => (
            <div key={rule.id} className="px-5 py-3 flex items-center justify-between gap-3 text-xs">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-[10px] px-1.5 py-0.2 rounded bg-bg-secondary text-text-muted border border-border-subtle">
                    #{rule.priority}
                  </span>
                  <span className="font-medium text-text-primary">{rule.name}</span>
                  {rule.assignedModality && (
                    <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded-full bg-accent-subtle text-accent-default border border-accent-default/30">
                      {rule.assignedModality}
                    </span>
                  )}
                  {rule.assignedContext && (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-bg-secondary text-text-secondary border border-border-subtle flex items-center gap-1">
                      <Tag size={10} />
                      {rule.assignedContext}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 font-mono text-[10px] text-text-muted flex-wrap">
                  {rule.applicationPattern && <span>app: {rule.applicationPattern}</span>}
                  {rule.domainPattern && <span>domain: {rule.domainPattern}</span>}
                  {rule.titlePattern && <span>title: {rule.titlePattern}</span>}
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => handleToggleRule(rule.id, rule.isEnabled)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all cursor-pointer ${
                    rule.isEnabled
                      ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
                      : "bg-bg-secondary text-text-muted border border-border-subtle"
                  }`}
                >
                  {rule.isEnabled ? "Enabled" : "Disabled"}
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteRule(rule.id)}
                  title="Delete Rule"
                  className="p-1 rounded text-text-muted hover:text-error transition-colors cursor-pointer"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))
        )}

        <div className="px-5 py-2 bg-bg-secondary/40 flex items-center justify-between text-[11px] font-medium text-text-muted">
          <span>ACTIVE OCCURRENCE OVERRIDES (USER AUTHORITY)</span>
          <span>{overrides.length} active</span>
        </div>

        {loadingOverrides ? (
          <div className="p-5 text-center text-xs text-text-muted">Loading overrides...</div>
        ) : overrides.length === 0 ? (
          <div className="p-5 text-center text-xs text-text-muted">
            No occurrence overrides active. Use &quot;Correct Classification&quot; on any timeline block to record one.
          </div>
        ) : (
          overrides.map((ov) => (
            <div key={ov.id} className="px-5 py-3 flex items-center justify-between gap-3 text-xs">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-text-primary">{ov.targetApplication}</span>
                  <span className="font-mono text-[10px] text-text-muted">
                    {new Date(ov.targetTimeWindowStart).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} –{" "}
                    {new Date(ov.targetTimeWindowEnd).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                  </span>
                  <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-300 border border-purple-500/30">
                    {ov.targetClaimType}: {ov.overriddenValue}
                  </span>
                </div>
                {ov.reason && <p className="text-[11px] text-text-muted italic">&quot;{ov.reason}&quot;</p>}
              </div>

              <button
                type="button"
                onClick={() => handleDeleteOverride(ov.id)}
                title="Revoke Override"
                className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] text-text-muted hover:text-error hover:bg-error/10 transition-colors cursor-pointer"
              >
                <Trash2 size={12} />
                <span>Revoke</span>
              </button>
            </div>
          ))
        )}
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-bg-card border border-border-default rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-border-subtle">
              <div className="flex items-center gap-2">
                <Sliders size={15} className="text-accent-default" />
                <h3 className="text-base font-semibold text-text-primary">Create Classification Rule</h3>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="p-1 rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-secondary transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleCreateRule} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-text-primary font-medium mb-1">Rule Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. YouTube Educational Tutorials"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-bg-secondary border border-border-default rounded-lg px-3 py-2 text-text-primary outline-none focus:border-accent-default"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-text-primary font-medium mb-1">Priority (lower = higher)</label>
                  <input
                    type="number"
                    min={0}
                    max={100000}
                    value={priority}
                    onChange={(e) => setPriority(Number(e.target.value))}
                    className="w-full bg-bg-secondary border border-border-default rounded-lg px-3 py-2 text-text-primary outline-none focus:border-accent-default font-mono"
                  />
                </div>

                <div>
                  <label className="block text-text-primary font-medium mb-1">Assigned Modality</label>
                  <select
                    value={assignedModality}
                    onChange={(e) => setAssignedModality(e.target.value)}
                    className="w-full bg-bg-secondary border border-border-default rounded-lg px-3 py-2 text-text-primary outline-none focus:border-accent-default"
                  >
                    {MODALITIES.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-text-primary font-medium mb-1">Matching Criteria (at least 1 pattern)</label>
                <div className="space-y-2">
                  <input
                    type="text"
                    placeholder="Application pattern (regex or substring, e.g. code|terminal)"
                    value={appPattern}
                    onChange={(e) => setAppPattern(e.target.value)}
                    className="w-full bg-bg-secondary border border-border-default rounded-lg px-3 py-1.5 text-text-primary outline-none focus:border-accent-default font-mono"
                  />
                  <input
                    type="text"
                    placeholder="Domain pattern (e.g. github\\.com|stackoverflow\\.com)"
                    value={domainPattern}
                    onChange={(e) => setDomainPattern(e.target.value)}
                    className="w-full bg-bg-secondary border border-border-default rounded-lg px-3 py-1.5 text-text-primary outline-none focus:border-accent-default font-mono"
                  />
                  <input
                    type="text"
                    placeholder="Window title pattern (e.g. PR #|Tutorial|Course)"
                    value={titlePattern}
                    onChange={(e) => setTitlePattern(e.target.value)}
                    className="w-full bg-bg-secondary border border-border-default rounded-lg px-3 py-1.5 text-text-primary outline-none focus:border-accent-default font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-text-primary font-medium mb-1">Assigned Context / Project (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. ProductiveHix, System Architecture"
                  value={assignedContext}
                  onChange={(e) => setAssignedContext(e.target.value)}
                  className="w-full bg-bg-secondary border border-border-default rounded-lg px-3 py-2 text-text-primary outline-none focus:border-accent-default font-mono"
                />
              </div>

              {createError && (
                <div className="p-3 rounded-lg bg-error/10 border border-error/20 text-error flex items-center gap-2">
                  <AlertCircle size={14} className="shrink-0" />
                  <span>{createError}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-border-subtle">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-lg text-text-muted hover:text-text-primary transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-lg font-medium text-white bg-accent-default hover:bg-accent-hover transition-colors shadow-xs cursor-pointer"
                >
                  {isSubmitting ? "Creating..." : "Create Rule"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </motion.section>
  );
}

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const [isExporting, setIsExporting] = useState(false);

  const { data: preferences } = useUserPreferences();
  const updatePreferences = useUpdateUserPreferences();

  // Detect browser timezone and normalize deprecated IANA identifiers (e.g. Asia/Calcutta -> Asia/Kolkata)
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
      const data = await apiFetch<unknown>("/api/export/telemetry");
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
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
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

            {/* Rest Hours Start / End (Only shown if quiet hours enabled) */}
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

            {/* Timezone (Automatic, No Manual Selection) */}
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
                className={`flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
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
                className={`flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
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
                className={`flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
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

        {/* 4. DEVICES & DIAGNOSTICS */}
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

        {/* 5. STORAGE & LOCAL DATA */}
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
                className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-bg-secondary border border-border-default text-text-primary font-medium hover:bg-bg-tertiary transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
              >
                <Download size={13} />
                <span>{isExporting ? "Exporting..." : "Export to JSON"}</span>
              </button>
            </div>
          </div>
        </motion.section>

        {/* 6. ACCOUNT & PROFILE */}
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
