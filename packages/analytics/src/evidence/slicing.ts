import type { TemporalEvidenceBlock, EvidenceProvenance } from "@repo/types";
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
 * Compares whether two adjacent blocks are semantically equivalent across all evidence dimensions.
 */
export function areBlocksSemanticallyEquivalent(
  a: TemporalEvidenceBlock,
  b: TemporalEvidenceBlock,
): boolean {
  // 1. Coverage state must match
  if (a.coverage !== b.coverage) return false;

  // 2. Observation equivalence
  if ((a.observation === null) !== (b.observation === null)) return false;
  if (a.observation && b.observation) {
    if (
      a.observation.application !== b.observation.application ||
      a.observation.category !== b.observation.category ||
      a.observation.title !== b.observation.title ||
      a.observation.isAfk !== b.observation.isAfk ||
      a.observation.domain !== b.observation.domain
    ) {
      return false;
    }
  }

  // 3. Report equivalence
  if ((a.report === null) !== (b.report === null)) return false;
  if (a.report && b.report) {
    if (
      a.report.source !== b.report.source ||
      a.report.assessment !== b.report.assessment ||
      a.report.gapReason !== b.report.gapReason ||
      a.report.note !== b.report.note
    ) {
      return false;
    }
  }

  // 4. Intention equivalence
  if ((a.intention === null) !== (b.intention === null)) return false;
  if (a.intention && b.intention) {
    if (
      a.intention.targetScope !== b.intention.targetScope ||
      a.intention.taskId !== b.intention.taskId ||
      a.intention.linkType !== b.intention.linkType
    ) {
      return false;
    }
  }

  // 5. Outcome equivalence
  if ((a.outcome === null) !== (b.outcome === null)) return false;
  if (a.outcome && b.outcome) {
    if (
      a.outcome.taskId !== b.outcome.taskId ||
      a.outcome.taskStatus !== b.outcome.taskStatus ||
      a.outcome.goalOutcome !== b.outcome.goalOutcome
    ) {
      return false;
    }
  }

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
