import type { TemporalEvidenceBlock } from "@repo/types";

export interface ContextSequenceResult {
  switchCount: number;
  dwellDurations: number[];
  qualifyingObservedActiveDurationSeconds: number;
}

export function parseContextSequence(blocks: TemporalEvidenceBlock[]): ContextSequenceResult {
  let switchCount = 0;
  const dwells: number[] = [];
  let qualifyingObservedActiveDurationSeconds = 0;
  
  let currentKey: string | null = null;
  let currentDwellDuration = 0;
  
  for (const block of blocks) {
    if (block.coverage === "UNKNOWN") {
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
