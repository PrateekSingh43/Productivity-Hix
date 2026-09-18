"use client";

import React, { useState } from "react";
import {
  Sliders,
  Plus,
  Trash2,
  Tag,
  Globe,
  Code,
  FileText,
  MessageSquare,
  Briefcase,
  PlaySquare,
  Gamepad2,
  Terminal,
  HelpCircle,
  Coffee,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Layers,
  History,
  Sparkles,
} from "lucide-react";
import {
  useActivityRules,
  useUpdateActivityRule,
  useDeleteActivityRule,
  useActivityOverrides,
  useDeleteActivityOverride,
  type UserActivityRule,
  type UserActivityOverride,
} from "@features/settings";
import { CreateRuleModal } from "./create-rule-modal";
import { EmptyState, LoadingState } from "@shared/components/primitives";

// Harmonized category visual metadata matching Linear design & app theme
export const CATEGORY_METADATA: Record<
  string,
  {
    label: string;
    description: string;
    icon: typeof Code;
    color: string;
    dot: string;
    badge: string;
  }
> = {
  development: {
    label: "Development",
    description: "Code editors, IDEs, terminals, Git, debuggers & code reviews",
    icon: Code,
    color: "text-accent-default",
    dot: "bg-accent-default",
    badge: "bg-accent-subtle text-accent-default border-accent-default/30",
  },
  reading_research: {
    label: "Reading & Research",
    description: "Documentation, technical specs, search engines & whitepapers",
    icon: Globe,
    color: "text-sky-400",
    dot: "bg-sky-400",
    badge: "bg-sky-500/10 text-sky-400 border-sky-500/20",
  },
  writing_documentation: {
    label: "Writing & Docs",
    description: "Markdown, notes, Notion, Obsidian, requirements & articles",
    icon: FileText,
    color: "text-indigo-400",
    dot: "bg-indigo-400",
    badge: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
  },
  communication: {
    label: "Communication",
    description: "Slack, Discord, Microsoft Teams, Email, Zoom & meetings",
    icon: MessageSquare,
    color: "text-purple-400",
    dot: "bg-purple-400",
    badge: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  },
  administration: {
    label: "Administration",
    description: "Account settings, system preferences, billing & project management",
    icon: Briefcase,
    color: "text-amber-400",
    dot: "bg-amber-400",
    badge: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  },
  media_consumption: {
    label: "Media",
    description: "YouTube, podcasts, music, video streaming & social feeds",
    icon: PlaySquare,
    color: "text-rose-400",
    dot: "bg-rose-400",
    badge: "bg-rose-500/10 text-rose-400 border-rose-500/20",
  },
  gaming: {
    label: "Gaming",
    description: "Steam, video games, emulators & gaming launchers",
    icon: Gamepad2,
    color: "text-fuchsia-400",
    dot: "bg-fuchsia-400",
    badge: "bg-fuchsia-500/10 text-fuchsia-400 border-fuchsia-500/20",
  },
  idle_away: {
    label: "Away (Idle)",
    description: "Machine lock, AFK detection, suspension & system screensaver",
    icon: Coffee,
    color: "text-zinc-400",
    dot: "bg-zinc-400",
    badge: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
  },
  system_maintenance: {
    label: "System",
    description: "OS updates, package management, backups & diagnostics",
    icon: Terminal,
    color: "text-slate-400",
    dot: "bg-slate-400",
    badge: "bg-slate-500/10 text-slate-400 border-slate-500/20",
  },
  unknown: {
    label: "Unknown (Uncategorized)",
    description: "Fallback state when no pattern rule matches observed telemetry",
    icon: HelpCircle,
    color: "text-zinc-400",
    dot: "bg-zinc-500",
    badge: "bg-zinc-800/80 text-zinc-400 border-zinc-700/50",
  },
};

interface CategoriesRulesManagerProps {
  onRuleChanged?: () => void;
}

