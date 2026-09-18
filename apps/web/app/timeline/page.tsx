"use client";

import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Code,
  Globe,
  Coffee,
  MessageSquare,
  Laptop,
  ChevronLeft,
  ChevronRight,
  Calendar,
  Filter,
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
  CheckCircle2,
  Edit3,
  X,
  ShieldCheck,
  Tag,
  Sparkles,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useTimeline } from "../../src/hooks/queries/use-timeline";
import { evidenceDate } from "../../src/lib/analytics-presentation";
import { createActivityOverride } from "../../src/lib/api/rules";
import type { TimelineSegment, TimelineCategory, TimelineBlock } from "@repo/types";

// Animation presets: crisp, zero artificial delay
const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { duration: 0.15 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 4 },
  show: { opacity: 1, y: 0, transition: { duration: 0.15 } },
};

export const modalityConfig: Record<
  string,
  {
    label: string;
    icon: typeof Code;
    color: string;
    bg: string;
    border: string;
    badge: string;
    bar: string;
    dot: string;
  }
> = {
  development: {
    label: "Development",
    icon: Code,
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/25",
    badge: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    bar: "bg-emerald-500",
    dot: "bg-emerald-400 ring-emerald-500/30",
  },
  reading_research: {
    label: "Reading & Research",
    icon: Globe,
    color: "text-sky-400",
    bg: "bg-sky-500/10",
    border: "border-sky-500/25",
    badge: "bg-sky-500/15 text-sky-300 border-sky-500/30",
    bar: "bg-sky-500",
    dot: "bg-sky-400 ring-sky-500/30",
  },
  writing_documentation: {
    label: "Writing & Docs",
    icon: FileText,
    color: "text-indigo-400",
    bg: "bg-indigo-500/10",
    border: "border-indigo-500/25",
    badge: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30",
    bar: "bg-indigo-500",
    dot: "bg-indigo-400 ring-indigo-500/30",
  },
  communication: {
    label: "Communication",
    icon: MessageSquare,
    color: "text-purple-400",
    bg: "bg-purple-500/10",
    border: "border-purple-500/25",
    badge: "bg-purple-500/15 text-purple-300 border-purple-500/30",
    bar: "bg-purple-500",
    dot: "bg-purple-400 ring-purple-500/30",
  },
  administration: {
    label: "Administration",
    icon: Briefcase,
    color: "text-amber-400",
    bg: "bg-amber-500/10",
    border: "border-amber-500/25",
    badge: "bg-amber-500/15 text-amber-300 border-amber-500/30",
    bar: "bg-amber-500",
    dot: "bg-amber-400 ring-amber-500/30",
  },
  media_consumption: {
    label: "Media",
    icon: PlaySquare,
    color: "text-rose-400",
    bg: "bg-rose-500/10",
    border: "border-rose-500/25",
    badge: "bg-rose-500/15 text-rose-300 border-rose-500/30",
    bar: "bg-rose-500",
    dot: "bg-rose-400 ring-rose-500/30",
  },
  gaming: {
    label: "Gaming",
    icon: Gamepad2,
    color: "text-fuchsia-400",
    bg: "bg-fuchsia-500/10",
    border: "border-fuchsia-500/25",
    badge: "bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30",
    bar: "bg-fuchsia-500",
    dot: "bg-fuchsia-400 ring-fuchsia-500/30",
  },
  idle_away: {
    label: "Away (Idle)",
    icon: Coffee,
    color: "text-amber-400",
    bg: "bg-amber-500/10",
    border: "border-amber-500/25",
    badge: "bg-amber-500/15 text-amber-300 border-amber-500/30",
    bar: "bg-amber-500/90",
    dot: "bg-amber-400 ring-amber-500/30",
  },
  system_maintenance: {
    label: "System",
    icon: Terminal,
    color: "text-slate-400",
    bg: "bg-slate-500/10",
    border: "border-slate-500/25",
    badge: "bg-slate-500/15 text-slate-300 border-slate-500/30",
    bar: "bg-slate-600",
    dot: "bg-slate-400 ring-slate-500/30",
  },
  unknown: {
    label: "Unknown",
    icon: HelpCircle,
    color: "text-zinc-400",
    bg: "bg-zinc-500/10",
    border: "border-zinc-500/25",
    badge: "bg-zinc-500/15 text-zinc-300 border-zinc-500/30",
    bar: "bg-zinc-600",
    dot: "bg-zinc-400 ring-zinc-500/30",
  },
};

const categoryConfig: Record<
  TimelineCategory,
  {
    label: string;
    icon: typeof Code;
    color: string;
    bg: string;
    border: string;
    badge: string;
    bar: string;
    dot: string;
  }
