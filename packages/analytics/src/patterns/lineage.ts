import type { AnalyticalWindow, PatternEvidenceRef } from "@repo/types";

export function validAnalyticalWindow(window: AnalyticalWindow): boolean {
  return Number.isFinite(Date.parse(window.start)) &&
    Number.isFinite(Date.parse(window.end)) && Date.parse(window.start) < Date.parse(window.end);
}

export function containsAnalyticalWindow(outer: AnalyticalWindow, inner: AnalyticalWindow): boolean {
  return validAnalyticalWindow(outer) && validAnalyticalWindow(inner) &&
    Date.parse(inner.start) >= Date.parse(outer.start) && Date.parse(inner.end) <= Date.parse(outer.end);
}

export function unionPatternEvidence(refs: readonly PatternEvidenceRef[]): PatternEvidenceRef[] {
  const merged = new Map<string, PatternEvidenceRef>();
  for (const ref of refs) {
    const key = JSON.stringify([ref.occasionId, ref.date, ref.window.start, ref.window.end]);
    const previous = merged.get(key);
    const ids = (field: "blockIds" | "sessionIds" | "taskIds" | "reportIds") =>
      [...new Set([...(previous?.[field] ?? []), ...ref[field]])].sort();
    merged.set(key, {
      occasionId: ref.occasionId,
      date: ref.date,
      window: { ...ref.window },
      blockIds: ids("blockIds"),
      sessionIds: ids("sessionIds"),
      taskIds: ids("taskIds"),
      reportIds: ids("reportIds"),
    });
  }
  return [...merged.entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([, ref]) => ref);
}

export function hasBoundedEvidence(refs: readonly PatternEvidenceRef[], window: AnalyticalWindow): boolean {
  return refs.length > 0 && refs.every((ref) =>
    ref.occasionId.trim().length > 0 && /^\d{4}-\d{2}-\d{2}$/.test(ref.date) &&
    Number.isFinite(Date.parse(ref.date)) && containsAnalyticalWindow(window, ref.window) &&
    ref.blockIds.length + ref.sessionIds.length + ref.taskIds.length + ref.reportIds.length > 0 &&
    [...ref.blockIds, ...ref.sessionIds, ...ref.taskIds, ...ref.reportIds].every((id) => id.trim().length > 0));
}
