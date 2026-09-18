"use client";

import React, { useState, useEffect } from "react";
import { X, Sliders, Tag, AlertCircle, Check } from "lucide-react";
import { useCreateActivityRule } from "@features/settings";
import type { TimelineBlock } from "@repo/types";

interface CreateRuleModalProps {
  initialBlock?: TimelineBlock | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

const CATEGORY_OPTIONS = [
  { value: "development", label: "Development (Code, Debug, Review)" },
  { value: "reading_research", label: "Reading & Research" },
  { value: "writing_documentation", label: "Writing & Docs" },
  { value: "communication", label: "Communication (Chat, Email, Calls)" },
  { value: "media_consumption", label: "Media (Videos, Podcasts, Music)" },
  { value: "gaming", label: "Gaming" },
  { value: "administration", label: "Administration & Settings" },
];

export function CreateRuleModal({
  initialBlock,
  isOpen,
  onClose,
  onSuccess,
}: CreateRuleModalProps) {
  const createRuleMutation = useCreateActivityRule();

  const [name, setName] = useState("");
  const [priority, setPriority] = useState(100);
  const [appPattern, setAppPattern] = useState("");
  const [domainPattern, setDomainPattern] = useState("");
  const [titlePattern, setTitlePattern] = useState("");
  const [assignedModality, setAssignedModality] = useState("development");
  const [assignedContext, setAssignedContext] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Pre-fill fields when an initialBlock is provided
  useEffect(() => {
    if (initialBlock) {
      setName(`Rule for ${initialBlock.primaryApplication}`);
      setAppPattern(`^${initialBlock.primaryApplication}$`);
      setDomainPattern(initialBlock.domain ? `^${initialBlock.domain.replace(/\./g, "\\.")}$` : "");
      setTitlePattern("");
      const primaryMod = initialBlock.modality.primary?.value;
      if (primaryMod && primaryMod !== "unknown" && primaryMod !== "idle_away") {
        setAssignedModality(primaryMod);
      } else {
        setAssignedModality("development");
      }
      setAssignedContext(initialBlock.intentLink?.projectTag ?? initialBlock.modality?.context?.value ?? "");
      setPriority(100);
    } else {
      setName("");
      setAppPattern("");
      setDomainPattern("");
      setTitlePattern("");
      setAssignedModality("development");
      setAssignedContext("");
      setPriority(100);
    }
    setError(null);
  }, [initialBlock, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError("Rule name is required.");
      return;
    }

    if (!appPattern.trim() && !domainPattern.trim() && !titlePattern.trim()) {
      setError("At least one matcher pattern (Application, Domain, or Window Title) is required.");
      return;
    }

    try {
      await createRuleMutation.mutateAsync({
        name: name.trim(),
        priority: Number(priority) || 100,
        isEnabled: true,
        applicationPattern: appPattern.trim() || undefined,
        domainPattern: domainPattern.trim() || undefined,
        titlePattern: titlePattern.trim() || undefined,
        assignedModality: assignedModality as any,
        assignedContext: assignedContext.trim() || undefined,
      });

      onSuccess?.();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create rule.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-bg-default/80 backdrop-blur-xs">
      <div className="w-full max-w-lg rounded-xl border border-border-default bg-bg-card shadow-2xl p-5 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-border-subtle">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-accent-subtle flex items-center justify-center text-accent-default shrink-0">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-text-primary">
                {initialBlock ? "Create Rule from Activity" : "New Categorization Rule"}
              </h3>
              <p className="text-xs text-text-muted">
                Deterministic pattern matching identical to ActivityWatch categories.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-text-muted hover:text-text-primary hover:bg-bg-secondary transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
          {/* Rule Name */}
          <div>
            <label className="block text-text-secondary font-medium mb-1">Rule Name</label>
            <input
              type="text"
              placeholder="e.g. VS Code Work, YouTube Study, Twitter"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-bg-secondary border border-border-default rounded-md px-3 py-1.5 text-text-primary outline-hidden focus:border-accent-default font-mono"
            />
          </div>

          {/* Category / Modality */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-text-secondary font-medium mb-1">Target Category</label>
              <select
                value={assignedModality}
                onChange={(e) => setAssignedModality(e.target.value)}
                className="w-full bg-bg-secondary border border-border-default rounded-md px-3 py-1.5 text-text-primary outline-hidden focus:border-accent-default"
              >
                {CATEGORY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-text-secondary font-medium mb-1">Priority (Lower = Higher)</label>
              <input
                type="number"
                min={1}
                max={999}
                value={priority}
                onChange={(e) => setPriority(Number(e.target.value))}
                className="w-full bg-bg-secondary border border-border-default rounded-md px-3 py-1.5 text-text-primary outline-hidden focus:border-accent-default font-mono"
              />
            </div>
          </div>

          {/* Context / Project Tag */}
          <div>
            <label className="block text-text-secondary font-medium mb-1 flex items-center gap-1.5">
              <Tag className="w-3 h-3 text-text-muted" />
              <span>Project / Context Tag (Optional)</span>
            </label>
            <input
              type="text"
              placeholder="e.g. ProductiveHix, ClientAlpha, Research"
              value={assignedContext}
              onChange={(e) => setAssignedContext(e.target.value)}
              className="w-full bg-bg-secondary border border-border-default rounded-md px-3 py-1.5 text-text-primary outline-hidden focus:border-accent-default font-mono"
            />
          </div>

          {/* Pattern Matchers */}
          <div className="space-y-2 pt-1">
            <span className="block text-text-secondary font-medium">
              Pattern Matchers (At least one required)
            </span>

            <div>
              <input
                type="text"
                placeholder="Application name (regex or exact: e.g. ^Code$|Brave)"
                value={appPattern}
                onChange={(e) => setAppPattern(e.target.value)}
                className="w-full bg-bg-secondary border border-border-default rounded-md px-3 py-1.5 text-text-primary outline-hidden focus:border-accent-default font-mono"
              />
            </div>

            <div>
              <input
                type="text"
                placeholder="Domain pattern (e.g. github\\.com|stackoverflow\\.com)"
                value={domainPattern}
                onChange={(e) => setDomainPattern(e.target.value)}
                className="w-full bg-bg-secondary border border-border-default rounded-md px-3 py-1.5 text-text-primary outline-hidden focus:border-accent-default font-mono"
              />
            </div>

            <div>
              <input
                type="text"
                placeholder="Window title pattern (e.g. PR #|Tutorial|Course)"
                value={titlePattern}
                onChange={(e) => setTitlePattern(e.target.value)}
                className="w-full bg-bg-secondary border border-border-default rounded-md px-3 py-1.5 text-text-primary outline-hidden focus:border-accent-default font-mono"
              />
            </div>
          </div>

          {error && (
            <div className="p-2.5 rounded-md bg-error/10 border border-error/20 text-error flex items-center gap-2 text-xs">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-border-subtle">
            <button
              type="button"
              onClick={onClose}
              disabled={createRuleMutation.isPending}
              className="px-3 py-1.5 rounded-md text-text-muted hover:text-text-primary hover:bg-bg-secondary transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createRuleMutation.isPending}
              className="px-3.5 py-1.5 rounded-md font-medium text-white bg-accent-default hover:bg-accent-hover transition-colors shadow-2xs cursor-pointer flex items-center gap-1.5"
            >
              <Check className="w-3.5 h-3.5" />
              <span>{createRuleMutation.isPending ? "Saving Rule..." : "Save Rule"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
