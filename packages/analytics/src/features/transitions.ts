import type { NormalizedActivityEvent, TimelineCategory, TimelineSegment } from "@repo/types";
import { normalizeToIntervals } from "./session";

export interface CategoryTransition {
  fromCategory: TimelineCategory;
  toCategory: TimelineCategory;
  count: number;
  durationBeforeTransition: number;
  durationAfterTransition: number;
}

export interface TransitionSummary {
  transitions: CategoryTransition[];
  totalTransitions: number;
  productiveTransitions: number;
  distractionTransitions: number;
}

/**
 * Extracts consecutive category transition features for an ordered sequence of activity intervals.
 */
export function extractTransitionFeatures(
  eventsOrSegments: NormalizedActivityEvent[] | TimelineSegment[],
  windowStartMs = -Infinity,
  windowEndMs = Infinity,
): TransitionSummary {
  const intervals = normalizeToIntervals(eventsOrSegments, windowStartMs, windowEndMs);

  // Active intervals (excluding break intervals so work-to-work transitions are primary)
  const activeIntervals = intervals.filter((i) => i.category !== "break");

  if (activeIntervals.length <= 1) {
    return {
      transitions: [],
      totalTransitions: 0,
      productiveTransitions: 0,
      distractionTransitions: 0,
    };
  }

  const transitionMap = new Map<string, CategoryTransition>();
  let totalTransitions = 0;
  let productiveTransitions = 0;
  let distractionTransitions = 0;

  for (let i = 1; i < activeIntervals.length; i++) {
    const prev = activeIntervals[i - 1]!;
    const curr = activeIntervals[i]!;

    if (prev.category === curr.category) {
      continue;
    }

    const key = `${prev.category}->${curr.category}`;
    const existing = transitionMap.get(key) ?? {
      fromCategory: prev.category,
      toCategory: curr.category,
      count: 0,
      durationBeforeTransition: 0,
      durationAfterTransition: 0,
    };

    existing.count += 1;
    existing.durationBeforeTransition += prev.durationSeconds;
    existing.durationAfterTransition += curr.durationSeconds;
    transitionMap.set(key, existing);

    totalTransitions += 1;
    if (curr.category === "focused") {
      productiveTransitions += 1;
    }
    if (curr.category === "leisure") {
      distractionTransitions += 1;
    }
  }

  return {
    transitions: Array.from(transitionMap.values()),
    totalTransitions,
    productiveTransitions,
    distractionTransitions,
  };
}
