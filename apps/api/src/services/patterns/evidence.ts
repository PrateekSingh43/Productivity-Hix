/**
 * Backward-compatible re-export shim.
 * Canonical implementation lives in `@repo/analytics` (evidence-assembler.ts)
 * so the PatternWorker can share it without importing from apps/api.
 */
export {
  assembleEvidence,
  compare,
  overlaps,
  stableId,
  timelineFromBlocks,
} from "@repo/analytics";
