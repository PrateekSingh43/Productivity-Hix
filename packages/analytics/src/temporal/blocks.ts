import { computeObservationSetFingerprint, toEpochMs } from "@repo/validation";

export interface BlockEngineInput {
  activityId: string;
  userId: string;
  deviceId: string | null;
  source: string;
  watcher: string;
  application: string;
  title: string;
  domain: string | null;
  url: string | null;
  isAfk: boolean;
  start: number;
  end: number;
  data: Record<string, unknown>;
}

export interface BlockContribution {
  activityId: string;
  contributionStart: number;
  contributionEnd: number;
  contributionDurationMs: number;
}

export interface MaterializedBlock {
  startTime: number;
  endTime: number;
  wallClockDurationMs: number;
  observedActiveDurationMs: number;
  pausedDurationMs: number;
  track: "FOREGROUND" | "AMBIENT_AUDIO" | "BACKGROUND_PROCESS";
  primaryApplication: string;
  cleanTitle: string;
  domain: string | null;
  sanitizedUrl: string | null;
  sourceChannel: "DESKTOP_WINDOW" | "BROWSER_TAB" | "COORDINATED_DESKTOP_WEB";
  rawEventCount: number;
  isAfkBlock: boolean;
  interactionDensity: Record<string, unknown>;
  sourceComposition: Record<string, unknown>;
  observations: BlockContribution[];
  observationSetFingerprint: string;
}

export interface BlockEngineOptions {
  maxGapMs?: number;
  minBreakMs?: number;
  transientThresholdMs?: number;
  maxBreakMs?: number;
}

const DEFAULTS = {
  maxGapMs: 120_000,
  minBreakMs: 60_000,
  transientThresholdMs: 15_000,
  maxBreakMs: 2 * 60 * 60 * 1000,
};

interface WorkingEvent {
  id: string;
  start: number;
  end: number;
  isAfk: boolean;
  raw: BlockEngineInput;
}

export function materializeTemporalBlocks(
  events: BlockEngineInput[],
  options: BlockEngineOptions = {}
): MaterializedBlock[] {
  const opts = { ...DEFAULTS, ...options };
  const working: WorkingEvent[] = events
    .map((raw) => ({
      id: raw.activityId,
      start: raw.start,
      end: raw.end,
      isAfk: raw.isAfk,
      raw,
    }))
    .filter((w) => w.end > w.start)
    .sort((a, b) => a.start - b.start || a.end - b.end);

  if (working.length === 0) return [];

  const carved = splitEventsAroundAfk(working);
  const usable = carved.filter((iv) => iv.end > iv.start);
  const asEvents: WorkingEvent[] = usable.map((iv) => ({
    id: iv.sourceEvent.id,
    start: iv.start,
    end: iv.end,
    isAfk: iv.isAfk,
    raw: iv.sourceEvent.raw,
  }));
  const blocks = groupIntoBlocks(asEvents, opts.maxGapMs, opts.transientThresholdMs);
  return blocks;
}

function carveAroundBreaks(events: WorkingEvent[], minBreakMs: number, maxBreakMs: number): WorkingEvent[] {
  const sorted = [...events].sort((a, b) => a.start - b.start);
  const result: WorkingEvent[] = [];
  for (const ev of sorted) {
    if (ev.isAfk) {
      const dur = ev.end - ev.start;
      if (dur < minBreakMs || dur > maxBreakMs) continue;
    }
    result.push(ev);
  }
  return result;
}

interface WorkingInterval {
  start: number;
  end: number;
  isAfk: boolean;
  sourceEvent: WorkingEvent;
}

function splitEventsAroundAfk(events: WorkingEvent[]): WorkingInterval[] {
  const afkEvents = events.filter((ev) => ev.isAfk).sort((a, b) => a.start - b.start);
  const workEvents = events.filter((ev) => !ev.isAfk);
  const intervals: WorkingInterval[] = [];

  for (const work of workEvents) {
    let cursor = work.start;
    for (const afk of afkEvents) {
      if (afk.end <= cursor || afk.start >= work.end) continue;
      if (afk.start > cursor) {
        intervals.push({ start: cursor, end: Math.min(afk.start, work.end), isAfk: false, sourceEvent: work });
      }
      cursor = Math.max(cursor, afk.end);
      if (cursor >= work.end) break;
    }
    if (cursor < work.end) {
      intervals.push({ start: cursor, end: work.end, isAfk: false, sourceEvent: work });
    }
  }

  for (const afk of afkEvents) {
    intervals.push({ start: afk.start, end: afk.end, isAfk: true, sourceEvent: afk });
  }

  return intervals.sort((a, b) => a.start - b.start);
}

