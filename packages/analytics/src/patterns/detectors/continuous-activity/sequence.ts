import type { TemporalEvidenceBlock } from "@repo/types";
import { safeDivide } from "../../shared/math";
import type { ContinuousActivityConfig, ContinuousActivityRun } from "./types";

/**
 * Validates whether an evidence block has a strictly valid non-negative temporal window.
 */
export function isValidTemporalBlock(block: TemporalEvidenceBlock): boolean {
  if (!block.startTime || !block.endTime) return false;
  const startMs = Date.parse(block.startTime);
  const endMs = Date.parse(block.endTime);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return false;
  if (endMs <= startMs) return false;
  if (block.durationSeconds <= 0 || !Number.isFinite(block.durationSeconds)) return false;
  return true;
}

/**
 * Determines whether a block represents observed physical activity.
 * Phase 4 Rule: Physical activity requires OBSERVED or OBSERVED_REPORTED coverage,
 * and cannot be AFK or a Break.
 */
export function isObservedActivity(block: TemporalEvidenceBlock): boolean {
  if (block.coverage !== "OBSERVED" && block.coverage !== "OBSERVED_REPORTED") {
    return false;
  }
  if (block.observation?.isAfk === true) {
    return false;
  }
  if (block.observation?.category === "break") {
    return false;
  }
  return true;
}

/**
 * Determines whether a block represents an explicit continuity-breaking interruption.
 * UNKNOWN intervals, explicit breaks, and AFK intervals definitively close continuous episodes.
 */
export function isInterruption(block: TemporalEvidenceBlock): boolean {
  if (block.coverage === "UNKNOWN") return true;
  if (block.observation?.isAfk === true) return true;
  if (block.observation?.category === "break") return true;
  return false;
}

/**
 * Deterministically sorts evidence blocks into canonical temporal order.
 * Primary: startTime ascending
 * Secondary: endTime ascending
 * Tertiary: stable unique id ascending
 */
export function sortEvidenceBlocks(blocks: TemporalEvidenceBlock[]): TemporalEvidenceBlock[] {
  return [...blocks].sort((a, b) => {
    const startCmp = Date.parse(a.startTime) - Date.parse(b.startTime);
    if (startCmp !== 0) return startCmp;
    const endCmp = Date.parse(a.endTime) - Date.parse(b.endTime);
    if (endCmp !== 0) return endCmp;
    return a.id.localeCompare(b.id);
  });
}

interface MergedObservedInterval {
  startTime: string;
  endTime: string;
  durationSeconds: number;
  blockIds: string[];
  canonicalContexts: Map<string, number>;
}

/**
 * Merges overlapping or immediately contiguous observed activity blocks into non-overlapping union intervals.
 * Invariant: Overlapping evidence never double-counts duration.
 */
export function mergeOverlappingObservedBlocks(
  blocks: TemporalEvidenceBlock[]
): MergedObservedInterval[] {
  const sorted = sortEvidenceBlocks(blocks.filter(isValidTemporalBlock).filter(isObservedActivity));
  if (sorted.length === 0) return [];

  const merged: MergedObservedInterval[] = [];
  let current: MergedObservedInterval | null = null;

  for (const block of sorted) {
    const bStartMs = Date.parse(block.startTime);
    const bEndMs = Date.parse(block.endTime);
    const bContext =
      block.observation?.application || block.observation?.domain || "unattributed";

    if (!current) {
      const contexts = new Map<string, number>();
      contexts.set(bContext, block.durationSeconds);
      current = {
        startTime: block.startTime,
        endTime: block.endTime,
        durationSeconds: (bEndMs - bStartMs) / 1000,
        blockIds: [block.id],
        canonicalContexts: contexts,
      };
    } else {
      const curEndMs = Date.parse(current.endTime);
      if (bStartMs <= curEndMs) {
        // Overlap or immediate contiguity -> union interval
        if (bEndMs > curEndMs) {
          current.endTime = block.endTime;
          current.durationSeconds = (bEndMs - Date.parse(current.startTime)) / 1000;
        }
        current.blockIds.push(block.id);
        const existingContextDuration = current.canonicalContexts.get(bContext) ?? 0;
        current.canonicalContexts.set(bContext, existingContextDuration + block.durationSeconds);
      } else {
        merged.push(current);
        const contexts = new Map<string, number>();
        contexts.set(bContext, block.durationSeconds);
        current = {
          startTime: block.startTime,
          endTime: block.endTime,
          durationSeconds: (bEndMs - bStartMs) / 1000,
          blockIds: [block.id],
          canonicalContexts: contexts,
        };
      }
    }
  }

  if (current) {
    merged.push(current);
  }

  return merged;
}

/**
 * Subtracts interruption intervals from an observed interval.
 */
