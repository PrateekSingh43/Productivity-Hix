import type { TemporalEvidenceBlock } from "@repo/types";
import { median, iqr } from "../../baseline/statistics";
import { safeDivide } from "../../shared/math";
import type { TaskExecutionGapBreakdown } from "./types";

/**
 * An uninterrupted, contiguous block of active execution on an authoritative task.
 */
export interface TaskExecutionFragment {
  startTime: string; // ISO 8601
  endTime: string;   // ISO 8601
  durationSeconds: number;
  blockIds: string[];
}

/**
 * An intervening gap between execution fragments within a bounded task episode.
 */
export interface TaskInterveningGap {
  startTime: string; // ISO 8601
  endTime: string;   // ISO 8601
  durationSeconds: number;
  kind: "break" | "other_task" | "unattributed_observed" | "explained_gap" | "unknown";
  blockIds: string[];
}

/**
 * Bounded Task Execution Episode resulting from canonical sequence parsing.
 */
export interface BoundedTaskExecutionEpisode {
  taskId: string;
  startedAt: string; // ISO 8601
  endedAt: string;   // ISO 8601
  wallClockSpanSeconds: number;
  activeTaskDurationSeconds: number;
  knownInterveningGapSeconds: number;
  unknownSeconds: number;
  unknownFraction: number;
  wallClockFragmentationRatio: number | null;
  fragmentCount: number;
  fragments: TaskExecutionFragment[];
  gaps: TaskInterveningGap[];
  gapBreakdown: TaskExecutionGapBreakdown;
  medianFragmentDurationSeconds: number | null;
  longestFragmentDurationSeconds: number | null;
  interquartileFragmentDurationSeconds: number | null;
  medianInterveningGapSeconds: number | null;
}

export interface TaskSequenceOptions {
  continuationGapThresholdSeconds?: number;
  timezone?: string;
  maxUnknownFraction?: number;
}

/**
 * Helper to check if two UTC timestamps fall on different calendar days in the given timezone.
 */
export function isDifferentCalendarDay(utcA: string, utcB: string, timezone: string): boolean {
  try {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    return formatter.format(new Date(utcA)) !== formatter.format(new Date(utcB));
  } catch {
    return false;
  }
}

/**
 * Checks whether an evidence block represents authoritative active execution on the specified task.
 * UNKNOWN or missing telemetry is strictly excluded from active task execution.
 */
export function isAuthoritativeTaskBlock(block: TemporalEvidenceBlock, taskId: string): boolean {
  if (!block.intention || block.intention.linkType !== "EXPLICIT" || block.intention.taskId !== taskId) {
    return false;
  }
  // Physical execution requires telemetry observation (OBSERVED or OBSERVED_REPORTED)
  return block.coverage === "OBSERVED" || block.coverage === "OBSERVED_REPORTED";
}

/**
 * Extracts all distinct authoritative task IDs present in the evidence blocks.
 * Only blocks with intention.linkType === "EXPLICIT" and non-empty taskId are considered.
 * Returns sorted canonical array of task IDs.
 */
export function findAuthoritativeTaskIds(blocks: TemporalEvidenceBlock[]): string[] {
  const taskIds = new Set<string>();
  for (const block of blocks) {
    if (block.intention?.linkType === "EXPLICIT" && block.intention.taskId) {
      taskIds.add(block.intention.taskId);
    }
  }
  return Array.from(taskIds).sort();
}

/**
 * Canonical deterministic sorting of evidence blocks.
 * Primary: startTime ascending
 * Secondary: endTime ascending
 * Tertiary: unique block id ascending
 */
export function sortEvidenceBlocks(blocks: TemporalEvidenceBlock[]): TemporalEvidenceBlock[] {
  return [...blocks].sort((a, b) => {
    if (a.startTime !== b.startTime) return a.startTime < b.startTime ? -1 : 1;
    if (a.endTime !== b.endTime) return a.endTime < b.endTime ? -1 : 1;
    if (a.id !== b.id) return a.id < b.id ? -1 : 1;
    return 0;
  });
}

/**
 * Classifies an intervening block inside the bounded episode into exactly one gap category.
 */
export function classifyInterveningBlock(
  block: TemporalEvidenceBlock,
  targetTaskId: string
): { kind: TaskInterveningGap["kind"]; isKnown: boolean } {
  if (block.coverage === "UNKNOWN") {
    return { kind: "unknown", isKnown: false };
  }

  // 1. Break / AFK
  if (block.observation?.category === "break" || block.observation?.isAfk === true) {
    return { kind: "break", isKnown: true };
  }

  // 2. Explicitly linked to another task
  if (
    block.intention?.linkType === "EXPLICIT" &&
    block.intention.taskId &&
    block.intention.taskId !== targetTaskId
  ) {
    return { kind: "other_task", isKnown: true };
  }

  // 3. User-explained gap
  if (block.coverage === "EXPLAINED_GAP") {
    return { kind: "explained_gap", isKnown: true };
  }

  // 4. Unattributed observed work
  return { kind: "unattributed_observed", isKnown: true };
}

