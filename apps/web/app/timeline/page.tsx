"use client";

import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Code,
  Globe,
  Coffee,
  MessageSquare,
  ChevronLeft,
  ChevronRight,
  Calendar,
  RefreshCw,
  Clock,
  Layers,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  FileText,
  Briefcase,
  PlaySquare,
  Gamepad2,
  Terminal,
  HelpCircle,
  Edit3,
  X,
  Sparkles,
  Search,
  Keyboard,
  SlidersHorizontal,
  Sliders,
  Plus,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useTimeline } from "../../src/hooks/queries/use-timeline";
import { evidenceDate } from "../../src/lib/analytics-presentation";
import { createActivityOverride } from "../../src/lib/api/rules";
import type { TimelineBlock } from "@repo/types";
import type { Variants } from "framer-motion";

import { PageContainer } from "../../components/layout/page-container";
import { PageHeader } from "../../components/layout/page-header";
import { Section } from "../../components/layout/section";
import { SectionHeader } from "../../components/layout/section-header";
import { EmptyState } from "../../components/primitives/empty-state";
import { LoadingState } from "../../components/primitives/loading-state";
import { CreateRuleModal } from "../../components/timeline/create-rule-modal";
import { CategoriesRulesManager } from "../../components/timeline/categories-rules-manager";

// Linear-inspired animation presets: crisp, ~150ms, ease-out
const containerVariants: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { duration: 0.15 },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 2 },
  show: { opacity: 1, y: 0, transition: { duration: 0.12, ease: "easeOut" } },
};

// Harmonized color schema aligned with Linear design standards & app theme tokens
export const modalityConfig: Record<
  string,
  {
    label: string;
    icon: typeof Code;
    color: string;
    dot: string;
    bar: string;
    badge: string;
  }
> = {
  development: {
    label: "Development",
    icon: Code,
    color: "text-accent-default",
    dot: "bg-accent-default",
    bar: "bg-accent-default",
    badge: "bg-accent-subtle text-accent-default border-accent-default/30",
  },
  reading_research: {
    label: "Reading & Research",
    icon: Globe,
    color: "text-sky-400",
    dot: "bg-sky-400",
    bar: "bg-sky-500",
    badge: "bg-sky-500/10 text-sky-400 border-sky-500/20",
  },
  writing_documentation: {
    label: "Writing & Docs",
    icon: FileText,
    color: "text-indigo-400",
    dot: "bg-indigo-400",
    bar: "bg-indigo-500",
    badge: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
  },
  communication: {
    label: "Communication",
    icon: MessageSquare,
    color: "text-purple-400",
    dot: "bg-purple-400",
    bar: "bg-purple-500",
    badge: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  },
  administration: {
    label: "Administration",
    icon: Briefcase,
    color: "text-amber-400",
    dot: "bg-amber-400",
    bar: "bg-amber-500",
    badge: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  },
  media_consumption: {
    label: "Media",
    icon: PlaySquare,
    color: "text-rose-400",
    dot: "bg-rose-400",
    bar: "bg-rose-500",
    badge: "bg-rose-500/10 text-rose-400 border-rose-500/20",
  },
  gaming: {
    label: "Gaming",
    icon: Gamepad2,
    color: "text-fuchsia-400",
    dot: "bg-fuchsia-400",
    bar: "bg-fuchsia-500",
    badge: "bg-fuchsia-500/10 text-fuchsia-400 border-fuchsia-500/20",
  },
  idle_away: {
    label: "Away (Idle)",
    icon: Coffee,
    color: "text-zinc-400",
    dot: "bg-zinc-400",
    bar: "bg-zinc-600",
    badge: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
  },
  system_maintenance: {
    label: "System",
    icon: Terminal,
    color: "text-slate-400",
    dot: "bg-slate-400",
    bar: "bg-slate-600",
    badge: "bg-slate-500/10 text-slate-400 border-slate-500/20",
  },
  unknown: {
    label: "Unknown",
    icon: HelpCircle,
    color: "text-zinc-400",
    dot: "bg-zinc-500",
    bar: "bg-zinc-700/80",
    badge: "bg-zinc-800/80 text-zinc-400 border-zinc-700/50",
  },
};

function formatDuration(totalSeconds: number): string {
  if (totalSeconds < 60) return `${Math.max(1, Math.round(totalSeconds))}s`;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours === 0) return `${minutes}m`;
  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
}

function formatClockTime(isoString: string): string {
  try {
    const d = new Date(isoString);
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: true });
  } catch {
    return "--:--";
  }
}

function formatTimeInterval(startIso: string, endIso: string): string {
  const start = formatClockTime(startIso);
  const end = formatClockTime(endIso);
  if (start === end) return start;
  return `${start} – ${end}`;
}

