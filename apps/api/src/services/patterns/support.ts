/**
 * Backward-compatible re-export shim.
 * Canonical detector configuration lives in `@repo/analytics` (pipeline.ts).
 */
export {
  contextConfig,
  continuousConfig,
  continuousThresholds,
  episodeContext,
  fragmentationConfig,
  patternContext,
  scheduleConfig,
} from "@repo/analytics";
export { executionContext } from "@repo/analytics";