function subtractInterruptionFromInterval(
  interval: MergedObservedInterval,
  interStartMs: number,
  interEndMs: number
): MergedObservedInterval[] {
  const oStartMs = Date.parse(interval.startTime);
  const oEndMs = Date.parse(interval.endTime);

  // No overlap
  if (interEndMs <= oStartMs || interStartMs >= oEndMs) {
    return [interval];
  }

  const result: MergedObservedInterval[] = [];

  // Left piece before interruption
  if (interStartMs > oStartMs) {
    result.push({
      startTime: interval.startTime,
      endTime: new Date(interStartMs).toISOString(),
      durationSeconds: (interStartMs - oStartMs) / 1000,
      blockIds: [...interval.blockIds],
      canonicalContexts: new Map(interval.canonicalContexts),
    });
  }

  // Right piece after interruption
  if (interEndMs < oEndMs) {
    result.push({
      startTime: new Date(interEndMs).toISOString(),
      endTime: interval.endTime,
      durationSeconds: (oEndMs - interEndMs) / 1000,
      blockIds: [...interval.blockIds],
      canonicalContexts: new Map(interval.canonicalContexts),
    });
  }

  return result;
}

/**
 * Segments a sequence of evidence blocks into candidate continuous observed activity runs.
 * Continuity rules:
 * - Contiguous observed intervals continue the run.
 * - Gaps <= maximumContinuityGapSeconds without an intervening interruption block continue the run.
 * - Gaps > maximumContinuityGapSeconds, UNKNOWN intervals, breaks, or AFK definitively close the run.
 */
export function segmentContinuousActivityRuns(
  blocks: TemporalEvidenceBlock[],
  config: ContinuousActivityConfig,
  _windowEnd?: string
): ContinuousActivityRun[] {
  const validBlocks = blocks.filter(isValidTemporalBlock);
  if (validBlocks.length === 0) return [];

  const interruptions = sortEvidenceBlocks(validBlocks.filter(isInterruption));
  let mergedObserved = mergeOverlappingObservedBlocks(validBlocks);
  if (mergedObserved.length === 0) return [];

  // Subtract any overlapping interruptions from observed intervals
  for (const inter of interruptions) {
    const interStartMs = Date.parse(inter.startTime);
    const interEndMs = Date.parse(inter.endTime);
    const nextMerged: MergedObservedInterval[] = [];
    for (const obs of mergedObserved) {
      nextMerged.push(...subtractInterruptionFromInterval(obs, interStartMs, interEndMs));
    }
    mergedObserved = nextMerged;
  }

  if (mergedObserved.length === 0) return [];

  const runs: ContinuousActivityRun[] = [];
  let currentRun: {
    startTime: string;
    endTime: string;
    observedDurationSeconds: number;
    blockIds: string[];
  } = {
    startTime: mergedObserved[0]!.startTime,
    endTime: mergedObserved[0]!.endTime,
    observedDurationSeconds: mergedObserved[0]!.durationSeconds,
    blockIds: [...mergedObserved[0]!.blockIds],
  };

  let totalInterruptions = 0;

  for (let i = 1; i < mergedObserved.length; i++) {
    const prev = mergedObserved[i - 1]!;
    const curr = mergedObserved[i]!;

    const prevEndMs = Date.parse(prev.endTime);
    const currStartMs = Date.parse(curr.startTime);
    const gapSeconds = Math.max(0, (currStartMs - prevEndMs) / 1000);

    // Check if any interruption block overlaps the gap between prev and curr
    const hasInterruptionInGap = interruptions.some((inter) => {
      const interStartMs = Date.parse(inter.startTime);
      const interEndMs = Date.parse(inter.endTime);
      return interStartMs < currStartMs && interEndMs > prevEndMs;
    });

    if (gapSeconds <= config.maximumContinuityGapSeconds && !hasInterruptionInGap) {
      // Continuous: extend current run
      currentRun.endTime = curr.endTime;
      currentRun.observedDurationSeconds += curr.durationSeconds;
      currentRun.blockIds.push(...curr.blockIds);
    } else {
      // Continuity broken: finalize current run and start new one
      totalInterruptions++;
      const runStartMs = Date.parse(currentRun.startTime);
      const runEndMs = Date.parse(currentRun.endTime);
      const continuousDurationSeconds = Math.max(0, (runEndMs - runStartMs) / 1000);

      runs.push({
        startTime: currentRun.startTime,
        endTime: currentRun.endTime,
        continuousDurationSeconds,
        observedDurationSeconds: currentRun.observedDurationSeconds,
        blockIds: currentRun.blockIds,
        interruptionCount: totalInterruptions - 1,
        isOpenInterval: false,
      });

      currentRun = {
        startTime: curr.startTime,
        endTime: curr.endTime,
        observedDurationSeconds: curr.durationSeconds,
        blockIds: [...curr.blockIds],
      };
    }
  }

  // Finalize last run
  const runStartMs = Date.parse(currentRun.startTime);
  const runEndMs = Date.parse(currentRun.endTime);
  const continuousDurationSeconds = Math.max(0, (runEndMs - runStartMs) / 1000);

  runs.push({
    startTime: currentRun.startTime,
    endTime: currentRun.endTime,
    continuousDurationSeconds,
    observedDurationSeconds: currentRun.observedDurationSeconds,
    blockIds: currentRun.blockIds,
    interruptionCount: totalInterruptions,
    isOpenInterval: false,
  });

  return runs;
}