> = {
  focused: {
    label: "Editors & terminal",
    icon: Code,
    color: "text-indigo-400",
    bg: "bg-indigo-500/10",
    border: "border-indigo-500/25",
    badge: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30",
    bar: "bg-indigo-500",
    dot: "bg-indigo-400 ring-indigo-500/30",
  },
  browser: {
    label: "Browser",
    icon: Globe,
    color: "text-violet-400",
    bg: "bg-violet-500/10",
    border: "border-violet-500/25",
    badge: "bg-violet-500/15 text-violet-300 border-violet-500/30",
    bar: "bg-violet-500",
    dot: "bg-violet-400 ring-violet-500/30",
  },
  break: {
    label: "Away (no input)",
    icon: Coffee,
    color: "text-amber-400",
    bg: "bg-amber-500/10",
    border: "border-amber-500/25",
    badge: "bg-amber-500/15 text-amber-300 border-amber-500/30",
    bar: "bg-amber-500/90",
    dot: "bg-amber-400 ring-amber-500/30",
  },
  communication: {
    label: "Communication",
    icon: MessageSquare,
    color: "text-text-primary",
    bg: "bg-bg-secondary",
    border: "border-border-strong",
    badge: "bg-bg-secondary text-text-primary border-border-strong",
    bar: "bg-text-primary",
    dot: "bg-text-primary ring-border-strong",
  },
  general: {
    label: "General",
    icon: Laptop,
    color: "text-slate-400",
    bg: "bg-slate-500/10",
    border: "border-slate-500/25",
    badge: "bg-slate-500/15 text-slate-300 border-slate-500/30",
    bar: "bg-slate-600",
    dot: "bg-slate-400 ring-slate-500/30",
  },
  leisure: {
    label: "Leisure",
    icon: Coffee,
    color: "text-rose-400",
    bg: "bg-rose-500/10",
    border: "border-rose-500/25",
    badge: "bg-rose-500/15 text-rose-300 border-rose-500/30",
    bar: "bg-rose-500",
    dot: "bg-rose-400 ring-rose-500/30",
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
      weekday: "long",
      month: "long",
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div className="bg-bg-card border border-border-default rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-border-subtle">
          <div className="flex items-center gap-2">
            <Edit3 className="w-4 h-4 text-accent-default" />
            <h3 className="text-base font-semibold text-text-primary">Correct Classification</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-text-secondary hover:text-text-primary hover:bg-bg-secondary transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="text-xs space-y-1 bg-bg-secondary p-3 rounded-xl border border-border-subtle font-mono">
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

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div>
            <label className="block text-text-secondary font-medium mb-1.5">
              Assigned Modality (Strict Functional Taxonomy)
            </label>
            <select
              value={selectedModality}
              onChange={(e) => setSelectedModality(e.target.value)}
              className="w-full bg-bg-secondary border border-border-default rounded-xl px-3 py-2 text-text-primary focus:outline-hidden focus:border-accent-default"
            >
              {Object.keys(modalityConfig).map((mod) => (
                <option key={mod} value={mod}>
                  {modalityConfig[mod]?.label ?? mod} ({mod})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-text-secondary font-medium mb-1.5">
              Topic / Project Context (Optional)
            </label>
            <input
              type="text"
              placeholder="e.g. ProductiveHix, System Blueprint, Research"
              value={topicContext}
              onChange={(e) => setTopicContext(e.target.value)}
              className="w-full bg-bg-secondary border border-border-default rounded-xl px-3 py-2 text-text-primary placeholder:text-text-tertiary focus:outline-hidden focus:border-accent-default font-mono"
            />
          </div>

          <div>
            <label className="block text-text-secondary font-medium mb-1.5">
              Correction Reason (Optional)
            </label>
            <input
              type="text"
              placeholder="e.g. Researching framework documentation for project"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full bg-bg-secondary border border-border-default rounded-xl px-3 py-2 text-text-primary placeholder:text-text-tertiary focus:outline-hidden focus:border-accent-default"
            />
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-error/10 border border-error/20 text-error flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border-subtle">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl text-text-secondary hover:text-text-primary hover:bg-bg-secondary transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl font-medium text-white bg-accent-default hover:bg-accent-hover transition-colors shadow-xs flex items-center gap-2"
            >
              {isSubmitting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
              Save Correction
            </button>
          </div>
        </form>
      </div>
    </div>
  );
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
    gaming: "Game",
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

  const [filterModality, setFilterModality] = useState<string>("all");
  const [expandedBlockId, setExpandedBlockId] = useState<string | null>(null);
  const [correctingBlock, setCorrectingBlock] = useState<TimelineBlock | null>(null);
  const [viewMode, setViewMode] = useState<"semantic" | "raw">("semantic");

  // Legacy segment support state
  const [filterCategory, setFilterCategory] = useState<"all" | TimelineCategory>("all");
  const [expandedSegmentId, setExpandedSegmentId] = useState<string | null>(null);
  const [hoveredSegment, setHoveredSegment] = useState<TimelineSegment | null>(null);
  const [hoveredBlock, setHoveredBlock] = useState<TimelineBlock | null>(null);

  const isToday = selectedDate === getTodayString();


  // Fetch real timeline from backend via React Query (cached with live sync for today)
  const { data, isLoading, isError, refetch, isFetching } = useTimeline(selectedDate);

  // Date Navigation Handlers
  const handlePrevDay = () => {
    const [y, m, d] = selectedDate.split("-").map(Number);
    if (!y || !m || !d) return;
    const date = new Date(y, m - 1, d);
    date.setDate(date.getDate() - 1);
    const prevStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    setSelectedDate(prevStr);
  };

  const handleNextDay = () => {
    if (isToday) return;
    const [y, m, d] = selectedDate.split("-").map(Number);
    if (!y || !m || !d) return;
    const date = new Date(y, m - 1, d);
    date.setDate(date.getDate() + 1);
    const nextStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    setSelectedDate(nextStr);
  };

  const handleGoToday = () => {
    setSelectedDate(getTodayString());
  };

  const segments = data?.segments || [];
  const blocks = data?.blocks || [];
  const summary = data?.summary;
  const currentActivity = data?.currentActivity;

  // Filter semantic blocks
  const filteredBlocks = useMemo(() => {
    if (filterModality === "all") return blocks;
    return blocks.filter((b) => (b.modality.primary?.value ?? "unknown") === filterModality);
  }, [blocks, filterModality]);

  // Filter legacy segments
  const filteredSegments = useMemo(() => {
    if (filterCategory === "all") return segments;
    return segments.filter((s) => s.category === filterCategory);
  }, [segments, filterCategory]);

  const hasBlocks = blocks.length > 0;
  const activeView = hasBlocks ? viewMode : "raw";

  // Filter counts for blocks
  const blockModalityCounts = useMemo(() => {
    const counts: Record<string, number> = { all: blocks.length };
    for (const b of blocks) {
      const mod = b.modality.primary?.value ?? "unknown";
      counts[mod] = (counts[mod] ?? 0) + 1;
    }
    return counts;
  }, [blocks]);

  // Daily Flow Bar segments
  const totalTrackedMs = summary?.totalTrackedMs || 0;
  const totalSemanticTrackedMs = useMemo(
    () => blocks.reduce((acc, b) => acc + (b.wallClockDurationMs || b.observedActiveDurationMs), 0),
    [blocks]
  );

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className="space-y-6 max-w-[1440px] mx-auto pb-12"
    >
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

      {/* 1. Header & Date Navigation */}
      <motion.div
        variants={itemVariants}
        className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-border-subtle"
      >
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-text-primary">Timeline</h1>
            {isToday && (
              <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-bg-secondary text-text-primary border border-border-strong">
                <span className="w-1.5 h-1.5 rounded-full bg-text-primary animate-pulse" />
                Live Today
              </span>
            )}
          </div>
          <p className="text-xs text-text-secondary mt-1 font-mono tracking-wide">
            Observation-backed activity &bull; {formatDateLong(selectedDate)}
          </p>
        </div>

        {/* View Switcher & Date Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {hasBlocks && (
            <div className="flex items-center bg-bg-card border border-border-default rounded-xl p-1 shadow-xs">
              <button
                onClick={() => setViewMode("semantic")}
                className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 ${
                  viewMode === "semantic"
                    ? "bg-accent-subtle text-accent-default border border-accent-default/30"
                    : "text-text-secondary hover:text-text-primary"
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                Semantic Blocks ({blocks.length})
              </button>
              <button
                onClick={() => setViewMode("raw")}
                className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 ${
                  viewMode === "raw"
                    ? "bg-accent-subtle text-accent-default border border-accent-default/30"
                    : "text-text-secondary hover:text-text-primary"
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                Raw Segments ({segments.length})
              </button>
            </div>
          )}

          <div className="flex items-center bg-bg-card border border-border-default rounded-xl p-1 shadow-xs">
            <button
              onClick={handlePrevDay}
              title="Previous Day"
              className="p-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-bg-secondary transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <label className="relative flex items-center gap-2 px-3 py-1 cursor-pointer group">
              <Calendar className="w-3.5 h-3.5 text-accent-default group-hover:opacity-80 transition-opacity" />
              <span className="text-xs font-medium text-text-primary font-mono">
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
              title="Next Day"
              className={`p-1.5 rounded-lg transition-colors ${
                isToday
                  ? "text-text-tertiary cursor-not-allowed opacity-40"
                  : "text-text-secondary hover:text-text-primary hover:bg-bg-secondary"
              }`}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {!isToday && (
            <button
              onClick={handleGoToday}
              className="px-3 py-1.5 rounded-xl text-xs font-medium text-accent-default bg-accent-subtle border border-accent-default/30 hover:bg-accent-default/20 transition-all"
            >
              Jump to Today
            </button>
          )}

          <button
            onClick={() => refetch()}
            disabled={isFetching}
            title="Refresh Timeline"
            className="p-2 rounded-xl text-text-secondary hover:text-text-primary bg-bg-card border border-border-default hover:bg-bg-secondary transition-all shadow-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin text-accent-default" : ""}`} />
          </button>
        </div>
      </motion.div>

      {/* 2. Current Activity Banner */}
      {isToday && currentActivity && (
        <motion.div
          variants={itemVariants}
          className="relative overflow-hidden bg-bg-card border border-accent-default/30 rounded-2xl p-4 shadow-sm"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="relative">
                <div
                  className={`w-3 h-3 rounded-full ${
                    currentActivity.isActive ? "bg-text-primary" : "bg-amber-500 dark:bg-amber-400"
                  }`}
                />
                {currentActivity.isActive && (
                  <div className="absolute inset-0 w-3 h-3 rounded-full bg-text-primary animate-ping opacity-75" />
                )}
              </div>

              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-mono tracking-wider uppercase text-text-tertiary">
                    CURRENT ACTIVITY
                  </span>
                  <span
                    className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                      currentActivity.isActive
                        ? "bg-bg-secondary text-text-primary border-border-strong"
                        : "bg-amber-500/15 text-amber-600 dark:text-amber-300 border-amber-500/30"
                    }`}
                  >
                    {currentActivity.isActive ? "ACTIVE" : "AFK / AWAY"}
                  </span>
                </div>

                <div className="flex items-baseline gap-2 mt-0.5">
                  <h3 className="text-sm font-semibold text-text-primary">
                    {currentActivity.application || "Idle"}
                  </h3>
                  {currentActivity.title && currentActivity.title !== currentActivity.application && (
                    <span className="text-xs text-text-secondary truncate max-w-[360px] sm:max-w-[480px]">
                      &bull; {currentActivity.title}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {currentActivity.runningForSeconds !== null && (
              <div className="flex items-center gap-2 self-start sm:self-auto bg-bg-secondary border border-border-subtle rounded-xl px-3 py-1.5">
                <Clock className="w-3.5 h-3.5 text-accent-default" />
                <span className="text-xs text-text-secondary">Running for:</span>
                <span className="text-xs font-mono font-semibold text-text-primary">
                  {formatDuration(currentActivity.runningForSeconds)}
                </span>
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* 3. Top Summary KPI Cards */}
      <motion.div variants={itemVariants} className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Total Tracked */}
        <div className="bg-bg-card border border-border-subtle rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-medium text-text-secondary">Total Tracked</span>
            <Clock className="w-4 h-4 text-text-tertiary" />
          </div>
          {isLoading ? (
            <div className="space-y-1.5 py-1">
              <div className="h-7 w-20 bg-bg-secondary animate-pulse rounded-lg" />
              <div className="h-3 w-28 bg-bg-secondary animate-pulse rounded" />
            </div>
          ) : (
            <>
              <p className="text-2xl font-bold tracking-tight text-text-primary">
                {summary ? formatDuration(summary.totalTrackedMs / 1000) : "0m"}
              </p>
              <p className="text-[11px] text-text-tertiary mt-1 font-mono">
                {hasBlocks ? `${blocks.length} semantic blocks` : `${segments.length} continuous blocks`}
              </p>
            </>
          )}
        </div>

        {/* Development */}
        <div className="bg-bg-card border border-border-subtle rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-medium text-emerald-400">Development</span>
            <Code className="w-4 h-4 text-emerald-400" />
          </div>
          {isLoading ? (
            <div className="space-y-1.5 py-1">
              <div className="h-7 w-20 bg-bg-secondary animate-pulse rounded-lg" />
              <div className="h-3 w-28 bg-bg-secondary animate-pulse rounded" />
            </div>
          ) : (
            <>
              <p className="text-2xl font-bold tracking-tight text-text-primary">
                {summary
                  ? hasBlocks
                    ? formatDuration((summary.developmentMs ?? 0) / 1000)
                    : formatDuration(summary.focusedMs / 1000)
                  : "0m"}
              </p>
              <p className="text-[11px] text-text-tertiary mt-1 font-mono">
                Coding, Debugging &amp; Review
              </p>
            </>
          )}
        </div>

        {/* Reading & Research */}
        <div className="bg-bg-card border border-border-subtle rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-medium text-sky-400">Reading &amp; Docs</span>
            <Globe className="w-4 h-4 text-sky-400" />
          </div>
          {isLoading ? (
            <div className="space-y-1.5 py-1">
              <div className="h-7 w-20 bg-bg-secondary animate-pulse rounded-lg" />
              <div className="h-3 w-28 bg-bg-secondary animate-pulse rounded" />
            </div>
          ) : (
            <>
              <p className="text-2xl font-bold tracking-tight text-text-primary">
                {summary
                  ? hasBlocks
                    ? formatDuration(((summary.readingResearchMs ?? 0) + (summary.writingDocumentationMs ?? 0)) / 1000)
                    : formatDuration(summary.browserMs / 1000)
                  : "0m"}
              </p>
              <p className="text-[11px] text-text-tertiary mt-1 font-mono">
                Docs, Specs &amp; Research
              </p>
            </>
          )}
        </div>

        {/* Other / Communication / Media / Gaming */}
        <div className="bg-bg-card border border-border-subtle rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-medium text-purple-400">Comms &amp; Media</span>
            <MessageSquare className="w-4 h-4 text-purple-400" />
          </div>
          {isLoading ? (
            <div className="space-y-1.5 py-1">
              <div className="h-7 w-20 bg-bg-secondary animate-pulse rounded-lg" />
              <div className="h-3 w-28 bg-bg-secondary animate-pulse rounded" />
            </div>
          ) : (
            <>
              <p className="text-2xl font-bold tracking-tight text-text-primary">
                {summary
                  ? hasBlocks
                    ? formatDuration(
                        ((summary.communicationModalityMs ?? 0) +
                          (summary.mediaConsumptionMs ?? 0) +
                          (summary.gamingMs ?? 0) +
                          (summary.administrationMs ?? 0)) /
                          1000
                      )
                    : formatDuration(summary.communicationMs / 1000)
                  : "0m"}
              </p>
              <p className="text-[11px] text-text-tertiary mt-1 font-mono">
                Comms, Media, Games &amp; Admin
              </p>
            </>
          )}
        </div>
      </motion.div>

      {/* 4. Daily Flow Proportional Visualization Bar */}
      {isLoading ? (
        <div className="bg-bg-card border border-border-subtle rounded-2xl p-5 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-text-secondary" />
              <div className="h-3 w-20 bg-bg-secondary animate-pulse rounded" />
            </div>
            <div className="h-3 w-24 bg-bg-secondary animate-pulse rounded" />
          </div>
          <div className="h-9 w-full rounded-xl bg-bg-secondary animate-pulse" />
        </div>
      ) : activeView === "semantic" ? (
        blocks.length > 0 && totalSemanticTrackedMs > 0 && (
          <motion.div
            variants={itemVariants}
            className="bg-bg-card border border-border-subtle rounded-2xl p-5 shadow-xs space-y-3"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-text-secondary" />
                <h3 className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
                  Daily Flow
                </h3>
              </div>
              <span className="text-xs font-mono text-text-secondary">
                {formatClockTime(blocks[0]?.startTime ?? "")} &rarr;{" "}
                {formatClockTime(blocks[blocks.length - 1]?.endTime ?? "")}
              </span>
            </div>

            <div className="relative">
              <div className="flex h-9 w-full rounded-xl overflow-hidden bg-bg-secondary p-0.5 gap-0.5">
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
                      className={`relative cursor-pointer transition-all duration-150 rounded-[4px] ${config.bar} ${
                        isHovered ? "brightness-125 scale-y-110 z-10 shadow-lg" : "opacity-90 hover:opacity-100"
                      }`}
                      style={{ width: `${Math.max(widthPercent, 0.4)}%` }}
                    />
                  );
                })}
              </div>

              {hoveredBlock && (
                <div className="absolute -top-12 left-1/2 -translate-x-1/2 z-30 pointer-events-none bg-bg-default border border-border-strong rounded-lg px-3 py-1.5 shadow-2xl flex items-center gap-2 whitespace-nowrap text-xs">
                  <span className="font-semibold text-text-primary">{hoveredBlock.primaryApplication}</span>
                  <span className="text-text-tertiary">&bull;</span>
                  <span className="text-accent-default font-mono">{formatActivityDescriptor(hoveredBlock)}</span>
                  <span className="text-text-tertiary">&bull;</span>
                  <span className="text-text-secondary font-mono">
                    {formatClockTime(hoveredBlock.startTime)}–{formatClockTime(hoveredBlock.endTime)}
                  </span>
                  <span className="text-text-tertiary">&bull;</span>
                  <span className="font-mono text-text-primary">
                    {formatDuration(hoveredBlock.observedActiveDurationMs / 1000)}
                  </span>
                </div>
              )}
            </div>
          </motion.div>
        )
      ) : segments.length > 0 && totalTrackedMs > 0 && (
        <motion.div
          variants={itemVariants}
          className="bg-bg-card border border-border-subtle rounded-2xl p-5 shadow-xs space-y-3"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-text-secondary" />
              <h3 className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
                Daily Flow
              </h3>
            </div>
            {segments.length > 0 && (
              <span className="text-xs font-mono text-text-secondary">
                {formatClockTime(segments[0]?.start ?? "")} &rarr;{" "}
                {formatClockTime(segments[segments.length - 1]?.end ?? "")}
              </span>
            )}
          </div>

          <div className="relative">
            <div className="flex h-9 w-full rounded-xl overflow-hidden bg-bg-secondary p-0.5 gap-0.5">
              {segments.map((segment) => {
                const widthPercent = (segment.durationMs / totalTrackedMs) * 100;
                const config = categoryConfig[segment.category] || categoryConfig.general;
                const isHovered = hoveredSegment?.id === segment.id;

                return (
                  <div
                    key={segment.id}
                    onMouseEnter={() => setHoveredSegment(segment)}
                    onMouseLeave={() => setHoveredSegment(null)}
                    onClick={() => {
                      if (activeView === "raw") {
                        setExpandedSegmentId(segment.id);
                        const el = document.getElementById(`segment-${segment.id}`);
                        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
                      }
                    }}
                    className={`relative cursor-pointer transition-all duration-150 rounded-[4px] ${config.bar} ${
                      isHovered ? "brightness-125 scale-y-110 z-10 shadow-lg" : "opacity-90 hover:opacity-100"
                    }`}
                    style={{ width: `${Math.max(widthPercent, 0.4)}%` }}
                  />
                );
              })}
            </div>

            {hoveredSegment && (
              <div className="absolute -top-12 left-1/2 -translate-x-1/2 z-30 pointer-events-none bg-bg-default border border-border-strong rounded-lg px-3 py-1.5 shadow-2xl flex items-center gap-2 whitespace-nowrap text-xs">
                <span className="font-semibold text-text-primary">{hoveredSegment.application}</span>
                <span className="text-text-tertiary">&bull;</span>
                <span className="text-text-secondary font-mono">
                  {formatClockTime(hoveredSegment.start)}–{formatClockTime(hoveredSegment.end)}
                </span>
                <span className="text-text-tertiary">&bull;</span>
                <span className="font-mono text-accent-default">
                  {formatDuration(hoveredSegment.durationSeconds)}
                </span>
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* 5. Filter Tabs */}
      {activeView === "semantic" ? (
        <motion.div variants={itemVariants} className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5 bg-bg-card border border-border-subtle rounded-xl p-1 shadow-xs">
            <div className="flex items-center px-2.5 text-xs text-text-secondary">
              <Filter className="w-3.5 h-3.5 mr-1.5 text-text-tertiary" />
              <span>Modality:</span>
            </div>

            <button
              onClick={() => setFilterModality("all")}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                filterModality === "all"
                  ? "bg-bg-secondary border border-border-default text-text-primary shadow-xs"
                  : "text-text-secondary hover:text-text-primary hover:bg-bg-secondary/60"
              }`}
            >
              <span>All Modalities</span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-md bg-accent-subtle text-accent-default">
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
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      isActive
                        ? "bg-bg-secondary border border-border-default text-text-primary shadow-xs"
                        : "text-text-secondary hover:text-text-primary hover:bg-bg-secondary/60"
                    }`}
                  >
                    <span>{config.label}</span>
                    <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-md bg-bg-secondary text-text-tertiary">
                      {blockModalityCounts[key] ?? 0}
                    </span>
                  </button>
                );
              })}
          </div>

          <div className="text-xs font-mono text-text-secondary">
            Showing <span className="text-text-primary font-semibold">{filteredBlocks.length}</span> of{" "}
            {blocks.length} semantic blocks
          </div>
        </motion.div>
      ) : (
        <motion.div variants={itemVariants} className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5 bg-bg-card border border-border-subtle rounded-xl p-1 shadow-xs">
            <div className="flex items-center px-2.5 text-xs text-text-secondary">
              <Filter className="w-3.5 h-3.5 mr-1.5 text-text-tertiary" />
              <span>Filter:</span>
            </div>

            {(
              [
                { id: "all", label: "All Activity" },
                { id: "focused", label: "Focused" },
                { id: "browser", label: "Browser" },
                { id: "break", label: "Breaks" },
              ] as const
            ).map((tab) => {
              const isActive = filterCategory === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setFilterCategory(tab.id)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    isActive
                      ? "bg-bg-secondary border border-border-default text-text-primary shadow-xs"
                      : "text-text-secondary hover:text-text-primary hover:bg-bg-secondary/60"
                  }`}
                >
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          <div className="text-xs font-mono text-text-secondary">
            Showing <span className="text-text-primary font-semibold">{filteredSegments.length}</span> of{" "}
            {segments.length} raw segments
          </div>
        </motion.div>
      )}

      {/* 6. Main Chronological Timeline Area */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="h-16 bg-bg-card border border-border-subtle rounded-xl animate-pulse"
            />
          ))}
        </div>
      ) : isError ? (
        <div className="bg-bg-card border border-error/20 rounded-2xl p-8 text-center space-y-4 shadow-xs">
          <div className="w-12 h-12 rounded-full bg-error/10 border border-error/20 text-error flex items-center justify-center mx-auto">
            <AlertCircle className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-text-primary">Unable to load timeline</h3>
            <p className="text-xs text-text-secondary mt-1 max-w-sm mx-auto">
              We couldn't retrieve telemetry activity for this day. Please check backend connectivity.
            </p>
          </div>
          <button
            onClick={() => refetch()}
            className="px-4 py-2 rounded-xl text-xs font-medium text-white bg-accent-default hover:bg-accent-hover transition-colors shadow-xs"
          >
            Retry Loading
          </button>
        </div>
      ) : activeView === "semantic" ? (
        // ------------------ SEMANTIC BLOCKS VIEW (Phase 3B) ------------------
        filteredBlocks.length === 0 ? (
          <div className="bg-bg-card border border-border-subtle rounded-2xl p-12 text-center space-y-4 shadow-xs">
            <div className="w-12 h-12 rounded-full bg-bg-secondary border border-border-default text-text-secondary flex items-center justify-center mx-auto">
              <Clock className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-text-primary">No semantic blocks matching filter</h3>
              <p className="text-xs text-text-secondary mt-1 max-w-sm mx-auto">
                No temporal activity blocks were classified under this modality for this day.
              </p>
            </div>
          </div>
        ) : (
          <motion.div
            variants={containerVariants}
            className="bg-bg-card border border-border-subtle rounded-2xl p-4 sm:p-6 shadow-xs divide-y divide-border-subtle"
          >
            {filteredBlocks.map((block, index) => {
              const primaryMod = block.modality.primary?.value ?? "unknown";
              const modCfg = modalityConfig[primaryMod] ?? modalityConfig.unknown!;
              const ModIcon = modCfg.icon;
              const isExpanded = expandedBlockId === block.id;

              const activeSec = Math.round(block.observedActiveDurationMs / 1000);
              const pausedSec = Math.round(block.pausedDurationMs / 1000);

              const attentionState = block.attention?.focusEvidenceState;

              return (
                <div key={block.id} id={`block-${block.id}`} className="py-3 first:pt-0 last:pb-0 scroll-mt-24">
                  <div
                    onClick={() => setExpandedBlockId(isExpanded ? null : block.id)}
                    className="group flex items-start gap-3 sm:gap-4 p-2.5 sm:p-3 rounded-xl hover:bg-bg-secondary/60 transition-all cursor-pointer"
                  >
                    {/* Time Range Column */}
                    <div className="w-28 sm:w-32 shrink-0 pt-0.5">
                      <div className="text-xs font-mono font-semibold text-text-primary">
                        {formatTimeInterval(block.startTime, block.endTime)}
                      </div>
                      <div className="text-[11px] font-mono text-text-tertiary mt-0.5">
                        <span>{formatDuration(activeSec)}</span>
                        {pausedSec > 0 && (
                          <span className="text-amber-500 dark:text-amber-400">
                            {" "}
                            &bull; {formatDuration(pausedSec)} idle
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Vertical Connector Dot */}
                    <div className="relative flex flex-col items-center self-stretch shrink-0 pt-1.5 px-1">
                      <div className={`w-2.5 h-2.5 rounded-full ${modCfg.bar} ring-4 ${modCfg.dot}`} />
                      {index < filteredBlocks.length - 1 && (
                        <div className="w-px flex-1 bg-border-subtle mt-2 group-hover:bg-border-default transition-colors" />
                      )}
                    </div>

                    {/* Block Info Column (Clean Non-Judgmental Primary Row) */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <ModIcon className={`w-3.5 h-3.5 ${modCfg.color} shrink-0`} />
                        <span className="text-xs sm:text-sm font-semibold text-text-primary tracking-tight truncate">
                          {block.primaryApplication}
                        </span>
                        {block.domain && (
                          <span className="text-[10px] font-mono text-text-tertiary bg-bg-secondary px-1.5 py-0.2 rounded border border-border-subtle truncate max-w-[140px]">
                            {block.domain}
                          </span>
                        )}
                      </div>

                      {/* Clean Activity Descriptor + Optional Window Context */}
                      <div className="flex items-center gap-1.5 text-xs text-text-secondary truncate">
                        <span className="text-accent-default font-medium">
                          {formatActivityDescriptor(block)}
                        </span>
                        {block.cleanTitle && (
                          <>
                            <span className="text-text-tertiary">&bull;</span>
                            <span className="truncate text-text-tertiary group-hover:text-text-secondary transition-colors">
                              {block.cleanTitle}
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Actions & Toggle */}
                    <div className="shrink-0 flex items-center gap-2 pt-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setCorrectingBlock(block);
                        }}
                        title="Correct Classification"
                        className="p-1 rounded-md text-text-tertiary hover:text-accent-default hover:bg-accent-subtle transition-colors"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <div className="text-text-tertiary group-hover:text-text-secondary transition-colors">
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </div>
                    </div>
                  </div>

                  {/* Expandable Evidence & Provenance Drawer */}
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="mt-2 mb-3 ml-28 sm:ml-36 p-4 rounded-xl bg-bg-secondary border border-border-subtle shadow-xs space-y-4 text-xs">
                          {/* Metrics Grid */}
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pb-3 border-b border-border-subtle">
                            <div>
                              <span className="text-[10px] text-text-tertiary uppercase font-mono">
                                Wall-Clock Duration
                              </span>
                              <p className="font-mono font-semibold text-text-primary mt-0.5">
                                {formatDuration(block.wallClockDurationMs / 1000)}
                              </p>
                            </div>
                            <div>
                              <span className="text-[10px] text-text-tertiary uppercase font-mono">
                                Active Duration
                              </span>
                              <p className="font-mono font-semibold text-emerald-400 mt-0.5">
                                {formatDuration(block.observedActiveDurationMs / 1000)}
                              </p>
                            </div>
                            <div>
                              <span className="text-[10px] text-text-tertiary uppercase font-mono">
                                Paused / Idle Inside
                              </span>
                              <p className="font-mono font-semibold text-amber-400 mt-0.5">
                                {formatDuration(block.pausedDurationMs / 1000)}
                              </p>
                            </div>
                            <div>
                              <span className="text-[10px] text-text-tertiary uppercase font-mono">
                                Raw Observations
                              </span>
                              <p className="font-mono text-text-secondary mt-0.5">
                                {block.rawEventCount} events ({block.sourceChannel})
                              </p>
                            </div>
                          </div>

                          {/* Primary Modality & Activity Classification Claim Card */}
                          <div>
                            <div className="flex items-center justify-between mb-1.5">
                              <span className="text-[10px] text-text-tertiary uppercase font-mono flex items-center gap-1.5">
                                <Sparkles className="w-3 h-3 text-accent-default" />
                                Semantic Activity &amp; Modality
                              </span>
                              <button
                                onClick={() => setCorrectingBlock(block)}
                                className="text-[10px] font-medium text-accent-default hover:underline flex items-center gap-1"
                              >
                                <Edit3 className="w-2.5 h-2.5" />
                                Correct Claim
                              </button>
                            </div>

                            <div className="bg-bg-card p-3 rounded-lg border border-border-subtle grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-[11px]">
                              <div>
                                <span className="text-text-tertiary">Activity Type:</span>{" "}
                                <span className="text-accent-default font-semibold capitalize">
                                  {block.activityType ? block.activityType.replace(/_/g, " ") : "unknown"}
                                </span>
                              </div>
                              <div>
                                <span className="text-text-tertiary">Modality:</span>{" "}
                                <span className="text-text-primary font-semibold">{primaryMod}</span>
                              </div>
                              <div>
                                <span className="text-text-tertiary">Topic/Project:</span>{" "}
                                <span className="text-text-secondary">
                                  {block.modality.context?.value ?? "None"}
                                </span>
                              </div>
                              <div>
                                <span className="text-text-tertiary">Authority:</span>{" "}
                                <span className="text-text-secondary inline-flex items-center gap-1">
                                  {block.modality.primary?.authority ?? "SYSTEM"}
                                  {block.modality.primary?.authority === "USER" && (
                                    <span className="text-[9px] px-1 py-0.2 rounded bg-purple-500/15 text-purple-300 border border-purple-500/30">
                                      OVERRIDE
                                    </span>
                                  )}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Intent Association Section */}
                          {block.intentLink && (
                            <div>
                              <span className="text-[10px] text-text-tertiary uppercase font-mono block mb-1.5">
                                Intention Association
                              </span>
                              <div className="bg-bg-card p-3 rounded-lg border border-border-subtle flex flex-wrap items-center justify-between gap-2 font-mono text-[11px]">
                                <div className="flex items-center gap-2">
                                  <span className="text-text-tertiary">Scope:</span>
                                  <span className="text-text-primary font-semibold">{block.intentLink.targetScope}</span>
                                  <span className="text-text-tertiary">&bull;</span>
                                  <span className="text-text-tertiary">Relationship:</span>
                                  <span
                                    className={`font-semibold ${
                                      block.intentLink.intentionRelationship === "TASK_RELEVANT" ||
                                      block.intentLink.intentionRelationship === "GOAL_RELEVANT"
                                        ? "text-emerald-400"
                                        : block.intentLink.intentionRelationship === "PROJECT_RELEVANT"
                                          ? "text-blue-400"
                                          : block.intentLink.intentionRelationship === "DIVERGENT"
                                            ? "text-amber-400"
                                            : "text-text-tertiary"
                                    }`}
                                  >
                                    {block.intentLink.intentionRelationship}
                                  </span>
                                </div>
                                {block.intentLink.relevance && (
                                  <span className="text-[10px] text-text-tertiary">
                                    relevance: {block.intentLink.relevance}
                                  </span>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Attention Evidence Section */}
                          {attentionState && (
                            <div>
                              <span className="text-[10px] text-text-tertiary uppercase font-mono block mb-1.5">
                                Attention Evidence
                              </span>
                              <div className="bg-bg-card p-3 rounded-lg border border-border-subtle flex items-center justify-between font-mono text-[11px]">
                                <div className="flex items-center gap-2">
                                  <span
                                    className={`text-[9px] font-semibold px-2 py-0.5 rounded border ${
                                      attentionState === "SUPPORTED"
                                        ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                                        : attentionState === "CONTRADICTORY"
                                          ? "bg-rose-500/15 text-rose-300 border-rose-500/30"
                                          : "bg-zinc-500/15 text-zinc-300 border-zinc-500/30"
                                    }`}
                                  >
                                    {attentionState}
                                  </span>
                                  <span className="text-text-secondary">
                                    {attentionState === "SUPPORTED"
                                      ? "Corroborated by interaction continuity and foreground track focus"
                                      : attentionState === "CONTRADICTORY"
                                        ? "Conflicting interaction patterns or unexpected AFK overlap"
                                        : "Sparse interaction signals; reading or passive absorption expected"}
                                  </span>
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Evidence Citations */}
                          {block.modality.primary?.evidence && block.modality.primary.evidence.length > 0 && (
                            <div>
                              <span className="text-[10px] text-text-tertiary uppercase font-mono block mb-1.5">
                                Signal Evidence Citations
                              </span>
                              <div className="space-y-1">
                                {block.modality.primary.evidence.map((ev, evIdx) => (
                                  <div
                                    key={evIdx}
                                    className="bg-bg-card px-2.5 py-1.5 rounded-lg border border-border-subtle flex items-center justify-between font-mono text-[11px]"
                                  >
                                    <div className="flex items-center gap-2">
                                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-bg-secondary text-text-secondary border border-border-subtle">
                                        {ev.evidenceType}
                                      </span>
                                      <span className="text-text-primary truncate max-w-md">
                                        {ev.evidenceReference}
                                      </span>
                                    </div>
                                    <span className="text-text-tertiary text-[10px]">
                                      wt: {ev.weight}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Fingerprint and Provenance Tracking */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-border-subtle text-[10px] font-mono text-text-tertiary">
                            <div className="truncate">
                              <span>Observation Fingerprint:</span>{" "}
                              <span className="text-text-secondary">{block.observationSetFingerprint}</span>
                            </div>
                            <div className="sm:text-right">
                              <span>Track:</span>{" "}
                              <span className="text-text-secondary">{block.track}</span>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </motion.div>
        )
      ) : (
        // ------------------ RAW SEGMENTS VIEW (Legacy fallback) ------------------
        filteredSegments.length === 0 ? (
          <div className="bg-bg-card border border-border-subtle rounded-2xl p-12 text-center space-y-4 shadow-xs">
            <div className="w-12 h-12 rounded-full bg-bg-secondary border border-border-default text-text-secondary flex items-center justify-center mx-auto">
              <Clock className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-text-primary">No activity recorded</h3>
              <p className="text-xs text-text-secondary mt-1 max-w-sm mx-auto">
                There isn't enough activity recorded for this day yet.
              </p>
            </div>
          </div>
        ) : (
          <motion.div
            variants={containerVariants}
            className="bg-bg-card border border-border-subtle rounded-2xl p-4 sm:p-6 shadow-xs divide-y divide-border-subtle"
          >
            {filteredSegments.map((segment, index) => {
              const config = categoryConfig[segment.category] || categoryConfig.general;
              const Icon = config.icon;
              const isExpanded = expandedSegmentId === segment.id;

              return (
                <div key={segment.id} id={`segment-${segment.id}`} className="py-2.5 first:pt-0 last:pb-0 scroll-mt-24">
                  <div
                    onClick={() => setExpandedSegmentId(isExpanded ? null : segment.id)}
                    className="group flex items-start gap-3 sm:gap-4 p-2.5 sm:p-3 rounded-xl hover:bg-bg-secondary/60 transition-all cursor-pointer"
                  >
                    <div className="w-24 sm:w-28 shrink-0 pt-0.5">
                      <div className="text-xs font-mono font-semibold text-text-primary">
                        {formatTimeInterval(segment.start, segment.end)}
                      </div>
                      <div className="text-[11px] font-mono text-text-tertiary mt-0.5">
                        {formatDuration(segment.durationSeconds)}
                      </div>
                    </div>

                    <div className="relative flex flex-col items-center self-stretch shrink-0 pt-1.5 px-1">
                      <div className={`w-2.5 h-2.5 rounded-full ${config.bar} ring-4 ${config.dot}`} />
                      {index < filteredSegments.length - 1 && (
                        <div className="w-px flex-1 bg-border-subtle mt-2 group-hover:bg-border-default transition-colors" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <Icon className={`w-3.5 h-3.5 ${config.color} shrink-0`} />
                        <span className="text-xs sm:text-sm font-semibold text-text-primary tracking-tight truncate">
                          {segment.application}
                        </span>
                        <span
                          className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full border ${config.badge}`}
                        >
                          {config.label.toUpperCase()}
                        </span>

                        {segment.rawEventCount && segment.rawEventCount > 1 && (
                          <span className="text-[10px] font-mono text-text-tertiary bg-bg-secondary px-1.5 py-0.5 rounded border border-border-subtle">
                            {segment.rawEventCount} events
                          </span>
                        )}
                      </div>

                      <p className="text-xs text-text-secondary truncate group-hover:text-text-primary transition-colors">
                        {segment.title || (segment.category === "break" ? "Away from keyboard" : "Active session")}
                      </p>
                    </div>

                    <div className="shrink-0 pt-1 text-text-tertiary group-hover:text-text-secondary transition-colors">
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </div>
                  </div>

                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="mt-2 mb-3 ml-28 sm:ml-32 p-4 rounded-xl bg-bg-secondary border border-border-subtle shadow-xs space-y-3.5 text-xs">
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pb-3 border-b border-border-subtle">
                            <div>
                              <span className="text-[11px] text-text-tertiary uppercase font-mono">
                                Application
                              </span>
                              <p className="font-semibold text-text-primary mt-0.5 truncate">
                                {segment.application}
                              </p>
                            </div>
                            <div>
                              <span className="text-[11px] text-text-tertiary uppercase font-mono">
                                Category
                              </span>
                              <p className={`font-semibold capitalize mt-0.5 ${config.color}`}>
                                {segment.category}
                              </p>
                            </div>
                            <div>
                              <span className="text-[11px] text-text-tertiary uppercase font-mono">
                                Duration
                              </span>
                              <p className="font-mono font-semibold text-text-primary mt-0.5">
                                {formatDuration(segment.durationSeconds)} ({segment.durationSeconds}s)
                              </p>
                            </div>
                            <div>
                              <span className="text-[11px] text-text-tertiary uppercase font-mono">
                                Consolidation
                              </span>
                              <p className="font-mono text-text-secondary mt-0.5">
                                {segment.rawEventCount && segment.rawEventCount > 1
                                  ? `${segment.rawEventCount} events (${segment.source})`
                                  : `1 event (${segment.source})`}
                              </p>
                            </div>
                          </div>

                          <div>
                            <div className="flex items-center justify-between mb-1.5">
                              <span className="text-[11px] text-text-tertiary uppercase font-mono">
                                {segment.contexts && segment.contexts.length > 1
                                  ? `Session Context History (${segment.contexts.length} titles / files)`
                                  : "Window / Document Context"}
                              </span>
                              {segment.domain && (
                                <span className="text-[11px] font-mono text-accent-default bg-accent-subtle px-2 py-0.5 rounded border border-accent-default/30">
                                  {segment.domain}
                                </span>
                              )}
                            </div>

                            <p className="text-text-primary break-all font-mono text-[11px] bg-bg-card p-2.5 rounded-lg border border-border-subtle">
                              {segment.title || (segment.category === "break" ? "Away from keyboard" : "No window title recorded")}
                            </p>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </motion.div>
        )
      )}
    </motion.div>
  );
}