/**
 * Segments a sequence of evidence blocks into bounded task execution episodes for a specific task.
 * Follows the Bounded Task Execution Episode State Machine:
 * - A bounded episode starts with the first active task fragment.
 * - An intervening non-task interval <= continuationGapThreshold within the same calendar day continues the episode.
 * - An intervening gap > continuationGapThreshold, or a local calendar day change, closes the episode.
 */
export function segmentTaskExecutionEpisodes(
  blocks: TemporalEvidenceBlock[],
  targetTaskId: string,
  options?: TaskSequenceOptions
): BoundedTaskExecutionEpisode[] {
  const sortedBlocks = sortEvidenceBlocks(blocks);
  const continuationThreshold = options?.continuationGapThresholdSeconds ?? 7200; // 2 hours
  const timezone = options?.timezone ?? "UTC";

  // Step 1: Identify all active task blocks for targetTaskId
  const taskBlockIndices: number[] = [];
  for (let i = 0; i < sortedBlocks.length; i++) {
    if (isAuthoritativeTaskBlock(sortedBlocks[i]!, targetTaskId)) {
      taskBlockIndices.push(i);
    }
  }

  if (taskBlockIndices.length === 0) {
    return [];
  }

  // Step 2: Group task blocks into contiguous fragments
  const fragmentsList: TaskExecutionFragment[] = [];
  let currentFragment: {
    startTime: string;
    endTime: string;
    durationSeconds: number;
    blockIds: string[];
    lastBlockIndex: number;
    firstBlockIndex: number;
  } | null = null;

  for (const idx of taskBlockIndices) {
    const block = sortedBlocks[idx]!;
    if (currentFragment === null) {
      currentFragment = {
        startTime: block.startTime,
        endTime: block.endTime,
        durationSeconds: block.durationSeconds,
        blockIds: [block.id],
        lastBlockIndex: idx,
        firstBlockIndex: idx,
      };
    } else if (idx === currentFragment.lastBlockIndex + 1) {
      // Contiguous in sorted sequence
      currentFragment.endTime = block.endTime;
      currentFragment.durationSeconds += block.durationSeconds;
      currentFragment.blockIds.push(block.id);
      currentFragment.lastBlockIndex = idx;
    } else {
      // Check if there is an intervening gap between currentFragment and this block
      // If there are intervening blocks, finalize currentFragment
      fragmentsList.push({
        startTime: currentFragment.startTime,
        endTime: currentFragment.endTime,
        durationSeconds: currentFragment.durationSeconds,
        blockIds: currentFragment.blockIds,
      });
      currentFragment = {
        startTime: block.startTime,
        endTime: block.endTime,
        durationSeconds: block.durationSeconds,
        blockIds: [block.id],
        lastBlockIndex: idx,
        firstBlockIndex: idx,
      };
    }
  }

  if (currentFragment !== null) {
    fragmentsList.push({
      startTime: currentFragment.startTime,
      endTime: currentFragment.endTime,
      durationSeconds: currentFragment.durationSeconds,
      blockIds: currentFragment.blockIds,
    });
  }

  // Step 3: Cluster fragments into bounded episodes using continuation threshold and calendar day boundary
  interface FragmentCluster {
    fragments: TaskExecutionFragment[];
  }

  const clusters: FragmentCluster[] = [];
  let currentCluster: FragmentCluster = { fragments: [fragmentsList[0]!] };

  for (let i = 1; i < fragmentsList.length; i++) {
    const prevFragment = fragmentsList[i - 1]!;
    const nextFragment = fragmentsList[i]!;

    const prevEndMs = Date.parse(prevFragment.endTime);
    const nextStartMs = Date.parse(nextFragment.startTime);
    const gapSeconds = Math.max(0, (nextStartMs - prevEndMs) / 1000);

    const isDayCrossed = isDifferentCalendarDay(prevFragment.endTime, nextFragment.startTime, timezone);

    if (gapSeconds > continuationThreshold || isDayCrossed) {
      // Close current episode cluster, initiate a new one
      clusters.push(currentCluster);
      currentCluster = { fragments: [nextFragment] };
    } else {
      // Same bounded episode continues
      currentCluster.fragments.push(nextFragment);
    }
  }
  clusters.push(currentCluster);

  // Step 4: For each cluster, build the BoundedTaskExecutionEpisode
  const episodes: BoundedTaskExecutionEpisode[] = [];

  for (const cluster of clusters) {
    const clusterFragments = cluster.fragments;
    const firstFragment = clusterFragments[0]!;
    const lastFragment = clusterFragments[clusterFragments.length - 1]!;

    const startedAt = firstFragment.startTime;
    const endedAt = lastFragment.endTime;
    const wallClockSpanSeconds = Math.max(0, (Date.parse(endedAt) - Date.parse(startedAt)) / 1000);

    let activeTaskDurationSeconds = 0;
    for (const frag of clusterFragments) {
      activeTaskDurationSeconds += frag.durationSeconds;
    }

    // Identify intervening blocks inside [startedAt, endedAt)
    const interveningBlocks = sortedBlocks.filter((b) => {
      const bStartMs = Date.parse(b.startTime);
      const bEndMs = Date.parse(b.endTime);
      const spanStartMs = Date.parse(startedAt);
      const spanEndMs = Date.parse(endedAt);

      // Must be inside the bounding interval
      if (bStartMs < spanStartMs || bEndMs > spanEndMs) return false;

      // Must not be one of the active task blocks
      return !isAuthoritativeTaskBlock(b, targetTaskId);
    });

    let knownInterveningGapSeconds = 0;
    let unknownSeconds = 0;
    let breakSeconds = 0;
    let otherTaskSeconds = 0;
    let unattributedObservedSeconds = 0;
    let explainedGapSeconds = 0;

    const gaps: TaskInterveningGap[] = [];

    for (const b of interveningBlocks) {
      const { kind, isKnown } = classifyInterveningBlock(b, targetTaskId);
      if (isKnown) {
        knownInterveningGapSeconds += b.durationSeconds;
        switch (kind) {
          case "break":
            breakSeconds += b.durationSeconds;
            break;
          case "other_task":
            otherTaskSeconds += b.durationSeconds;
            break;
          case "unattributed_observed":
            unattributedObservedSeconds += b.durationSeconds;
            break;
          case "explained_gap":
            explainedGapSeconds += b.durationSeconds;
            break;
        }
      } else {
        unknownSeconds += b.durationSeconds;
      }

      gaps.push({
        startTime: b.startTime,
        endTime: b.endTime,
        durationSeconds: b.durationSeconds,
        kind,
        blockIds: [b.id],
      });
    }

    // Zero guard for fractions
    const unknownFraction = wallClockSpanSeconds > 0 ? safeDivide(unknownSeconds, wallClockSpanSeconds) ?? 0 : 0;
    const wallClockFragmentationRatio = wallClockSpanSeconds > 0 ? safeDivide(knownInterveningGapSeconds, wallClockSpanSeconds) ?? 0 : 0;

    // Fragment metrics (Method-7)
    const fragmentDurations = clusterFragments.map((f) => f.durationSeconds);
    const medianFragmentDuration = median(fragmentDurations);
    const longestFragmentDuration = fragmentDurations.length > 0 ? Math.max(...fragmentDurations) : null;
    const iqrFragmentDuration = iqr(fragmentDurations);

    // Intervening gap metrics
    // Calculate temporal separation between successive fragments
    const separationGaps: number[] = [];
    for (let j = 1; j < clusterFragments.length; j++) {
      const prevEnd = Date.parse(clusterFragments[j - 1]!.endTime);
      const currStart = Date.parse(clusterFragments[j]!.startTime);
      separationGaps.push(Math.max(0, (currStart - prevEnd) / 1000));
    }
    const medianInterveningGapSeconds = separationGaps.length > 0 ? median(separationGaps) : null;

    episodes.push({
      taskId: targetTaskId,
      startedAt,
      endedAt,
      wallClockSpanSeconds,
      activeTaskDurationSeconds,
      knownInterveningGapSeconds,
      unknownSeconds,
      unknownFraction,
      wallClockFragmentationRatio,
      fragmentCount: clusterFragments.length,
      fragments: clusterFragments,
      gaps,
      gapBreakdown: {
        breakSeconds,
        otherTaskSeconds,
        unattributedObservedSeconds,
        explainedGapSeconds,
      },
      medianFragmentDurationSeconds: medianFragmentDuration,
      longestFragmentDurationSeconds: longestFragmentDuration,
      interquartileFragmentDurationSeconds: iqrFragmentDuration,
      medianInterveningGapSeconds,
    });
  }

  return episodes;
}
