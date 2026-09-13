import type {
  TemporalEvidenceBlock,
  EvidenceProvenance,
  ObservationEvidence,
  ReportEvidence,
  IntentionEvidence,
  OutcomeEvidence,
} from "@repo/types";
import type { BuildEvidenceOptions } from "./types";

export function toEpochMs(val: string | Date | number): number {
  if (typeof val === "number") return val;
  if (val instanceof Date) return val.getTime();
  const parsed = Date.parse(val);
  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid timestamp: ${val}`);
  }
  return parsed;
}

export interface AtomicInterval {
  startMs: number;
  endMs: number;
  durationSeconds: number;
}

/**
 * Collects and deduplicates all timestamp boundaries from all input sources,
 * clipped to the query window [windowStartMs, windowEndMs].
 */
export function collectAtomicBoundaries(
  options: BuildEvidenceOptions,
  windowStartMs: number,
  windowEndMs: number,
): number[] {
  const boundaries = new Set<number>();

  const add = (raw: string | Date | number | null | undefined) => {
    if (raw === null || raw === undefined) return;
    try {
      const ms = toEpochMs(raw);
      if (Number.isFinite(ms) && ms >= windowStartMs && ms <= windowEndMs) {
        boundaries.add(ms);
      }
    } catch {
      // ignore invalid timestamps gracefully
    }
  };

  // 1. Mandatory window boundaries
  boundaries.add(windowStartMs);
  boundaries.add(windowEndMs);

  // 2. Segments
  if (options.segments) {
    for (const seg of options.segments) {
      add(seg.start);
      add(seg.end);
    }
  }

  // 3. Raw Events
  if (options.events) {
    for (const ev of options.events) {
      add(ev.timestamp);
      try {
        const startMs = toEpochMs(ev.timestamp);
        const durSec = ev.duration || 0;
        if (Number.isFinite(durSec) && durSec > 0) {
          add(startMs + Math.round(durSec * 1000));
        }
      } catch {
        // ignore
      }
    }
  }

  // 4. Check-Ins
  if (options.checkIns) {
    for (const ci of options.checkIns) {
      add(ci.windowStart);
      add(ci.windowEnd);
      add(ci.createdAt);
    }
  }

  // 5. Gap Explanations
  if (options.gapExplanations) {
    for (const exp of options.gapExplanations) {
      add(exp.startTime);
      add(exp.endTime);
    }
  }

  // 6. Work Sessions
  if (options.sessions) {
    for (const s of options.sessions) {
      add(s.startedAt);
      add(s.endedAt);
    }
  }

  // 7. Tasks (completedAt)
  if (options.tasks) {
    for (const t of options.tasks) {
      add(t.completedAt);
    }
  }

  const sorted = Array.from(boundaries).sort((a, b) => a - b);
  return sorted;
}

/**
 * Creates contiguous non-overlapping atomic intervals from sorted boundaries.
 */
export function createAtomicIntervals(boundaries: number[]): AtomicInterval[] {
  const intervals: AtomicInterval[] = [];

  for (let i = 0; i < boundaries.length - 1; i++) {
    const startMs = boundaries[i]!;
    const endMs = boundaries[i + 1]!;
    const durationSeconds = Math.round((endMs - startMs) / 1000);

    if (durationSeconds > 0) {
      intervals.push({
        startMs,
        endMs,
        durationSeconds,
      });
    }
  }

  return intervals;
}

/**
 * Canonical dimension fingerprints to ensure merge equivalence preserves all semantic fields.
 */
export function observationFingerprint(obs: ObservationEvidence | null): string {
  if (!obs) return "null";
  return JSON.stringify([
    obs.application,
    obs.title,
    obs.cleanTitle,
    obs.domain ?? null,
    obs.sanitizedUrl ?? null,
    obs.category,
    obs.isAfk,
  ]);
}

export function reportFingerprint(rep: ReportEvidence | null): string {
  if (!rep) return "null";
  const sortedReasons = rep.reasons ? [...rep.reasons].sort() : [];
  return JSON.stringify([
    rep.source,
    rep.reportingWindow.start,
    rep.reportingWindow.end,
    rep.assessment ?? null,
    rep.alignment ?? null,
    rep.energy ?? null,
    rep.focus ?? null,
    rep.note ?? null,
    sortedReasons,
    rep.gapReason ?? null,
    rep.offlineWorkContext ?? null,
    rep.authority,
  ]);
}

export function intentionFingerprint(intent: IntentionEvidence | null): string {
  if (!intent) return "null";
  return JSON.stringify([
    intent.targetScope,
    intent.taskId ?? null,
    intent.taskTitle ?? null,
    intent.goalId ?? null,
    intent.goalTitle ?? null,
    intent.linkType,
    intent.confidence ?? null,
  ]);
}

export function outcomeFingerprint(outcome: OutcomeEvidence | null): string {
  if (!outcome) return "null";
  return JSON.stringify([
    outcome.taskId ?? null,
    outcome.taskStatus ?? null,
    outcome.taskCompletedAt ?? null,
    outcome.goalId ?? null,
    outcome.goalOutcome ?? null,
  ]);
}

/**
 * Compares whether two adjacent blocks are semantically equivalent across all evidence dimensions.
 */
export function areBlocksSemanticallyEquivalent(
  a: TemporalEvidenceBlock,
  b: TemporalEvidenceBlock,
): boolean {
  if (a.coverage !== b.coverage) return false;
  if (observationFingerprint(a.observation) !== observationFingerprint(b.observation)) return false;
  if (reportFingerprint(a.report) !== reportFingerprint(b.report)) return false;
  if (intentionFingerprint(a.intention) !== intentionFingerprint(b.intention)) return false;
  if (outcomeFingerprint(a.outcome) !== outcomeFingerprint(b.outcome)) return false;
  return true;
}

function deduplicateProvenance(items: EvidenceProvenance[]): EvidenceProvenance[] {
  const seen = new Set<string>();
  const result: EvidenceProvenance[] = [];
  for (const item of items) {
    const key = `${item.source}:${item.authority}:${item.collector ?? ""}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(item);
    }
  }
  return result;
}

/**
 * Merges contiguous adjacent blocks only when their semantic evidence state is identical.
 */
export function mergeAdjacentEquivalentBlocks(
  blocks: TemporalEvidenceBlock[],
): TemporalEvidenceBlock[] {
  if (blocks.length <= 1) return blocks;

  const merged: TemporalEvidenceBlock[] = [];
  let current = { ...blocks[0]! };

  for (let i = 1; i < blocks.length; i++) {
    const next = blocks[i]!;

    if (areBlocksSemanticallyEquivalent(current, next)) {
      // Merge next into current
      current.endTime = next.endTime;
      current.durationSeconds = current.durationSeconds + next.durationSeconds;
      current.provenance = deduplicateProvenance([
        ...current.provenance,
        ...next.provenance,
      ]);

      if (current.observation && next.observation) {
        current.observation = {
          ...current.observation,
          rawEventCount:
            current.observation.rawEventCount + next.observation.rawEventCount,
        };
      }
    } else {
      merged.push(current);
      current = { ...next };
    }
  }

  merged.push(current);
  return merged;
}