export function CategoriesRulesManager({ onRuleChanged }: CategoriesRulesManagerProps) {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [targetCategoryForNewRule, setTargetCategoryForNewRule] = useState<string | null>(null);

  const { data: rulesData, isLoading: isRulesLoading, refetch: refetchRules } = useActivityRules();
  const { data: overridesData, isLoading: isOverridesLoading, refetch: refetchOverrides } =
    useActivityOverrides();

  const updateRuleMutation = useUpdateActivityRule();
  const deleteRuleMutation = useDeleteActivityRule();
  const deleteOverrideMutation = useDeleteActivityOverride();

  const rules: UserActivityRule[] = rulesData?.rules ?? [];
  const overrides: UserActivityOverride[] = overridesData?.overrides ?? [];

  // Count active rules assigned to each modality
  const ruleCountsByModality = React.useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of rules) {
      if (r.assignedModality) {
        counts[r.assignedModality] = (counts[r.assignedModality] ?? 0) + 1;
      }
    }
    return counts;
  }, [rules]);

  const handleToggleRule = async (rule: UserActivityRule) => {
    try {
      await updateRuleMutation.mutateAsync({
        id: rule.id,
        data: { isEnabled: !rule.isEnabled },
      });
      onRuleChanged?.();
    } catch (err) {
      console.error("Failed to toggle rule:", err);
    }
  };

  const handleDeleteRule = async (ruleId: string) => {
    try {
      await deleteRuleMutation.mutateAsync(ruleId);
      onRuleChanged?.();
    } catch (err) {
      console.error("Failed to delete rule:", err);
    }
  };

  const handleDeleteOverride = async (overrideId: string) => {
    try {
      await deleteOverrideMutation.mutateAsync(overrideId);
      onRuleChanged?.();
    } catch (err) {
      console.error("Failed to delete override:", err);
    }
  };

  return (
    <div className="space-y-6">
      {/* Create Rule Modal */}
      {isCreateModalOpen && (
        <CreateRuleModal
          isOpen={isCreateModalOpen}
          onClose={() => {
            setIsCreateModalOpen(false);
            setTargetCategoryForNewRule(null);
          }}
          onSuccess={() => {
            refetchRules();
            onRuleChanged?.();
          }}
        />
      )}

      {/* 1. Header Banner & Quick Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border-subtle">
        <div>
          <h2 className="text-base font-semibold text-text-primary flex items-center gap-2">
            <Sliders className="w-4 h-4 text-accent-default" />
            <span>Activity Categorization &amp; Rules</span>
          </h2>
          <p className="text-xs text-text-secondary mt-0.5">
            Deterministic pattern-matching rules modeled after ActivityWatch. Rules evaluate in priority order.
          </p>
        </div>

        <button
          onClick={() => {
            setTargetCategoryForNewRule(null);
            setIsCreateModalOpen(true);
          }}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white bg-accent-default hover:bg-accent-hover transition-colors shadow-2xs cursor-pointer shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>New Categorization Rule</span>
        </button>
      </div>

      {/* 2. Standard Category Taxonomy Cards */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-text-primary flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-text-muted" />
            <span>Semantic Categories</span>
          </span>
          <span className="text-text-muted font-mono text-[11px]">
            {Object.keys(CATEGORY_METADATA).length} core taxonomies
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {Object.entries(CATEGORY_METADATA).map(([modalityKey, meta]) => {
            const Icon = meta.icon;
            const customRulesCount = ruleCountsByModality[modalityKey] ?? 0;

            return (
              <div
                key={modalityKey}
                className="rounded-lg border border-border-subtle bg-bg-card p-3 flex flex-col justify-between space-y-2 hover:border-border-default transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className={`p-1.5 rounded-md ${meta.badge}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-semibold text-text-primary">{meta.label}</h4>
                      <span className="text-[10px] font-mono text-text-muted">
                        {customRulesCount === 1
                          ? "1 custom rule"
                          : `${customRulesCount} custom rules`}
                      </span>
                    </div>
                  </div>

                  <span className={`w-2 h-2 rounded-full ${meta.dot} mt-1`} />
                </div>

                <p className="text-[11px] text-text-secondary line-clamp-2 leading-relaxed">
                  {meta.description}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* 3. Custom Pattern Rules Table */}
      <div className="space-y-2.5 pt-2">
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-text-primary flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-accent-default" />
              <span>Pattern Matching Rules</span>
            </span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-bg-secondary text-text-secondary border border-border-subtle">
              {rules.length} total
            </span>
          </div>
          <span className="text-[11px] text-text-muted font-mono hidden sm:inline">
            Evaluated from priority #1 downwards
          </span>
        </div>

        {isRulesLoading ? (
          <LoadingState label="Loading custom rules..." />
        ) : rules.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border-default bg-bg-card p-8 text-center space-y-3">
            <div className="w-10 h-10 rounded-full bg-accent-subtle text-accent-default flex items-center justify-center mx-auto">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-xs font-semibold text-text-primary">No Custom Rules Yet</h4>
              <p className="text-xs text-text-muted mt-1 max-w-sm mx-auto">
                ProductiveHix automatically classifies telemetry using deterministic fallbacks. Create rules to map specific applications or domains directly to categories.
              </p>
            </div>
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="px-3 py-1.5 rounded-md text-xs font-medium text-white bg-accent-default hover:bg-accent-hover transition-colors shadow-2xs cursor-pointer inline-flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create First Rule</span>
            </button>
          </div>
        ) : (
          <div className="rounded-xl border border-border-subtle bg-bg-card divide-y divide-border-subtle overflow-hidden shadow-2xs">
            {/* Header */}
            <div className="flex items-center gap-3 px-3.5 py-2.5 bg-bg-secondary/40 text-[11px] font-mono text-text-tertiary uppercase tracking-wider select-none border-b border-border-subtle">
              <span className="w-16 shrink-0">Priority</span>
              <span className="w-48 shrink-0">Rule Name</span>
              <span className="flex-1 min-w-0">Pattern Matchers</span>
              <span className="w-36 shrink-0 hidden md:inline">Assigned Category</span>
              <span className="w-20 text-center shrink-0">Status</span>
              <span className="w-12 text-right shrink-0">Action</span>
            </div>

            {/* Rule Rows */}
            {rules.map((rule) => {
              const modalityKey = rule.assignedModality ?? "unknown";
              const meta = CATEGORY_METADATA[modalityKey] ?? CATEGORY_METADATA.unknown!;
              const Icon = meta.icon;

              return (
                <div
                  key={rule.id}
                  className={`flex items-center gap-3 px-3.5 py-2.5 transition-colors ${
                    rule.isEnabled ? "hover:bg-bg-secondary/40" : "opacity-50 bg-bg-secondary/20"
                  }`}
                >
                  {/* Priority */}
                  <div className="w-16 shrink-0 font-mono text-xs">
                    <span className="px-1.5 py-0.5 rounded bg-bg-secondary border border-border-subtle text-text-secondary font-medium">
                      #{rule.priority}
                    </span>
                  </div>

                  {/* Name */}
                  <div className="w-48 shrink-0 truncate">
                    <span className="text-xs font-medium text-text-primary block truncate">
                      {rule.name}
                    </span>
                    {rule.assignedContext && (
                      <span className="text-[10px] text-accent-default font-mono flex items-center gap-1 mt-0.5">
                        <Tag className="w-2.5 h-2.5" />
                        {rule.assignedContext}
                      </span>
                    )}
                  </div>

                  {/* Patterns */}
                  <div className="flex-1 min-w-0 flex flex-wrap items-center gap-1.5 font-mono text-[11px]">
                    {rule.applicationPattern && (
                      <span className="px-1.5 py-0.5 rounded bg-bg-secondary border border-border-subtle text-text-secondary truncate max-w-[200px]" title={`App: ${rule.applicationPattern}`}>
                        app: <span className="text-text-primary">{rule.applicationPattern}</span>
                      </span>
                    )}
                    {rule.domainPattern && (
                      <span className="px-1.5 py-0.5 rounded bg-bg-secondary border border-border-subtle text-text-secondary truncate max-w-[200px]" title={`Domain: ${rule.domainPattern}`}>
                        domain: <span className="text-text-primary">{rule.domainPattern}</span>
                      </span>
                    )}
                    {rule.titlePattern && (
                      <span className="px-1.5 py-0.5 rounded bg-bg-secondary border border-border-subtle text-text-secondary truncate max-w-[200px]" title={`Title: ${rule.titlePattern}`}>
                        title: <span className="text-text-primary">{rule.titlePattern}</span>
                      </span>
                    )}
                  </div>

                  {/* Assigned Modality */}
                  <div className="w-36 shrink-0 hidden md:flex items-center gap-1.5">
                    <Icon className={`w-3.5 h-3.5 ${meta.color}`} />
                    <span className="text-xs text-text-primary truncate">{meta.label}</span>
                  </div>

                  {/* Enable / Disable Toggle */}
                  <div className="w-20 text-center shrink-0">
                    <button
                      onClick={() => handleToggleRule(rule)}
                      title={rule.isEnabled ? "Click to disable rule" : "Click to enable rule"}
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors cursor-pointer ${
                        rule.isEnabled
                          ? "bg-accent-subtle text-accent-default border border-accent-default/30"
                          : "bg-bg-tertiary text-text-muted border border-border-subtle"
                      }`}
                    >
                      {rule.isEnabled ? (
                        <>
                          <CheckCircle2 className="w-2.5 h-2.5" />
                          <span>Active</span>
                        </>
                      ) : (
                        <>
                          <XCircle className="w-2.5 h-2.5" />
                          <span>Off</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Delete Action */}
                  <div className="w-12 text-right shrink-0">
                    <button
                      onClick={() => handleDeleteRule(rule.id)}
                      title="Delete rule"
                      className="p-1 rounded text-text-muted hover:text-error hover:bg-error/10 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 4. Manual Overrides Section */}
      {overrides.length > 0 && (
        <div className="space-y-2.5 pt-4">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-text-primary flex items-center gap-1.5">
              <History className="w-3.5 h-3.5 text-text-muted" />
              <span>Block-Specific Manual Overrides</span>
            </span>
            <span className="text-text-muted font-mono text-[11px]">
              {overrides.length} override{overrides.length > 1 ? "s" : ""}
            </span>
          </div>

          <div className="rounded-xl border border-border-subtle bg-bg-card divide-y divide-border-subtle overflow-hidden text-xs">
            {overrides.map((ov) => (
              <div
                key={ov.id}
                className="flex items-center justify-between px-3.5 py-2.5 hover:bg-bg-secondary/40 transition-colors"
              >
                <div className="space-y-0.5 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-text-primary">{ov.targetApplication}</span>
                    <span className="text-text-muted">&bull;</span>
                    <span className="text-accent-default font-mono">
                      {ov.targetClaimType}: {ov.overriddenValue}
                    </span>
                  </div>
                  {ov.reason && (
                    <p className="text-[11px] text-text-muted truncate max-w-md">{ov.reason}</p>
                  )}
                </div>

                <button
                  onClick={() => handleDeleteOverride(ov.id)}
                  title="Remove override"
                  className="p-1 rounded text-text-muted hover:text-error hover:bg-error/10 transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