function formatDateLong(dateStr: string): string {
  try {
    const [y, m, d] = dateStr.split("-").map(Number);
    if (!y || !m || !d) return dateStr;
    const date = new Date(y, m - 1, d);
    return date.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

function getTodayString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatActivityDescriptor(block: TimelineBlock): string {
  if (block.isAfkBlock) {
    return "Away from keyboard";
  }
  const actTypeMap: Record<string, string> = {
    coding: "Coding",
    debugging: "Debugging",
    code_review: "Code Review",
    documentation: "Documentation",
    research: "Research",
    tutorial: "Tutorial",
    writing: "Writing",
    planning: "Planning",
    communication: "Communication",
    meeting: "Meeting",
    administration: "Administration",
    media: "Media",
    gaming: "Gaming",
    idle_away: "Away",
    unknown: "Activity",
  };
  const actType = block.activityType ? (actTypeMap[block.activityType] ?? block.activityType) : null;
  const context = block.modality.context?.value ?? null;
  const modLabel = modalityConfig[block.modality.primary?.value ?? "unknown"]?.label ?? "Activity";

  const primaryLabel = actType || modLabel;
  if (context && context.toLowerCase() !== primaryLabel.toLowerCase()) {
    return `${primaryLabel} · ${context}`;
  }
  return primaryLabel;
}

// -----------------------------------------------------------------------------
// CORRECTION MODAL (Linear Style: sharp, 1px border, fast)
// -----------------------------------------------------------------------------
interface CorrectionModalProps {
  block: TimelineBlock | null;
  onClose: () => void;
  onSuccess: () => void;
}

function CorrectionModal({ block, onClose, onSuccess }: CorrectionModalProps) {
  const [selectedModality, setSelectedModality] = useState<string>(
    block?.modality.primary?.value ?? "development"
  );
  const [topicContext, setTopicContext] = useState<string>(
    block?.modality.context?.value ?? ""
  );
  const [reason, setReason] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!block) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      // 1. Submit primary modality override
      await createActivityOverride({
        targetTimeWindowStart: block.startTime,
        targetTimeWindowEnd: block.endTime,
        targetApplication: block.primaryApplication,
        targetClaimFamily: "CLASSIFICATION",
        targetClaimType: "MODALITY_PRIMARY",
        overriddenValue: selectedModality,
        reason: reason.trim() || undefined,
      });

      // 2. Submit topic context override if provided
      if (topicContext.trim()) {
        await createActivityOverride({
          targetTimeWindowStart: block.startTime,
          targetTimeWindowEnd: block.endTime,
          targetApplication: block.primaryApplication,
          targetClaimFamily: "INTENT_ASSOCIATION",
          targetClaimType: "TOPIC_CONTEXT",
          overriddenValue: topicContext.trim(),
          reason: reason.trim() || undefined,
        });
      }

      onSuccess();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save classification override");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 animate-in fade-in duration-100">
      <div className="bg-bg-card border border-border-default rounded-lg max-w-lg w-full p-5 shadow-2xl space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-border-subtle">
          <div className="flex items-center gap-2">
            <Edit3 className="w-4 h-4 text-accent-default" />
            <h3 className="text-sm font-semibold text-text-primary">Correct Classification</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-text-tertiary hover:text-text-primary hover:bg-bg-secondary transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="text-xs space-y-1 bg-bg-secondary/70 p-3 rounded border border-border-subtle font-mono">
          <div className="flex justify-between">
            <span className="text-text-tertiary">Time Interval:</span>
            <span className="text-text-primary font-semibold">
              {formatTimeInterval(block.startTime, block.endTime)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-tertiary">Application:</span>
            <span className="text-text-primary font-semibold">{block.primaryApplication}</span>
          </div>
          {block.cleanTitle && (
            <div className="flex justify-between truncate">
              <span className="text-text-tertiary">Title:</span>
              <span className="text-text-secondary truncate max-w-[280px]">{block.cleanTitle}</span>
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
          <div>
            <label className="block text-text-secondary font-medium mb-1">
              Assigned Modality
            </label>
            <select
              value={selectedModality}
              onChange={(e) => setSelectedModality(e.target.value)}
              className="w-full bg-bg-secondary border border-border-default rounded px-3 py-2 text-text-primary focus:outline-hidden focus:border-accent-default"
            >
              {Object.keys(modalityConfig).map((mod) => (
                <option key={mod} value={mod}>
                  {modalityConfig[mod]?.label ?? mod}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-text-secondary font-medium mb-1">
              Topic / Project Context (Optional)
            </label>
            <input
              type="text"
              placeholder="e.g. ProductiveHix, System Blueprint, Research"
              value={topicContext}
              onChange={(e) => setTopicContext(e.target.value)}
              className="w-full bg-bg-secondary border border-border-default rounded px-3 py-2 text-text-primary placeholder:text-text-tertiary focus:outline-hidden focus:border-accent-default font-mono"
            />
          </div>

          <div>
            <label className="block text-text-secondary font-medium mb-1">
              Correction Reason (Optional)
            </label>
            <input
              type="text"
              placeholder="e.g. Researching framework documentation for project"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full bg-bg-secondary border border-border-default rounded px-3 py-2 text-text-primary placeholder:text-text-tertiary focus:outline-hidden focus:border-accent-default"
            />
          </div>

          {error && (
            <div className="p-2.5 rounded bg-error/10 border border-error/20 text-error flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-border-subtle">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-3 py-1.5 rounded text-text-secondary hover:text-text-primary hover:bg-bg-secondary transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-3.5 py-1.5 rounded font-medium text-white bg-accent-default hover:bg-accent-hover transition-colors shadow-2xs flex items-center gap-1.5"
            >
              {isSubmitting && <RefreshCw className="w-3 h-3 animate-spin" />}
              Save Override
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// KEYBOARD SHORTCUTS MODAL (Linear Style)
// -----------------------------------------------------------------------------
function KeyboardShortcutsModal({ onClose }: { onClose: () => void }) {
  const shortcuts = [
    { key: "j / ↓", desc: "Select next block" },
    { key: "k / ↑", desc: "Select previous block" },
    { key: "Enter / Space", desc: "Toggle block detail drawer" },
    { key: "c / e", desc: "Correct selected block" },
    { key: "r", desc: "Create rule from selected block" },
    { key: "t", desc: "Jump to today" },
    { key: "[", desc: "Navigate to previous day" },
    { key: "]", desc: "Navigate to next day" },
    { key: "?", desc: "Toggle keyboard shortcuts" },
    { key: "Esc", desc: "Close modal / drawer" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 animate-in fade-in duration-100">
      <div className="bg-bg-card border border-border-default rounded-lg max-w-md w-full p-5 shadow-2xl space-y-4">
        <div className="flex items-center justify-between pb-2.5 border-b border-border-subtle">
          <div className="flex items-center gap-2">
            <Keyboard className="w-4 h-4 text-accent-default" />
            <h3 className="text-sm font-semibold text-text-primary">Keyboard Navigation</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-text-tertiary hover:text-text-primary hover:bg-bg-secondary transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="divide-y divide-border-subtle text-xs">
          {shortcuts.map((s) => (
            <div key={s.key} className="flex items-center justify-between py-2">
              <span className="text-text-secondary">{s.desc}</span>
              <kbd className="px-2 py-0.5 font-mono text-[11px] bg-bg-secondary border border-border-default rounded text-text-primary">
                {s.key}
              </kbd>
            </div>
          ))}
        </div>

        <div className="pt-2 flex justify-end">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded text-xs font-medium text-text-primary bg-bg-secondary border border-border-default hover:bg-bg-tertiary transition-colors"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// MAIN TIMELINE PAGE
// -----------------------------------------------------------------------------
export default function TimelinePage() {
  const queryClient = useQueryClient();
  const [selectedDate, setSelectedDate] = useState<string>(() => getTodayString());

  useEffect(() => {
    const syncDate = () => {
      const date = new URLSearchParams(window.location.search).get("date");
      if (date && evidenceDate(date)) setSelectedDate(date);
    };
    syncDate();
    window.addEventListener("popstate", syncDate);
    return () => window.removeEventListener("popstate", syncDate);
  }, []);

  const [activeTab, setActiveTab] = useState<"timeline" | "rules">("timeline");
  const [filterModality, setFilterModality] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [density, setDensity] = useState<"compact" | "comfortable">("comfortable");
  const [selectedBlockIndex, setSelectedBlockIndex] = useState<number | null>(null);
  const [expandedBlockId, setExpandedBlockId] = useState<string | null>(null);
  const [correctingBlock, setCorrectingBlock] = useState<TimelineBlock | null>(null);
  const [ruleModalBlock, setRuleModalBlock] = useState<TimelineBlock | null>(null);
  const [isCreateRuleOpen, setIsCreateRuleOpen] = useState(false);
  const [hoveredBlock, setHoveredBlock] = useState<TimelineBlock | null>(null);
  const [isShortcutsHelpOpen, setIsShortcutsHelpOpen] = useState(false);

  const isToday = selectedDate === getTodayString();

  // Fetch real timeline from backend via React Query
  const { data, isLoading, isError, refetch, isFetching } = useTimeline(selectedDate);

  // Date Navigation Handlers
  const handlePrevDay = () => {
    const [y, m, d] = selectedDate.split("-").map(Number);
    if (!y || !m || !d) return;
    const date = new Date(y, m - 1, d);
    date.setDate(date.getDate() - 1);
    const prevStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    setSelectedDate(prevStr);
    setSelectedBlockIndex(null);
  };

  const handleNextDay = () => {
    if (isToday) return;
    const [y, m, d] = selectedDate.split("-").map(Number);
    if (!y || !m || !d) return;
    const date = new Date(y, m - 1, d);
    date.setDate(date.getDate() + 1);
    const nextStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    setSelectedDate(nextStr);
    setSelectedBlockIndex(null);
  };

  const handleGoToday = () => {
    setSelectedDate(getTodayString());
    setSelectedBlockIndex(null);
  };

  const blocks = data?.blocks || [];
  const summary = data?.summary;
  const currentActivity = data?.currentActivity;

  // Filter semantic blocks (by modality and search query)
  const filteredBlocks = useMemo(() => {
    return blocks.filter((b) => {
      const primaryMod = b.modality.primary?.value ?? "unknown";
      const matchesMod = filterModality === "all" || primaryMod === filterModality;
      if (!matchesMod) return false;

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      const titleMatch = b.cleanTitle?.toLowerCase().includes(q);
      const appMatch = b.primaryApplication.toLowerCase().includes(q);
      const domainMatch = b.domain?.toLowerCase().includes(q);
      const actMatch = b.activityType?.toLowerCase().includes(q);
      return Boolean(titleMatch || appMatch || domainMatch || actMatch);
    });
  }, [blocks, filterModality, searchQuery]);

  // Filter counts for blocks
  const blockModalityCounts = useMemo(() => {
    const counts: Record<string, number> = { all: blocks.length };
    for (const b of blocks) {
      const mod = b.modality.primary?.value ?? "unknown";
      counts[mod] = (counts[mod] ?? 0) + 1;
    }
    return counts;
  }, [blocks]);

  // Daily Flow Bar total duration
  const totalSemanticTrackedMs = useMemo(
    () => blocks.reduce((acc, b) => acc + (b.wallClockDurationMs || b.observedActiveDurationMs), 0),
    [blocks]
  );

  // Keyboard navigation listener (Linear principle #1: Keyboard-first)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable ||
        correctingBlock !== null ||
        isCreateRuleOpen ||
        isShortcutsHelpOpen
      ) {
        if (e.key === "Escape") {
          setIsShortcutsHelpOpen(false);
          setCorrectingBlock(null);
          setIsCreateRuleOpen(false);
        }
        return;
      }

      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedBlockIndex((prev) => {
          if (filteredBlocks.length === 0) return null;
          const next = prev === null ? 0 : Math.min(prev + 1, filteredBlocks.length - 1);
          const el = document.getElementById(`block-${filteredBlocks[next]?.id}`);
          if (el) el.scrollIntoView({ behavior: "smooth", block: "nearest" });
          return next;
        });
      } else if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedBlockIndex((prev) => {
          if (filteredBlocks.length === 0) return null;
          const next = prev === null ? filteredBlocks.length - 1 : Math.max(prev - 1, 0);
          const el = document.getElementById(`block-${filteredBlocks[next]?.id}`);
          if (el) el.scrollIntoView({ behavior: "smooth", block: "nearest" });
          return next;
        });
      } else if (e.key === "Enter" || e.key === " ") {
        if (selectedBlockIndex !== null && filteredBlocks[selectedBlockIndex]) {
          e.preventDefault();
          const bId = filteredBlocks[selectedBlockIndex].id;
          setExpandedBlockId((prev) => (prev === bId ? null : bId));
        }
      } else if (e.key === "c" || e.key === "e") {
        if (selectedBlockIndex !== null && filteredBlocks[selectedBlockIndex]) {
          e.preventDefault();
          setCorrectingBlock(filteredBlocks[selectedBlockIndex]);
        }
      } else if (e.key === "r") {
        if (selectedBlockIndex !== null && filteredBlocks[selectedBlockIndex]) {
          e.preventDefault();
          setRuleModalBlock(filteredBlocks[selectedBlockIndex]);
          setIsCreateRuleOpen(true);
        }
      } else if (e.key === "t") {
        e.preventDefault();
        handleGoToday();
      } else if (e.key === "[") {
        e.preventDefault();
        handlePrevDay();
      } else if (e.key === "]") {
        e.preventDefault();
        handleNextDay();
      } else if (e.key === "?") {
        e.preventDefault();
        setIsShortcutsHelpOpen(true);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [filteredBlocks, selectedBlockIndex, correctingBlock, isCreateRuleOpen, isShortcutsHelpOpen]);

  return (
    <PageContainer>
      {/* Correction Modal */}
      {correctingBlock && (
        <CorrectionModal
          block={correctingBlock}
          onClose={() => setCorrectingBlock(null)}
          onSuccess={() => {
            setCorrectingBlock(null);
            queryClient.invalidateQueries({ queryKey: ["activity", "timeline"] });
            refetch();
          }}
        />
      )}

      {/* Create Rule Modal */}
      {isCreateRuleOpen && (
        <CreateRuleModal
          initialBlock={ruleModalBlock}
          isOpen={isCreateRuleOpen}
          onClose={() => {
            setIsCreateRuleOpen(false);
            setRuleModalBlock(null);
          }}
          onSuccess={() => {
            setIsCreateRuleOpen(false);
            setRuleModalBlock(null);
            queryClient.invalidateQueries({ queryKey: ["activity", "timeline"] });
            refetch();
          }}
        />
      )}

      {/* Keyboard Shortcuts Legend Modal */}
      {isShortcutsHelpOpen && (
        <KeyboardShortcutsModal onClose={() => setIsShortcutsHelpOpen(false)} />
      )}

      {/* 1. Universal Page Header with Breadcrumbs & Actions */}
      <PageHeader
        title="Timeline"
        subtitle="Deterministic observation-backed temporal blocks and semantic activity"
        breadcrumbs={[
          { label: "Home", href: "/" },
          { label: "Timeline" },
        ]}
        dateContext={activeTab === "timeline" ? formatDateLong(selectedDate) : undefined}
        actions={
          <div className="flex items-center gap-2">
            {activeTab === "timeline" && isToday && (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Live
              </span>
            )}

            {activeTab === "timeline" && (
              <>
                {/* Date Controls */}
                <div className="inline-flex items-center rounded-lg border border-border-default bg-bg-card p-0.5 shadow-2xs">
                  <button
                    onClick={handlePrevDay}
                    title="Previous Day (Press [)"
                    className="p-1 rounded text-text-secondary hover:text-text-primary hover:bg-bg-secondary transition-colors cursor-pointer"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>

                  <label className="relative flex items-center gap-1.5 px-2.5 py-0.5 cursor-pointer group">
                    <Calendar className="w-3 h-3 text-accent-default" />
                    <span className="text-xs font-mono font-medium text-text-primary">
                      {selectedDate}
                    </span>
                    <input
                      type="date"
                      value={selectedDate}
                      max={getTodayString()}
                      onChange={(e) => e.target.value && setSelectedDate(e.target.value)}
                      className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                    />
                  </label>

                  <button
                    onClick={handleNextDay}
                    disabled={isToday}
                    title="Next Day (Press ])"
                    className={`p-1 rounded transition-colors cursor-pointer ${
                      isToday
                        ? "text-text-tertiary cursor-not-allowed opacity-30"
                        : "text-text-secondary hover:text-text-primary hover:bg-bg-secondary"
                    }`}
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                {!isToday && (
                  <button
                    onClick={handleGoToday}
                    title="Jump to Today (Press t)"
                    className="px-2.5 py-1 rounded-lg text-xs font-medium text-accent-default bg-accent-subtle border border-accent-default/30 hover:bg-accent-default/20 transition-all cursor-pointer"
                  >
                    Today
                  </button>
                )}

                <button
                  onClick={() => refetch()}
                  disabled={isFetching}
                  title="Refresh Timeline"
                  className="p-1.5 rounded-lg text-text-secondary hover:text-text-primary bg-bg-card border border-border-default hover:bg-bg-secondary transition-all cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin text-accent-default" : ""}`} />
                </button>
              </>
            )}

            <button
              onClick={() => {
                setRuleModalBlock(null);
                setIsCreateRuleOpen(true);
              }}
              title="New Categorization Rule"
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-text-primary bg-bg-card border border-border-default hover:bg-bg-secondary hover:border-border-strong transition-all cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 text-accent-default" />
              <span className="hidden sm:inline">Add Rule</span>
            </button>

            <button
              onClick={() => setIsShortcutsHelpOpen(true)}
              title="Keyboard Shortcuts (Press ?)"
              className="p-1.5 rounded-lg text-text-secondary hover:text-text-primary bg-bg-card border border-border-default hover:bg-bg-secondary transition-all cursor-pointer"
            >
              <Keyboard className="w-3.5 h-3.5" />
            </button>
          </div>
        }
      >
        {/* Linear-Style Segmented View Switcher */}
        <div className="flex items-center gap-1 p-0.5 rounded-lg bg-bg-card border border-border-subtle w-fit mt-1">
          <button
            onClick={() => setActiveTab("timeline")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer ${
              activeTab === "timeline"
                ? "bg-bg-secondary text-text-primary shadow-2xs border border-border-default font-semibold"
                : "text-text-muted hover:text-text-primary border border-transparent"
            }`}
          >
            <Clock className="w-3.5 h-3.5 text-accent-default" />
            <span>Activity Timeline</span>
          </button>

          <button
            onClick={() => setActiveTab("rules")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer ${
              activeTab === "rules"
                ? "bg-bg-secondary text-text-primary shadow-2xs border border-border-default font-semibold"
                : "text-text-muted hover:text-text-primary border border-transparent"
            }`}
          >
            <Sliders className="w-3.5 h-3.5 text-accent-default" />
            <span>Categories &amp; Rules</span>
          </button>
        </div>
      </PageHeader>

      {/* RENDER VIEW: CATEGORIES & RULES */}
      {activeTab === "rules" && (
        <CategoriesRulesManager
          onRuleChanged={() => {
            queryClient.invalidateQueries({ queryKey: ["activity", "timeline"] });
            refetch();
          }}
        />
      )}

      {/* RENDER VIEW: TIMELINE */}
      {activeTab === "timeline" && (
        <div className="space-y-6">
          {/* 2. Live Activity Strip (When Active Today) */}
          {isToday && currentActivity && (
            <div className="flex items-center justify-between px-3.5 py-2.5 rounded-xl border border-border-subtle bg-bg-card/70 backdrop-blur-xs text-xs">
              <div className="flex items-center gap-2.5 truncate">
                <span className="relative flex h-2 w-2 shrink-0">
                  {currentActivity.isActive && (
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  )}
                  <span
                    className={`relative inline-flex rounded-full h-2 w-2 ${
                      currentActivity.isActive ? "bg-emerald-400" : "bg-amber-400"
                    }`}
                  />
                </span>

                <span className="font-semibold text-text-primary truncate">
                  {currentActivity.application || "Idle"}
                </span>

                {currentActivity.title && currentActivity.title !== currentActivity.application && (
                  <>
                    <span className="text-text-tertiary">&bull;</span>
                    <span className="text-text-secondary truncate max-w-md">
                      {currentActivity.title}
                    </span>
                  </>
                )}
              </div>

              {currentActivity.runningForSeconds !== null && (
                <div className="shrink-0 flex items-center gap-1.5 text-text-tertiary font-mono text-[11px]">
                  <Clock className="w-3 h-3 text-accent-default" />
                  <span>Running:</span>
                  <span className="text-text-primary font-medium">
                    {formatDuration(currentActivity.runningForSeconds)}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* 3. Workload Metric Ribbon (Unified with Linear design: restrained colors, mono numbers) */}
          <div className="rounded-xl border border-border-subtle bg-bg-card grid grid-cols-2 md:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-border-subtle overflow-hidden">
            {/* Total Tracked */}
            <div className="p-4 flex flex-col justify-between space-y-1">
              <div className="flex items-center justify-between text-xs text-text-muted">
                <span>Total Tracked</span>
                <Clock className="w-3.5 h-3.5 text-text-muted" />
              </div>
              <p className="text-xl sm:text-2xl font-bold font-mono tracking-tight text-text-primary">
                {summary ? formatDuration(summary.totalTrackedMs / 1000) : "0m"}
              </p>
              <span className="text-xs text-text-muted font-mono">
                {blocks.length} semantic blocks
              </span>
            </div>

            {/* Development */}
            <div className="p-4 flex flex-col justify-between space-y-1">
              <div className="flex items-center justify-between text-xs text-text-muted">
                <span>Development</span>
                <Code className="w-3.5 h-3.5 text-accent-default" />
              </div>
              <p className="text-xl sm:text-2xl font-bold font-mono tracking-tight text-text-primary">
                {summary ? formatDuration((summary.developmentMs ?? 0) / 1000) : "0m"}
              </p>
              <span className="text-xs text-text-muted font-mono">
                Coding, Debugging &amp; Review
              </span>
            </div>

            {/* Reading & Docs */}
            <div className="p-4 flex flex-col justify-between space-y-1">
              <div className="flex items-center justify-between text-xs text-text-muted">
                <span>Reading &amp; Docs</span>
                <Globe className="w-3.5 h-3.5 text-sky-400" />
              </div>
              <p className="text-xl sm:text-2xl font-bold font-mono tracking-tight text-text-primary">
                {summary
                  ? formatDuration(
                      ((summary.readingResearchMs ?? 0) + (summary.writingDocumentationMs ?? 0)) / 1000
                    )
                  : "0m"}
              </p>
              <span className="text-xs text-text-muted font-mono">
                Docs, Specs &amp; Research
              </span>
            </div>

            {/* Comms & Media */}
            <div className="p-4 flex flex-col justify-between space-y-1">
              <div className="flex items-center justify-between text-xs text-text-muted">
                <span>Comms &amp; Media</span>
                <MessageSquare className="w-3.5 h-3.5 text-purple-400" />
              </div>
              <p className="text-xl sm:text-2xl font-bold font-mono tracking-tight text-text-primary">
                {summary
                  ? formatDuration(
                      ((summary.communicationModalityMs ?? 0) +
                        (summary.mediaConsumptionMs ?? 0) +
                        (summary.gamingMs ?? 0) +
                        (summary.administrationMs ?? 0)) /
                        1000
                    )
                  : "0m"}
              </p>
              <span className="text-xs text-text-muted font-mono">
                Chat, Media, Games &amp; Admin
              </span>
            </div>
          </div>

          {/* 4. Daily Flow Visualization Stream */}
          {blocks.length > 0 && totalSemanticTrackedMs > 0 && (
            <Section>
              <SectionHeader
                title="Daily Flow Stream"
                description="Proportional 24-hour visual distribution of recorded semantic blocks"
                action={
                  <span className="font-mono text-xs text-text-muted">
                    {formatClockTime(blocks[0]?.startTime ?? "")} &rarr;{" "}
                    {formatClockTime(blocks[blocks.length - 1]?.endTime ?? "")}
                  </span>
                }
              />
              <div className="rounded-xl border border-border-subtle bg-bg-card p-4 space-y-3">
                <div className="relative">
                  {/* Proportional Stream Bar */}
                  <div className="flex h-7 w-full rounded-lg overflow-hidden bg-bg-secondary p-0.5 gap-px">
                    {blocks.map((block) => {
                      const blockDuration = block.wallClockDurationMs || block.observedActiveDurationMs;
                      const widthPercent = (blockDuration / totalSemanticTrackedMs) * 100;
                      const primaryMod = block.modality.primary?.value ?? "unknown";
                      const config = modalityConfig[primaryMod] ?? modalityConfig.unknown!;
                      const isHovered = hoveredBlock?.id === block.id;

                      return (
                        <div
                          key={block.id}
                          onMouseEnter={() => setHoveredBlock(block)}
                          onMouseLeave={() => setHoveredBlock(null)}
                          onClick={() => {
                            setExpandedBlockId(block.id);
                            const el = document.getElementById(`block-${block.id}`);
                            if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
                          }}
                          className={`relative cursor-pointer transition-all duration-100 rounded-2xs ${config.bar} ${
                            isHovered ? "brightness-125 scale-y-110 z-10 shadow-xs" : "opacity-90 hover:opacity-100"
                          }`}
                          style={{ width: `${Math.max(widthPercent, 0.4)}%` }}
                        />
                      );
                    })}
                  </div>

                  {/* Hover Tooltip Card */}
                  {hoveredBlock && (
                    <div className="absolute -top-11 left-1/2 -translate-x-1/2 z-30 pointer-events-none bg-bg-default border border-border-strong rounded-lg px-2.5 py-1 shadow-2xl flex items-center gap-2 whitespace-nowrap text-xs font-mono">
                      <span className="font-semibold text-text-primary">{hoveredBlock.primaryApplication}</span>
                      <span className="text-text-tertiary">&bull;</span>
                      <span className="text-accent-default">{formatActivityDescriptor(hoveredBlock)}</span>
                      <span className="text-text-tertiary">&bull;</span>
                      <span className="text-text-secondary">
                        {formatClockTime(hoveredBlock.startTime)}–{formatClockTime(hoveredBlock.endTime)}
                      </span>
                      <span className="text-text-tertiary">&bull;</span>
                      <span className="text-text-primary font-bold">
                        {formatDuration(hoveredBlock.observedActiveDurationMs / 1000)}
                      </span>
                    </div>
                  )}
                </div>

                {/* Time Axis Markers */}
                <div className="flex justify-between text-[10px] font-mono text-text-tertiary px-0.5 select-none pt-0.5">
                  <span>12 AM</span>
                  <span>3 AM</span>
                  <span>6 AM</span>
                  <span>9 AM</span>
                  <span>12 PM</span>
                  <span>3 PM</span>
                  <span>6 PM</span>
                  <span>9 PM</span>
                  <span>12 AM</span>
                </div>
              </div>
            </Section>
          )}

          {/* 5. Chronological Block Feed */}
          <Section>
            <SectionHeader
              title="Activity Timeline"
              description="Chronological semantic blocks classified by deterministic rules and heuristics"
              action={
                <div className="flex items-center gap-2">
                  {/* Quick Search Input */}
                  <div className="relative">
                    <Search className="w-3 h-3 text-text-tertiary absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      placeholder="Search activity..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="bg-bg-card border border-border-default rounded-md pl-7 pr-2.5 py-1 text-xs text-text-primary placeholder:text-text-tertiary focus:outline-hidden focus:border-accent-default w-36 sm:w-48 font-mono"
                    />
                  </div>

                  {/* Density Toggle */}
                  <button
                    onClick={() => setDensity((d) => (d === "comfortable" ? "compact" : "comfortable"))}
                    title={`Switch to ${density === "comfortable" ? "Compact" : "Comfortable"} view`}
                    className="p-1.5 rounded-md border border-border-default bg-bg-card text-text-secondary hover:text-text-primary hover:bg-bg-secondary transition-colors cursor-pointer"
                  >
                    <SlidersHorizontal className="w-3.5 h-3.5" />
                  </button>

                  <span className="text-xs font-mono text-text-muted hidden md:inline">
                    {filteredBlocks.length} / {blocks.length}
                  </span>
                </div>
              }
            />

            {/* Modality Filter Pills */}
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                onClick={() => setFilterModality("all")}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                  filterModality === "all"
                    ? "bg-bg-secondary border border-border-default text-text-primary"
                    : "text-text-secondary hover:text-text-primary hover:bg-bg-secondary/50 border border-transparent"
                }`}
              >
                <span>All</span>
                <span className="text-[10px] font-mono px-1 rounded bg-bg-tertiary text-text-tertiary">
                  {blockModalityCounts.all ?? 0}
                </span>
              </button>

              {Object.entries(modalityConfig)
                .filter(([key]) => (blockModalityCounts[key] ?? 0) > 0)
                .map(([key, config]) => {
                  const isActive = filterModality === key;
                  return (
                    <button
                      key={key}
                      onClick={() => setFilterModality(key)}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                        isActive
                          ? "bg-bg-secondary border border-border-default text-text-primary"
                          : "text-text-secondary hover:text-text-primary hover:bg-bg-secondary/50 border border-transparent"
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
                      <span>{config.label}</span>
                      <span className="text-[10px] font-mono px-1 rounded bg-bg-tertiary text-text-tertiary">
                        {blockModalityCounts[key] ?? 0}
                      </span>
                    </button>
                  );
                })}
            </div>

            {/* Timeline Block Feed Content States */}
            {isLoading ? (
              <LoadingState label="Loading telemetry activity..." />
            ) : isError ? (
              <div className="bg-bg-card border border-error/20 rounded-xl p-8 text-center space-y-3">
                <div className="w-10 h-10 rounded-full bg-error/10 border border-error/20 text-error flex items-center justify-center mx-auto">
                  <AlertCircle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-text-primary">Unable to load timeline</h3>
                  <p className="text-xs text-text-secondary mt-1">
                    Could not retrieve telemetry activity. Please verify backend connection.
                  </p>
                </div>
                <button
                  onClick={() => refetch()}
                  className="px-3 py-1.5 rounded-md text-xs font-medium text-white bg-accent-default hover:bg-accent-hover transition-colors cursor-pointer"
                >
                  Retry Loading
                </button>
              </div>
            ) : filteredBlocks.length === 0 ? (
              <EmptyState
                icon={Clock}
                title={blocks.length === 0 ? "No Activity Recorded" : "No Matching Blocks"}
                description={
                  blocks.length === 0
                    ? "There is no telemetry data captured for this day."
                    : "Try clearing your modality filter or search query."
                }
              />
            ) : (
              <div className="rounded-xl border border-border-subtle bg-bg-card divide-y divide-border-subtle overflow-hidden shadow-2xs">
                {/* Table Header Row (Linear Style) */}
                <div className="flex items-center gap-3 px-3.5 py-2.5 bg-bg-secondary/40 text-[11px] font-mono text-text-tertiary uppercase tracking-wider select-none border-b border-border-subtle">
                  <span className="w-28 sm:w-32 shrink-0">Time Interval</span>
                  <span className="w-2.5 shrink-0" />
                  <span className="w-36 shrink-0 hidden sm:inline">Application</span>
                  <span className="flex-1 min-w-0">Activity &amp; Context</span>
                  <span className="w-28 text-right hidden md:inline">Modality</span>
                  <span className="w-20 text-right">Actions</span>
                </div>

                {/* Activity Rows */}
                {filteredBlocks.map((block, index) => {
                  const primaryMod = block.modality.primary?.value ?? "unknown";
                  const modCfg = modalityConfig[primaryMod] ?? modalityConfig.unknown!;
                  const ModIcon = modCfg.icon;
                  const isExpanded = expandedBlockId === block.id;
                  const isSelected = selectedBlockIndex === index;

                  const activeSec = Math.round(block.observedActiveDurationMs / 1000);
                  const pausedSec = Math.round(block.pausedDurationMs / 1000);

                  return (
                    <div
                      key={block.id}
                      id={`block-${block.id}`}
                      className="group transition-colors"
                    >
                      {/* Main Clickable Row */}
                      <div
                        onClick={() => setExpandedBlockId(isExpanded ? null : block.id)}
                        className={`flex items-center gap-3 px-3.5 cursor-pointer transition-colors ${
                          density === "compact" ? "py-1.5" : "py-2.5"
                        } ${
                          isSelected
                            ? "bg-bg-secondary/80 ring-1 ring-inset ring-accent-default/60"
                            : "hover:bg-bg-secondary/40"
                        }`}
                      >
                        {/* Column 1: Time Interval & Durations */}
                        <div className="w-28 sm:w-32 shrink-0 font-mono">
                          <div className="text-xs font-medium text-text-primary">
                            {formatTimeInterval(block.startTime, block.endTime)}
                          </div>
                          <div className="text-[10px] text-text-tertiary mt-0.5 flex items-center gap-1">
                            <span>{formatDuration(activeSec)}</span>
                            {pausedSec > 0 && (
                              <span className="text-amber-400">
                                &bull; {formatDuration(pausedSec)} idle
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Column 2: Status Dot Indicator */}
                        <div className="flex items-center justify-center w-2.5 shrink-0">
                          <span className={`w-2 h-2 rounded-full ${modCfg.dot}`} />
                        </div>

                        {/* Column 3: Application & Domain */}
                        <div className="w-36 shrink-0 hidden sm:flex items-center gap-1.5 truncate">
                          <ModIcon className={`w-3.5 h-3.5 ${modCfg.color} shrink-0`} />
                          <span className="text-xs font-medium text-text-primary truncate">
                            {block.primaryApplication}
                          </span>
                        </div>

                        {/* Column 4: Activity Descriptor & Clean Title */}
                        <div className="flex-1 min-w-0 flex items-center gap-2 text-xs truncate">
                          <span className="text-accent-default font-medium shrink-0">
                            {formatActivityDescriptor(block)}
                          </span>
                          {block.cleanTitle && (
                            <>
                              <span className="text-text-tertiary shrink-0">&bull;</span>
                              <span className="text-text-tertiary truncate group-hover:text-text-secondary transition-colors">
                                {block.cleanTitle}
                              </span>
                            </>
                          )}
                        </div>

                        {/* Column 5: Modality Pill Badge */}
                        <div className="w-28 text-right hidden md:flex justify-end shrink-0">
                          <span
                            className={`text-[10px] font-mono font-medium px-2 py-0.5 rounded border ${modCfg.badge}`}
                          >
                            {modCfg.label}
                          </span>
                        </div>

                        {/* Column 6: Actions & Chevron */}
                        <div className="w-20 shrink-0 flex items-center justify-end gap-1">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setRuleModalBlock(block);
                              setIsCreateRuleOpen(true);
                            }}
                            title="Create Rule from Activity (Press r)"
                            className="p-1 rounded text-text-muted hover:text-accent-default hover:bg-accent-subtle opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                          >
                            <Sliders className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setCorrectingBlock(block);
                            }}
                            title="Correct Classification (Press c)"
                            className="p-1 rounded text-text-tertiary hover:text-accent-default hover:bg-accent-subtle opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <div className="text-text-tertiary group-hover:text-text-secondary transition-colors">
                            {isExpanded ? (
                              <ChevronUp className="w-3.5 h-3.5" />
                            ) : (
                              <ChevronDown className="w-3.5 h-3.5" />
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Expandable Linear-Style Detail Drawer */}
                      <AnimatePresence>
                        {isExpanded && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.12 }}
                            className="overflow-hidden"
                          >
                            <div className="bg-bg-inset border-t border-border-subtle p-4 font-mono text-xs space-y-3.5">
                              {/* 4-Cell Metadata Strip */}
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 rounded-lg bg-bg-card border border-border-subtle">
                                <div>
                                  <span className="text-[10px] text-text-tertiary uppercase">Wall-Clock</span>
                                  <p className="font-semibold text-text-primary mt-0.5">
                                    {formatDuration(block.wallClockDurationMs / 1000)}
                                  </p>
                                </div>
                                <div>
                                  <span className="text-[10px] text-text-tertiary uppercase">Active Engagement</span>
                                  <p className="font-semibold text-accent-default mt-0.5">
                                    {formatDuration(block.observedActiveDurationMs / 1000)}
                                  </p>
                                </div>
                                <div>
                                  <span className="text-[10px] text-text-tertiary uppercase">Idle / Paused</span>
                                  <p className="font-semibold text-amber-400 mt-0.5">
                                    {formatDuration(block.pausedDurationMs / 1000)}
                                  </p>
                                </div>
                                <div>
                                  <span className="text-[10px] text-text-tertiary uppercase">Raw Observations</span>
                                  <p className="font-semibold text-text-secondary mt-0.5">
                                    {block.rawEventCount} events ({block.sourceChannel})
                                  </p>
                                </div>
                              </div>

                              {/* Semantic Claims & Inferences Strip */}
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                {/* Classification */}
                                <div className="p-3 rounded-lg bg-bg-card border border-border-subtle space-y-1">
                                  <span className="text-[10px] text-text-tertiary uppercase">Classification</span>
                                  <p className="font-semibold text-text-primary capitalize">
                                    {block.activityType ? block.activityType.replace(/_/g, " ") : "Unknown"}
                                  </p>
                                  <span className="text-[11px] text-text-tertiary">
                                    Modality: <span className="text-text-secondary">{primaryMod}</span>
                                  </span>
                                </div>

                                {/* Intent Association */}
                                <div className="p-3 rounded-lg bg-bg-card border border-border-subtle space-y-1">
                                  <span className="text-[10px] text-text-tertiary uppercase">Intent Alignment</span>
                                  <p className="font-semibold text-text-primary">
                                    {block.intentLink?.intentionRelationship ?? "UNLINKED"}
                                  </p>
                                  <span className="text-[11px] text-text-tertiary">
                                    Scope: <span className="text-text-secondary">{block.intentLink?.targetScope ?? "None"}</span>
                                  </span>
                                </div>

                                {/* Attention Evidence */}
                                <div className="p-3 rounded-lg bg-bg-card border border-border-subtle space-y-1">
                                  <span className="text-[10px] text-text-tertiary uppercase">Attention Evidence</span>
                                  <p className="font-semibold text-text-primary">
                                    {block.attention?.focusEvidenceState ?? "UNKNOWN"}
                                  </p>
                                  <span className="text-[11px] text-text-tertiary">
                                    Track: <span className="text-text-secondary">{block.track}</span>
                                  </span>
                                </div>
                              </div>

                              {/* Technical Provenance Footer */}
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-border-subtle text-[11px] text-text-tertiary">
                                <span className="truncate max-w-lg">
                                  Fingerprint: <span className="text-text-secondary">{block.observationSetFingerprint}</span>
                                </span>
                                <div className="flex items-center gap-3">
                                  <button
                                    onClick={() => {
                                      setRuleModalBlock(block);
                                      setIsCreateRuleOpen(true);
                                    }}
                                    className="inline-flex items-center gap-1 text-accent-default hover:underline cursor-pointer"
                                  >
                                    <Sliders className="w-3 h-3" />
                                    <span>Create Rule from Activity</span>
                                  </button>
                                  <button
                                    onClick={() => setCorrectingBlock(block)}
                                    className="inline-flex items-center gap-1 text-accent-default hover:underline cursor-pointer"
                                  >
                                    <Edit3 className="w-3 h-3" />
                                    <span>Correct Classification</span>
                                  </button>
                                </div>
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}
              </div>
            )}
          </Section>
        </div>
      )}
    </PageContainer>
  );
}
