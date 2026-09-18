"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  Sliders,
  Plus,
  Trash2,
  X,
  Tag,
  AlertCircle,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { settingsQueries } from "../api/queries";
import {
  createActivityRule,
  updateActivityRule,
  deleteActivityRule,
  deleteActivityOverride,
} from "../api/client";
import { timelineQueries } from "@features/timeline";

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

export function ActivityRulesSection() {
  const queryClient = useQueryClient();
  const { data: rulesData, isLoading: loadingRules } = useQuery(settingsQueries.rules());
  const { data: overridesData, isLoading: loadingOverrides } = useQuery(settingsQueries.overrides());

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
        assignedModality: (assignedModality || undefined) as any,
        assignedContext: assignedContext.trim() || undefined,
      });
      queryClient.invalidateQueries({ queryKey: settingsQueries.rules().queryKey });
      queryClient.invalidateQueries({ queryKey: timelineQueries.all() });
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
    queryClient.invalidateQueries({ queryKey: settingsQueries.rules().queryKey });
    queryClient.invalidateQueries({ queryKey: timelineQueries.all() });
  };

  const handleDeleteRule = async (ruleId: string) => {
    if (!confirm("Are you sure you want to delete this rule?")) return;
    await deleteActivityRule(ruleId);
    queryClient.invalidateQueries({ queryKey: settingsQueries.rules().queryKey });
    queryClient.invalidateQueries({ queryKey: timelineQueries.all() });
  };

  const handleDeleteOverride = async (overrideId: string) => {
    await deleteActivityOverride(overrideId);
    queryClient.invalidateQueries({ queryKey: settingsQueries.overrides().queryKey });
    queryClient.invalidateQueries({ queryKey: timelineQueries.all() });
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
                className="p-1 rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-secondary transition-colors cursor-pointer"
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