function groupIntoBlocks(events: WorkingEvent[], maxGapMs: number, transientThresholdMs: number): MaterializedBlock[] {
  const blocks: MaterializedBlock[] = [];
  let current: { events: WorkingEvent[]; start: number; end: number } | null = null;

  const flush = () => {
    if (!current) return;
    blocks.push(buildBlock(current.events, current.start, current.end));
    current = null;
  };

  for (const ev of events) {
    if (current && ev.start - current.end <= maxGapMs && compatible(current.events[current.events.length - 1]!, ev)) {
      current.events.push(ev);
      current.end = Math.max(current.end, ev.end);
    } else {
      flush();
      current = { events: [ev], start: ev.start, end: ev.end };
    }
  }
  flush();

  void transientThresholdMs;
  return blocks;
}

function compatible(prev: WorkingEvent, next: WorkingEvent): boolean {
  if (prev.isAfk !== next.isAfk) return false;
  if (prev.isAfk && next.isAfk) return true;
  if (prev.raw.source !== next.raw.source) return false;
  if (prev.raw.source === "browser") {
    return (prev.raw.domain ?? null) === (next.raw.domain ?? null);
  }
  return prev.raw.application === next.raw.application;
}

export function buildFingerprint(
  userId: string,
  deviceId: string | null,
  contributions: Array<{ activityId: string; contributionStart: number; contributionEnd: number }>
): string {
  return computeObservationSetFingerprint({
    userId,
    deviceId,
    observations: contributions,
  });
}

export function unionIntervals(intervals: Array<{ start: number; end: number }>): Array<{ start: number; end: number }> {
  const valid = intervals.filter((iv) => iv.end > iv.start);
  if (valid.length === 0) return [];
  const sorted = [...valid].sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: Array<{ start: number; end: number }> = [{ start: sorted[0]!.start, end: sorted[0]!.end }];
  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i]!;
    const last = merged[merged.length - 1]!;
    if (current.start <= last.end) {
      last.end = Math.max(last.end, current.end);
    } else {
      merged.push({ start: current.start, end: current.end });
    }
  }
  return merged;
}

function buildBlock(events: WorkingEvent[], start: number, end: number): MaterializedBlock {
  const isAfkBlock = events.every((ev) => ev.isAfk);
  const contributions: BlockContribution[] = events.map((ev) => ({
    activityId: ev.id,
    contributionStart: Math.max(ev.start, start),
    contributionEnd: Math.min(ev.end, end),
    contributionDurationMs: Math.max(0, Math.min(ev.end, end) - Math.max(ev.start, start)),
  }));
  const activeIntervals = unionIntervals(
    contributions.map((c) => ({ start: c.contributionStart, end: c.contributionEnd }))
  );
  const observedActive = activeIntervals.reduce((s, iv) => s + (iv.end - iv.start), 0);
  const wallClock = end - start;
  const paused = Math.max(0, wallClock - observedActive);
  const primary = events[events.length - 1]!;
  const desktopCount = events.filter((ev) => ev.raw.source === "desktop").length;
  const browserCount = events.filter((ev) => ev.raw.source === "browser").length;
  return {
    startTime: start,
    endTime: end,
    wallClockDurationMs: wallClock,
    observedActiveDurationMs: observedActive,
    pausedDurationMs: paused,
    track: "FOREGROUND",
    primaryApplication: primary.raw.application,
    cleanTitle: primary.raw.title,
    domain: primary.raw.domain,
    sanitizedUrl: primary.raw.url,
    sourceChannel: browserCount > 0 && desktopCount > 0 ? "COORDINATED_DESKTOP_WEB" : browserCount > 0 ? "BROWSER_TAB" : "DESKTOP_WINDOW",
    rawEventCount: events.length,
    isAfkBlock,
    interactionDensity: { totalInputEvents: 0 },
    sourceComposition: { desktop: desktopCount, browser: browserCount },
    observations: contributions,
    observationSetFingerprint: buildFingerprint(primary.raw.userId, primary.raw.deviceId, contributions),
  };
}

