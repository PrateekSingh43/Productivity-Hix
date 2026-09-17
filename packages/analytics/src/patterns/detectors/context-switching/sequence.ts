import type { TemporalEvidenceBlock } from "@repo/types";

import type { ContextSwitchEvidence } from "./types";

export interface ContextSequenceResult {
  switches: ContextSwitchEvidence[];
  switchCount: number;
  dwellDurations: number[];
  qualifyingObservedActiveDurationSeconds: number;
}

export function parseContextSequence(blocks: TemporalEvidenceBlock[]): ContextSequenceResult {
  const sortedBlocks = [...blocks].sort((a, b) => {
    if (a.startTime !== b.startTime) return a.startTime < b.startTime ? -1 : 1;
    if (a.endTime !== b.endTime) return a.endTime < b.endTime ? -1 : 1;
    if (a.id !== b.id) return a.id < b.id ? -1 : 1;
    return 0;
  });

  const switches: ContextSwitchEvidence[] = [];
  let switchCount = 0;
  const dwells: number[] = [];
  let qualifyingObservedActiveDurationSeconds = 0;
  
  let currentKey: string | null = null;
  let currentDwellDuration = 0;
  
  for (const block of sortedBlocks) {
    if (block.coverage === "UNKNOWN" || block.observation?.isAfk === true || block.observation?.category === "break") {
      // Interruption boundary: terminal dwell finalized, sequence interrupted
      if (currentKey !== null) {
        dwells.push(currentDwellDuration);
        currentKey = null;
        currentDwellDuration = 0;
      }
      continue;
    }
    
    // Only OBSERVED or OBSERVED_REPORTED count for context density
    if (block.coverage !== "OBSERVED" && block.coverage !== "OBSERVED_REPORTED") {
      // Other gap types (REPORTED, EXPLAINED_GAP) are effectively unmonitored intervals
      // for the purpose of physical context switching (no physical observation exists).
      // They act as sequence boundaries exactly like UNKNOWN.
      if (currentKey !== null) {
        dwells.push(currentDwellDuration);
        currentKey = null;
        currentDwellDuration = 0;
      }
      continue;
    }
    
    // Extract canonical key
    const canonicalKey = getCanonicalContextKey(block);
    
    if (canonicalKey === null) {
      // Missing context boundary
      if (currentKey !== null) {
        dwells.push(currentDwellDuration);
        currentKey = null;
        currentDwellDuration = 0;
      }
      continue;
    }
    
    // Valid context and valid coverage
    qualifyingObservedActiveDurationSeconds += block.durationSeconds;
    
    if (currentKey === null) {
      // Start a new sequence
      currentKey = canonicalKey;
      currentDwellDuration = block.durationSeconds;
    } else if (currentKey === canonicalKey) {
      // Extend current sequence
      currentDwellDuration += block.durationSeconds;
    } else {
      // Switch boundary
      switchCount++;
      switches.push({
        key: canonicalKey,
        fromKey: currentKey,
        timestamp: block.startTime,
        dwellSeconds: currentDwellDuration,
        blockId: block.id,
        ...(block.intention?.linkType === "EXPLICIT" && block.intention.taskId ? { taskId: block.intention.taskId } : {}),
      });
      dwells.push(currentDwellDuration);
      currentKey = canonicalKey;
      currentDwellDuration = block.durationSeconds;
    }
  }
  
  // Terminal dwell inclusion
  if (currentKey !== null) {
    dwells.push(currentDwellDuration);
  }
  
  return {
    switches,
    switchCount,
    dwellDurations: dwells,
    qualifyingObservedActiveDurationSeconds
  };
}

export function getCanonicalContextKey(block: TemporalEvidenceBlock): string | null {
  const obs = block.observation;
  if (!obs) return null;
  
  if (obs.category === "browser" && obs.domain) {
    return `browser:${obs.domain}`;
  }
  if (obs.application) {
    return `app:${obs.application}`;
  }
  return null;
}
