"use client";

import { useState, useEffect, useMemo, useRef } from "react";
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
  Radio,
  Zap,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useTimeline } from "../../src/hooks/queries/use-timeline";
import { useLiveTelemetry } from "../../src/hooks/use-live-telemetry";
import type { TimelineSegment, TimelineCategory } from "@repo/types";

// Animation presets
const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.03 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 6 },
  show: { opacity: 1, y: 0, transition: { duration: 0.25 } },
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
    label: "Focused",
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
    label: "Break",
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
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/25",
    badge: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    bar: "bg-emerald-500",
    dot: "bg-emerald-400 ring-emerald-500/30",
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
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
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

export default function TimelinePage() {
  const queryClient = useQueryClient();
  const [selectedDate, setSelectedDate] = useState<string>(() => getTodayString());
  const [filterCategory, setFilterCategory] = useState<"all" | TimelineCategory>("all");
  const [expandedSegmentId, setExpandedSegmentId] = useState<string | null>(null);
  const [hoveredSegment, setHoveredSegment] = useState<TimelineSegment | null>(null);

  const isToday = selectedDate === getTodayString();

  // Fetch real timeline from backend via React Query
  const { data, isLoading, isError, refetch, isFetching } = useTimeline(selectedDate);

  // Live WebSocket connection
  const liveTelemetry = useLiveTelemetry();
  const lastEventCountRef = useRef(liveTelemetry.eventCount);

  // When live telemetry arrives and viewing today, throttle-invalidate today's query
  useEffect(() => {
    if (!isToday) return;
    if (liveTelemetry.eventCount > lastEventCountRef.current) {
      lastEventCountRef.current = liveTelemetry.eventCount;
      const timer = setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["activity", "timeline", selectedDate] });
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [liveTelemetry.eventCount, isToday, selectedDate, queryClient]);

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
  const summary = data?.summary;
  const currentActivity = data?.currentActivity;

  // Filter segments
  const filteredSegments = useMemo(() => {
    if (filterCategory === "all") return segments;
    return segments.filter((s) => s.category === filterCategory);
  }, [segments, filterCategory]);

  // Filter counts
  const filterCounts = useMemo(() => {
    return {
      all: segments.length,
      focused: segments.filter((s) => s.category === "focused").length,
      browser: segments.filter((s) => s.category === "browser").length,
      break: segments.filter((s) => s.category === "break").length,
      communication: segments.filter((s) => s.category === "communication").length,
      general: segments.filter((s) => s.category === "general").length,
    };
  }, [segments]);

  // Daily Flow Bar segments
  const totalTrackedMs = summary?.totalTrackedMs || 0;

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className="space-y-6 max-w-[1440px] mx-auto pb-12"
    >
      {/* 1. Header & Date Navigation */}
      <motion.div
        variants={itemVariants}
        className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-white/[0.06]"
      >
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-white">Timeline</h1>
            {isToday && (
              <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Live Today
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 mt-1 font-mono tracking-wide">
            What actually happened &bull; {formatDateLong(selectedDate)}
          </p>
        </div>

        {/* Date Controls */}
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-[#111111] border border-white/[0.08] rounded-xl p-1 shadow-sm">
            <button
              onClick={handlePrevDay}
              title="Previous Day"
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <label className="relative flex items-center gap-2 px-3 py-1 cursor-pointer group">
              <Calendar className="w-3.5 h-3.5 text-indigo-400 group-hover:text-indigo-300 transition-colors" />
              <span className="text-xs font-medium text-slate-200 group-hover:text-white font-mono">
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
                  ? "text-slate-600 cursor-not-allowed"
                  : "text-slate-400 hover:text-white hover:bg-white/[0.06]"
              }`}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {!isToday && (
            <button
              onClick={handleGoToday}
              className="px-3 py-1.5 rounded-xl text-xs font-medium text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 hover:bg-indigo-500/20 transition-all"
            >
              Jump to Today
            </button>
          )}

          <button
            onClick={() => refetch()}
            disabled={isFetching}
            title="Refresh Timeline"
            className="p-2 rounded-xl text-slate-400 hover:text-white bg-[#111111] border border-white/[0.08] hover:bg-white/[0.06] transition-all"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin text-indigo-400" : ""}`} />
          </button>
        </div>
      </motion.div>

      {/* 2. Current Activity Banner (Requirement 18) */}
      {isToday && currentActivity && (
        <motion.div
          variants={itemVariants}
          className="relative overflow-hidden bg-gradient-to-r from-indigo-950/30 via-[#111111] to-[#111111] border border-indigo-500/20 rounded-2xl p-4 shadow-lg backdrop-blur-md"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="relative">
                <div
                  className={`w-3 h-3 rounded-full ${
                    currentActivity.isActive ? "bg-emerald-400" : "bg-amber-400"
                  }`}
                />
                {currentActivity.isActive && (
                  <div className="absolute inset-0 w-3 h-3 rounded-full bg-emerald-400 animate-ping opacity-75" />
                )}
              </div>

              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-mono tracking-wider uppercase text-slate-400">
                    CURRENT ACTIVITY
                  </span>
                  <span
                    className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                      currentActivity.isActive
                        ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                        : "bg-amber-500/15 text-amber-300 border-amber-500/30"
                    }`}
                  >
                    {currentActivity.isActive ? "ACTIVE" : "AFK / AWAY"}
                  </span>
                </div>

                <div className="flex items-baseline gap-2 mt-0.5">
                  <h3 className="text-sm font-semibold text-white">
                    {currentActivity.application || "Idle"}
                  </h3>
                  {currentActivity.title && currentActivity.title !== currentActivity.application && (
                    <span className="text-xs text-slate-400 truncate max-w-[360px] sm:max-w-[480px]">
                      &bull; {currentActivity.title}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {currentActivity.runningForSeconds !== null && (
              <div className="flex items-center gap-2 self-start sm:self-auto bg-white/[0.04] border border-white/[0.06] rounded-xl px-3 py-1.5">
                <Clock className="w-3.5 h-3.5 text-indigo-400" />
                <span className="text-xs text-slate-400">Running for:</span>
                <span className="text-xs font-mono font-semibold text-white">
                  {formatDuration(currentActivity.runningForSeconds)}
                </span>
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* 3. Top Summary KPI Cards (Requirement 12) */}
      <motion.div variants={itemVariants} className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Total Tracked */}
        <div className="bg-[#111111] border border-white/[0.06] rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-medium text-slate-400">Total Tracked</span>
            <Clock className="w-4 h-4 text-slate-500" />
          </div>
          <p className="text-2xl font-bold tracking-tight text-white">
            {summary ? formatDuration(summary.totalTrackedMs / 1000) : "0m"}
          </p>
          <p className="text-[11px] text-slate-500 mt-1 font-mono">
            {segments.length} continuous blocks
          </p>
        </div>

        {/* Focused Work */}
        <div className="bg-[#111111] border border-white/[0.06] rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-medium text-indigo-400">Focused Work</span>
            <Code className="w-4 h-4 text-indigo-400" />
          </div>
          <p className="text-2xl font-bold tracking-tight text-white">
            {summary ? formatDuration(summary.focusedMs / 1000) : "0m"}
          </p>
          <p className="text-[11px] text-slate-500 mt-1 font-mono">
            IDEs, Terminal, Editors
          </p>
        </div>

        {/* Browser & Research */}
        <div className="bg-[#111111] border border-white/[0.06] rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-medium text-violet-400">Browser / Research</span>
            <Globe className="w-4 h-4 text-violet-400" />
          </div>
          <p className="text-2xl font-bold tracking-tight text-white">
            {summary ? formatDuration(summary.browserMs / 1000) : "0m"}
          </p>
          <p className="text-[11px] text-slate-500 mt-1 font-mono">
            Web tabs & docs
          </p>
        </div>

        {/* Breaks / AFK */}
        <div className="bg-[#111111] border border-white/[0.06] rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-medium text-amber-400">Breaks & AFK</span>
            <Coffee className="w-4 h-4 text-amber-400" />
          </div>
          <p className="text-2xl font-bold tracking-tight text-white">
            {summary ? formatDuration(summary.breakMs / 1000) : "0m"}
          </p>
          <p className="text-[11px] text-slate-500 mt-1 font-mono">
            Away from keyboard
          </p>
        </div>
      </motion.div>

      {/* 4. Daily Flow Proportional Visualization Bar (Requirement 15) */}
      {segments.length > 0 && totalTrackedMs > 0 && (
        <motion.div
          variants={itemVariants}
          className="bg-[#111111] border border-white/[0.06] rounded-2xl p-5 shadow-sm space-y-3"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-slate-400" />
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                Daily Flow
              </h3>
            </div>
            {segments.length > 0 && (
              <span className="text-xs font-mono text-slate-400">
                {formatClockTime(segments[0]?.start ?? "")} &rarr;{" "}
                {formatClockTime(segments[segments.length - 1]?.end ?? "")}
              </span>
            )}
          </div>

          {/* Proportional Segmented Bar */}
          <div className="relative">
            <div className="flex h-9 w-full rounded-xl overflow-hidden bg-white/[0.04] p-0.5 gap-0.5">
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
                      setExpandedSegmentId(segment.id);
                      const el = document.getElementById(`segment-${segment.id}`);
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

            {/* Floating Tooltip when hovering over a segment */}
            {hoveredSegment && (
              <div className="absolute -top-12 left-1/2 -translate-x-1/2 z-30 pointer-events-none bg-[#1a1a1a] border border-white/[0.12] rounded-lg px-3 py-1.5 shadow-2xl flex items-center gap-2 whitespace-nowrap text-xs">
                <span className="font-semibold text-white">{hoveredSegment.application}</span>
                <span className="text-slate-400">&bull;</span>
                <span className="text-slate-300 font-mono">
                  {formatClockTime(hoveredSegment.start)}–{formatClockTime(hoveredSegment.end)}
                </span>
                <span className="text-slate-400">&bull;</span>
                <span className="font-mono text-indigo-400">
                  {formatDuration(hoveredSegment.durationSeconds)}
                </span>
              </div>
            )}
          </div>

          {/* Category Proportions Legend */}
          <div className="flex flex-wrap items-center gap-4 pt-1 text-xs">
            {summary && summary.focusedMs > 0 && (
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-sm bg-indigo-500" />
                <span className="text-slate-400">Focused:</span>
                <span className="font-mono font-medium text-slate-200">
                  {formatDuration(summary.focusedMs / 1000)}
                </span>
              </div>
            )}
            {summary && summary.browserMs > 0 && (
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-sm bg-violet-500" />
                <span className="text-slate-400">Browser:</span>
                <span className="font-mono font-medium text-slate-200">
                  {formatDuration(summary.browserMs / 1000)}
                </span>
              </div>
            )}
            {summary && summary.breakMs > 0 && (
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-sm bg-amber-500" />
                <span className="text-slate-400">Breaks:</span>
                <span className="font-mono font-medium text-slate-200">
                  {formatDuration(summary.breakMs / 1000)}
                </span>
              </div>
            )}
            {summary && summary.communicationMs > 0 && (
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-sm bg-emerald-500" />
                <span className="text-slate-400">Communication:</span>
                <span className="font-mono font-medium text-slate-200">
                  {formatDuration(summary.communicationMs / 1000)}
                </span>
              </div>
            )}
            {summary && summary.generalMs > 0 && (
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-sm bg-slate-600" />
                <span className="text-slate-400">General:</span>
                <span className="font-mono font-medium text-slate-200">
                  {formatDuration(summary.generalMs / 1000)}
                </span>
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* 5. Filter Tabs (Requirement 14) */}
      <motion.div variants={itemVariants} className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5 bg-[#111111] border border-white/[0.06] rounded-xl p-1">
          <div className="flex items-center px-2.5 text-xs text-slate-500">
            <Filter className="w-3.5 h-3.5 mr-1.5" />
            <span>Filter:</span>
          </div>

          {(
            [
              { id: "all", label: "All Activity", count: filterCounts.all },
              { id: "focused", label: "Focused", count: filterCounts.focused },
              { id: "browser", label: "Browser", count: filterCounts.browser },
              { id: "break", label: "Breaks", count: filterCounts.break },
            ] as const
          ).map((tab) => {
            const isActive = filterCategory === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setFilterCategory(tab.id)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  isActive
                    ? "bg-white/[0.1] text-white shadow-sm"
                    : "text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]"
                }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`text-[10px] font-mono px-1.5 py-0.2 rounded-md ${
                    isActive
                      ? "bg-indigo-500/30 text-indigo-200"
                      : "bg-white/[0.04] text-slate-500"
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        <div className="text-xs font-mono text-slate-400">
          Showing <span className="text-white font-semibold">{filteredSegments.length}</span>{" "}
          of {segments.length} continuous blocks
        </div>
      </motion.div>

      {/* 6. Main Chronological Timeline Area (Requirements 16, 21, 22, 23, 25) */}
      {isLoading ? (
        // Loading Skeleton
        <div className="space-y-3">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="h-16 bg-[#111111] border border-white/[0.04] rounded-xl animate-pulse"
            />
          ))}
        </div>
      ) : isError ? (
        // Error State (Requirement 23)
        <div className="bg-[#111111] border border-red-500/20 rounded-2xl p-8 text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 flex items-center justify-center mx-auto">
            <AlertCircle className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-white">Unable to load timeline</h3>
            <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
              We couldn't retrieve telemetry activity for this day. Please check backend connectivity.
            </p>
          </div>
          <button
            onClick={() => refetch()}
            className="px-4 py-2 rounded-xl text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-500 transition-colors shadow-sm"
          >
            Retry Loading
          </button>
        </div>
      ) : filteredSegments.length === 0 ? (
        // Empty State (Requirement 21)
        <div className="bg-[#111111] border border-white/[0.06] rounded-2xl p-12 text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-white/[0.04] border border-white/[0.08] text-slate-400 flex items-center justify-center mx-auto">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-white">No activity recorded</h3>
            <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
              There isn't enough activity recorded for this day yet.
            </p>
          </div>
          {!isToday && (
            <button
              onClick={handleGoToday}
              className="px-4 py-2 rounded-xl text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-500 transition-colors shadow-sm"
            >
              Go to Today
            </button>
          )}
        </div>
      ) : (
        // Main Chronological List (Requirement 16)
        <motion.div
          variants={containerVariants}
          className="bg-[#111111] border border-white/[0.06] rounded-2xl p-4 sm:p-6 shadow-sm divide-y divide-white/[0.04]"
        >
          {filteredSegments.map((segment, index) => {
            const config = categoryConfig[segment.category] || categoryConfig.general;
            const Icon = config.icon;
            const isExpanded = expandedSegmentId === segment.id;

            return (
              <div key={segment.id} id={`segment-${segment.id}`} className="py-2.5 first:pt-0 last:pb-0 scroll-mt-24">
                <div
                  onClick={() =>
                    setExpandedSegmentId(isExpanded ? null : segment.id)
                  }
                  className="group flex items-start gap-3 sm:gap-4 p-2.5 sm:p-3 rounded-xl hover:bg-white/[0.03] transition-all cursor-pointer"
                >
                  {/* Time Range Column */}
                  <div className="w-24 sm:w-28 shrink-0 pt-0.5">
                    <div className="text-xs font-mono font-semibold text-slate-200 group-hover:text-white">
                      {formatTimeInterval(segment.start, segment.end)}
                    </div>
                    <div className="text-[11px] font-mono text-slate-500 mt-0.5">
                      {formatDuration(segment.durationSeconds)}
                    </div>
                  </div>

                  {/* Vertical Connector Dot */}
                  <div className="relative flex flex-col items-center self-stretch shrink-0 pt-1.5 px-1">
                    <div
                      className={`w-2.5 h-2.5 rounded-full ${config.bar} ring-4 ${config.dot}`}
                    />
                    {index < filteredSegments.length - 1 && (
                      <div className="w-px flex-1 bg-white/[0.06] mt-2 group-hover:bg-white/[0.12] transition-colors" />
                    )}
                  </div>

                  {/* Activity Details Column */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <Icon className={`w-3.5 h-3.5 ${config.color} shrink-0`} />
                      <span className="text-xs sm:text-sm font-semibold text-white tracking-tight truncate">
                        {segment.application}
                      </span>
                      <span
                        className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full border ${config.badge}`}
                      >
                        {config.label.toUpperCase()}
                      </span>

                      {segment.rawEventCount && segment.rawEventCount > 1 && (
                        <span className="text-[10px] font-mono text-slate-500 bg-white/[0.04] px-1.5 py-0.5 rounded">
                          {segment.rawEventCount} events
                        </span>
                      )}
                    </div>

                    {/* Window Title or Context */}
                    <p className="text-xs text-slate-400 truncate group-hover:text-slate-300 transition-colors">
                      {segment.title || (segment.category === "break" ? "Away from keyboard" : "Active session")}
                    </p>
                  </div>

                  {/* Toggle Arrow */}
                  <div className="shrink-0 pt-1 text-slate-600 group-hover:text-slate-400 transition-colors">
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4" />
                    ) : (
                      <ChevronDown className="w-4 h-4" />
                    )}
                  </div>
                </div>

                {/* 7. Detail Interaction (Requirement 17) */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="mt-2 mb-3 ml-28 sm:ml-32 p-4 rounded-xl bg-[#161616] border border-white/[0.08] shadow-inner space-y-3.5 text-xs">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pb-3 border-b border-white/[0.06]">
                          <div>
                            <span className="text-[11px] text-slate-500 uppercase font-mono">
                              Application
                            </span>
                            <p className="font-semibold text-white mt-0.5 truncate">
                              {segment.application}
                            </p>
                          </div>
                          <div>
                            <span className="text-[11px] text-slate-500 uppercase font-mono">
                              Category
                            </span>
                            <p className={`font-semibold capitalize mt-0.5 ${config.color}`}>
                              {segment.category}
                            </p>
                          </div>
                          <div>
                            <span className="text-[11px] text-slate-500 uppercase font-mono">
                              Duration
                            </span>
                            <p className="font-mono font-semibold text-white mt-0.5">
                              {formatDuration(segment.durationSeconds)} ({segment.durationSeconds}s)
                            </p>
                          </div>
                          <div>
                            <span className="text-[11px] text-slate-500 uppercase font-mono">
                              Consolidation
                            </span>
                            <p className="font-mono text-slate-300 mt-0.5">
                              {segment.rawEventCount && segment.rawEventCount > 1
                                ? `${segment.rawEventCount} events (${segment.source})`
                                : `1 event (${segment.source})`}
                            </p>
                          </div>
                        </div>

                        {/* Context History Rollup */}
                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-[11px] text-slate-500 uppercase font-mono">
                              {segment.contexts && segment.contexts.length > 1
                                ? `Session Context History (${segment.contexts.length} titles / files)`
                                : "Window / Document Context"}
                            </span>
                            {segment.domain && (
                              <span className="text-[11px] font-mono text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">
                                {segment.domain}
                              </span>
                            )}
                          </div>

                          {segment.contexts && segment.contexts.length > 1 ? (
                            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                              {segment.contexts.map((ctx, idx) => (
                                <div
                                  key={idx}
                                  className="text-slate-200 break-all font-mono text-[11px] bg-black/30 px-2.5 py-1.5 rounded-lg border border-white/[0.04] flex items-start gap-2"
                                >
                                  <span className="text-slate-500 select-none text-[10px] mt-0.5 shrink-0">
                                    #{idx + 1}
                                  </span>
                                  <span className="flex-1">{ctx}</span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-slate-200 break-all font-mono text-[11px] bg-black/30 p-2 rounded-lg border border-white/[0.04]">
                              {segment.title || (segment.category === "break" ? "Away from keyboard" : "No window title recorded")}
                            </p>
                          )}
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 text-slate-400 font-mono text-[11px] border-t border-white/[0.04]">
                          <div>
                            <span className="text-slate-500">Start:</span>{" "}
                            {new Date(segment.start).toLocaleTimeString()} ({segment.start})
                          </div>
                          <div>
                            <span className="text-slate-500">End:</span>{" "}
                            {new Date(segment.end).toLocaleTimeString()} ({segment.end})
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
      )}
    </motion.div>
  );
}
