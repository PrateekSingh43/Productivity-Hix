import type { TemporalEvidenceBlock } from "@repo/types";
import { getCanonicalContextKey } from "../context-switching/sequence";
import type { EscapeFrictionKind } from "./types";

/**
 * Escape-hatch sequence helpers (pure/deterministic).
 *
 * Purpose: identify friction triggers near a task onset and escape-context
 * activity shortly after, using the same canonical context keys as the
 * context-switching detector (`browser:<domain>` / `app:<name>`).
 *
 * Explicit escape-context list (documented; never guessed):
 * - browser domains whose lowercased host equals, or is a subdomain of,
 *   `youtube.com` or `youtu.be`;
 * - application names whose trimmed lowercase form equals `youtube` (covers a
 *   YouTube app surface if one ever appears in the observation taxonomy —
 *   today the taxonomy carries no phone-app channel, so only the browser
 *   domains fire in practice).
 * Blocks with a missing/null observation or an unlisted domain are excluded.
 *
 * Units: seconds. Assumes block bounds are valid UTC ISO strings.
 *
 * Edge cases: an inter-block gap counts only when its start falls inside the
 * friction-assessment window [taskStart, taskStart + lookback); UNKNOWN
 * coverage overlap counts as INDETERMINATE friction at the block's window
 * start. Escape matches the earliest escape-context block whose start falls
 * in [frictionEnd, frictionEnd + escapeAfter].
 */

export const ESCAPE_DOMAIN_SUFFIXES: readonly string[] = ["youtube.com", "youtu.be"];

export const ESCAPE_APPLICATION_NAMES: readonly string[] = ["youtube"];

export interface FrictionTrigger {
  at: string;
  end: string;
  kind: EscapeFrictionKind;
}

export function escapeKeyFor(block: TemporalEvidenceBlock): string | null {
  const key = getCanonicalContextKey(block);
  if (key === null) return null;
  if (key.startsWith("browser:")) {
    const domain = key.slice("browser:".length).trim().toLowerCase();
    if (!domain) return null;
    if (ESCAPE_DOMAIN_SUFFIXES.some((suffix) => domain === suffix || domain.endsWith(`.${suffix}`))) {
      return key;
    }
    return null;
  }
  if (key.startsWith("app:")) {
    const app = key.slice("app:".length).trim().toLowerCase();
    if ((ESCAPE_APPLICATION_NAMES as readonly string[]).includes(app)) return key;
    return null;
  }
  return null;
}

/** True when the block is recorded escape-context activity. */
export function isEscapeContext(block: TemporalEvidenceBlock): boolean {
  return escapeKeyFor(block) !== null;
}

function sortedOverlapping(
  blocks: TemporalEvidenceBlock[],
  window: { start: string; end: string },
): TemporalEvidenceBlock[] {
  const ws = Date.parse(window.start);
  const we = Date.parse(window.end);
  return blocks
    .filter((block) => Date.parse(block.startTime) < we && Date.parse(block.endTime) > ws)
    .sort((a, b) => {
      if (a.startTime !== b.startTime) return a.startTime < b.startTime ? -1 : 1;
      if (a.endTime !== b.endTime) return a.endTime < b.endTime ? -1 : 1;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
}

/**
 * Finds the earliest friction trigger in the assessment window. Returns null
 * when no gap exceeds the threshold and no INDETERMINATE block overlaps.
 */
export function findFrictionTrigger(
  blocks: TemporalEvidenceBlock[],
  taskStart: string,
  lookbackSeconds: number,
  gapThresholdSeconds: number,
): FrictionTrigger | null {
  const taskStartMs = Date.parse(taskStart);
  if (!Number.isFinite(taskStartMs)) return null;
  const window = {
    start: taskStart,
    end: new Date(taskStartMs + lookbackSeconds * 1000).toISOString(),
  };
  const overlapping = sortedOverlapping(blocks, window);
  const candidates: FrictionTrigger[] = [];
  for (const block of overlapping) {
    if (block.coverage === "UNKNOWN") {
      const atMs = Math.max(Date.parse(block.startTime), taskStartMs);
      candidates.push({
        at: new Date(atMs).toISOString(),
        end: block.endTime,
        kind: "INDETERMINATE",
      });
    }
  }
  for (let i = 1; i < overlapping.length; i++) {
    const prev = overlapping[i - 1]!;
    const next = overlapping[i]!;
    const gapStartMs = Date.parse(prev.endTime);
    const gapEndMs = Date.parse(next.startTime);
    const gapSeconds = (gapEndMs - gapStartMs) / 1000;
    if (
      Number.isFinite(gapSeconds) &&
      gapSeconds > gapThresholdSeconds &&
      gapStartMs >= taskStartMs &&
      gapStartMs < taskStartMs + lookbackSeconds * 1000
    ) {
      candidates.push({
        at: new Date(gapStartMs).toISOString(),
        end: new Date(gapEndMs).toISOString(),
        kind: "GAP",
      });
    }
  }
  candidates.sort((a, b) => {
    if (a.at !== b.at) return a.at < b.at ? -1 : 1;
    return a.end < b.end ? -1 : a.end > b.end ? 1 : 0;
  });
  return candidates[0] ?? null;
}

/**
 * Finds the earliest escape-context block starting within `escapeAfterSeconds`
 * after the friction end. Returns null when none qualifies.
 */
export function findEscapeAfter(
  blocks: TemporalEvidenceBlock[],
  frictionEnd: string,
  escapeAfterSeconds: number,
): { at: string; key: string; blockId: string } | null {
  const endMs = Date.parse(frictionEnd);
  if (!Number.isFinite(endMs)) return null;
  const horizonMs = endMs + escapeAfterSeconds * 1000;
  const matches = blocks
    .filter((block) => {
      const startMs = Date.parse(block.startTime);
      return Number.isFinite(startMs) && startMs >= endMs && startMs <= horizonMs;
    })
    .sort((a, b) => {
      if (a.startTime !== b.startTime) return a.startTime < b.startTime ? -1 : 1;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
  for (const block of matches) {
    const key = escapeKeyFor(block);
    if (key !== null) return { at: block.startTime, key, blockId: block.id };
  }
  return null;
}
