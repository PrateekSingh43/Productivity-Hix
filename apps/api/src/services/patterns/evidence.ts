import { createHash } from "node:crypto";
import type { AnalyticalWindow, CheckIn, EvidenceTimeline, NormalizedActivityEvent, TemporalEvidenceBlock, WorkSession } from "@repo/types";

export const stableId = (...parts: unknown[]) => createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 24);
export const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
export const overlaps = (start: string, end: string, window: AnalyticalWindow) =>
  Date.parse(start) < Date.parse(end) && Date.parse(start) < Date.parse(window.end) && Date.parse(end) > Date.parse(window.start);

function windowBounds(window: AnalyticalWindow) {
  const from = Date.parse(window.start);
  const to = Date.parse(window.end);
  if (!Number.isFinite(from) || !Number.isFinite(to) || from >= to) throw new RangeError("Invalid evidence window.");
  return { from, to };
}

function observation(event: NormalizedActivityEvent): TemporalEvidenceBlock["observation"] {
  const data = event.data;
  const status = typeof data.status === "string" ? data.status.toLowerCase() : undefined;
  const isAfk = data.isAfk === true || data.isIdle === true || status === "afk" || status === "idle" || status === "locked";
  if (!isAfk && event.watcher !== "window" && event.watcher !== "web") return null;
  const application = String(data.application ?? data.app ?? "");
  const title = String(data.windowTitle ?? data.title ?? "");
  if (!isAfk && !application && !title && !data.url) return null;
  return {
    application, title, cleanTitle: title,
    domain: typeof data.domain === "string" ? data.domain : null,
    category: isAfk ? "break" : event.watcher === "web" ? "browser" : "general",
    isAfk, rawEventCount: 1,
  };
}

export function assembleEvidence(
  userId: string,
  window: AnalyticalWindow,
  events: NormalizedActivityEvent[],
  sessions: WorkSession[],
  checkIns: CheckIn[],
): EvidenceTimeline {
  const { from, to } = windowBounds(window);
  type Item = { key: string; start: number; end: number; event?: NormalizedActivityEvent; session?: WorkSession; report?: CheckIn };
  const items: Item[] = [
    ...events.filter((event) => Number.isFinite(event.duration) && event.duration > 0).map((event) => ({
      key: `event:${event.source}:${event.bucketId}:${event.externalId}`,
      start: Date.parse(event.timestamp), end: Date.parse(event.timestamp) + event.duration * 1000, event,
    })),
    ...sessions.filter((session) => session.endedAt && !session.isPaused && session.source === "manual").map((session) => ({
      key: `session:${session.id}`, start: Date.parse(session.startedAt), end: Date.parse(session.endedAt!), session,
    })),
    ...checkIns.filter((report) => report.windowStart && report.windowEnd).map((report) => ({
      key: `report:${report.id}`, start: Date.parse(report.windowStart!), end: Date.parse(report.windowEnd!), report,
    })),
  ].map((item) => ({ ...item, start: Math.max(from, item.start), end: Math.min(to, item.end) }))
    .filter((item) => Number.isFinite(item.start) && Number.isFinite(item.end) && item.end > item.start)
    .sort((a, b) => compare(a.key, b.key) || compare(JSON.stringify(a), JSON.stringify(b)));
  const starts = new Map<number, Item[]>();
  const ends = new Map<number, Item[]>();
  for (const item of items) {
    const starting = starts.get(item.start);
    if (starting) starting.push(item);
    else starts.set(item.start, [item]);
    const ending = ends.get(item.end);
    if (ending) ending.push(item);
    else ends.set(item.end, [item]);
  }
  const bounds = [...new Set([from, to, ...starts.keys(), ...ends.keys()])].sort((a, b) => a - b);
  const active = new Map<string, Item>();
  const blocks: TemporalEvidenceBlock[] = [];
  for (let i = 0; i < bounds.length - 1; i++) {
    const start = bounds[i]!;
    const end = bounds[i + 1]!;
    for (const item of ends.get(start) ?? []) active.delete(item.key);
    for (const item of starts.get(start) ?? []) active.set(item.key, item);
    const covering = [...active.values()].sort((a, b) => compare(a.key, b.key));
    const observed = covering.flatMap((item) => {
      const value = item.event && observation(item.event);
      return value ? [{ item, value }] : [];
    }).sort((a, b) => Number(b.value.isAfk) - Number(a.value.isAfk) ||
      Number(b.item.event?.source === "desktop") - Number(a.item.event?.source === "desktop") || compare(a.item.key, b.item.key));
    const primary = observed[0];
    const reports = covering.flatMap((item) => item.report ? [item.report] : []);
    const report = reports[0];
    const taskIds = [...new Set(covering.flatMap((item) => item.session?.taskId ? [item.session.taskId] : []))];
    const startTime = new Date(start).toISOString();
    const endTime = new Date(end).toISOString();
    blocks.push({
      id: `evidence:${stableId(userId, startTime, endTime, covering.map((item) => item.key))}`,
      startTime, endTime, durationSeconds: (end - start) / 1000,
      coverage: primary ? report ? "OBSERVED_REPORTED" : "OBSERVED" : report ? "REPORTED" : "UNKNOWN",
      provenance: covering.map((item) => ({ source: item.key, authority: item.event ? "SYSTEM" : "USER" })),
      observation: primary?.value ?? null,
      report: report ? {
        source: "CHECK_IN", reportingWindow: { start: report.windowStart!, end: report.windowEnd! },
        assessment: report.activityAssessment, alignment: report.alignment, energy: report.energy,
        focus: report.focus, note: report.note, reasons: report.reasons, authority: "USER",
      } : null,
      intention: taskIds.length === 1 && primary && !primary.value.isAfk
        ? { targetScope: "TASK", taskId: taskIds[0], linkType: "EXPLICIT" } : null,
      outcome: null,
    });
  }
  return timelineFromBlocks(window, blocks);
}

export function timelineFromBlocks(window: AnalyticalWindow, blocks: TemporalEvidenceBlock[]): EvidenceTimeline {
  const { from, to } = windowBounds(window);
  const clipped = blocks.flatMap((block) => {
    const start = Math.max(from, Date.parse(block.startTime));
    const end = Math.min(to, Date.parse(block.endTime));
    return end > start ? [{ ...block, startTime: new Date(start).toISOString(), endTime: new Date(end).toISOString(), durationSeconds: (end - start) / 1000 }] : [];
  });
  const seconds = (coverage: TemporalEvidenceBlock["coverage"]) => clipped.filter((block) => block.coverage === coverage).reduce((sum, block) => sum + block.durationSeconds, 0);
  const totalDurationSeconds = (Date.parse(window.end) - Date.parse(window.start)) / 1000;
  return {
    windowStart: window.start, windowEnd: window.end, totalDurationSeconds, blocks: clipped,
    coverageSummary: {
      totalDurationSeconds, observedSeconds: seconds("OBSERVED"), observedReportedSeconds: seconds("OBSERVED_REPORTED"),
      reportedSeconds: seconds("REPORTED"), unknownSeconds: seconds("UNKNOWN"), explainedGapSeconds: seconds("EXPLAINED_GAP"),
      coverageRatio: (totalDurationSeconds - seconds("UNKNOWN")) / totalDurationSeconds,
    },
  };
}
