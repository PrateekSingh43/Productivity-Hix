import type { PatternLevelExecutionContext } from "../../base/context";
import { createPatternResult } from "../../base/detector";
import type {
  BehavioralPatternOutput,
  PatternExecutionStatus,
} from "@repo/types";
import type {
  ScheduleVarianceConfig,
  ScheduleVariancePatternMetrics,
  TaskScheduleInstance,
} from "./types";
import { resolveActualStart, calculateScheduleVariance } from "./sequence";
import { median, iqr } from "../../baseline/statistics";
import { safeDivide } from "../../shared/math";
import { countDistinctCalendarDays } from "../../qualification/temporal";

/**
 * Computes arithmetic mean safely.
 */
function calculateMean(values: number[]): number | null {
  if (values.length === 0) return null;
  const sum = values.reduce((acc, v) => acc + v, 0);
  return safeDivide(sum, values.length);
}

/**
 * Evaluates the recurring Schedule Variance pattern across a population of tasks.
 * 
 * Strict Invariants:
 * - Deterministic: tasks canonically sorted before evaluation.
 * - Missing plannedStart tasks are strictly excluded from the observed start denominator.
 * - Non-delayed execution counts punctual starts (early + on-time).
 * - Relative deltaRatio is strictly prohibited on signed schedule variance.
 * - No invented evidence or thresholds.
 */
export function evaluateScheduleVariancePattern(
  context: PatternLevelExecutionContext,
  evaluationId: string,
  patternId: string,
  taskInstances: TaskScheduleInstance[],
  config: ScheduleVarianceConfig
): BehavioralPatternOutput<ScheduleVariancePatternMetrics> {
  // 1. Canonical sort: primary plannedStart ASC (nulls last), secondary taskId ASC
  const sortedInstances = [...taskInstances].sort((a, b) => {
    if (!a.plannedStart && !b.plannedStart) {
      return a.taskId.localeCompare(b.taskId);
    }
    if (!a.plannedStart) return 1;
    if (!b.plannedStart) return -1;
    const aMs = Date.parse(a.plannedStart);
    const bMs = Date.parse(b.plannedStart);
    if (aMs !== bMs) return aMs - bMs;
    return a.taskId.localeCompare(b.taskId);
  });

  let punctualStartTaskCount = 0;
  let delayedStartTaskCount = 0;
  let notObservedTaskCount = 0;
  let indeterminateStartTaskCount = 0;
  let unplannedTaskCount = 0;

  let earlyTaskCount = 0;
  let onTimeTaskCount = 0;
  let lateTaskCount = 0;

  const observedStartDeltas: number[] = [];
  const observedPlannedDates: string[] = [];
  const contributingTaskIds: string[] = [];
  const contributingSessionIds: string[] = [];

  let totalObservedActiveSeconds = 0;

  // 2. Classify each task into mutually exclusive populations
  for (const instance of sortedInstances) {
    if (!instance.plannedStart) {
      unplannedTaskCount++;
      continue;
    }

    const resolved = resolveActualStart(instance.sessions);
    const metrics = calculateScheduleVariance(
      instance.taskId,
      instance.plannedStart,
      resolved?.actualStart ?? null,
      config.onTimeToleranceSeconds,
      instance.plannedDurationMinutes
    );

    if (metrics.status === "INDETERMINATE_COVERAGE") {
      indeterminateStartTaskCount++;
    } else if (metrics.status === "NOT_OBSERVED") {
      notObservedTaskCount++;
    } else if (metrics.status === "OBSERVED") {
      contributingTaskIds.push(instance.taskId);
      if (resolved?.sessionId) {
        contributingSessionIds.push(resolved.sessionId);
      }

      observedStartDeltas.push(metrics.startDeltaSeconds!);
      observedPlannedDates.push(instance.plannedStart);

      // Tally active seconds from sessions
      for (const s of instance.sessions) {
        if (s.durationSeconds && s.durationSeconds > 0) {
          totalObservedActiveSeconds += s.durationSeconds;
        } else if (s.startedAt && s.endedAt) {
          const dur = (Date.parse(s.endedAt) - Date.parse(s.startedAt)) / 1000;
          if (dur > 0) totalObservedActiveSeconds += dur;
        }
      }

      if (metrics.classification === "EARLY") {
        earlyTaskCount++;
        punctualStartTaskCount++;
      } else if (metrics.classification === "ON_TIME") {
        onTimeTaskCount++;
        punctualStartTaskCount++;
      } else if (metrics.classification === "LATE") {
        lateTaskCount++;
        delayedStartTaskCount++;
      }
    }
  }

  // 3. Denominator Rule:
  // observedStartTaskCount is strictly the population of observed qualifying scheduled tasks.
  // Missing plannedStart and unobserved tasks MUST NOT be in the denominator!
  const observedStartTaskCount = punctualStartTaskCount + delayedStartTaskCount;
  const totalTaskCount = taskInstances.length;

  const lateTaskFraction = safeDivide(delayedStartTaskCount, observedStartTaskCount);
  const earlyTaskFraction = safeDivide(earlyTaskCount, observedStartTaskCount);
  const onTimeTaskFraction = safeDivide(onTimeTaskCount, observedStartTaskCount);

  const medianStartDeltaSeconds =
    observedStartDeltas.length > 0 ? median(observedStartDeltas) : null;
  const iqrStartDeltaSeconds =
    observedStartDeltas.length > 0 ? iqr(observedStartDeltas) : null;
  const meanStartDeltaSeconds =
    observedStartDeltas.length > 0 ? calculateMean(observedStartDeltas) : null;

  const distinctDays = countDistinctCalendarDays(observedPlannedDates, context.timezone);

  // 4. Qualification & Pattern Decision
  let executionStatus: PatternExecutionStatus = "NO_PATTERN";
  const epistemicCaveats: string[] = [];

  const isSufficientEvidence =
    observedStartTaskCount >= config.minimumQualifyingTaskInstances &&
    distinctDays >= config.minimumDistinctCalendarDays;

  if (!isSufficientEvidence) {
    executionStatus = "INSUFFICIENT_EVIDENCE";
    epistemicCaveats.push("INSUFFICIENT_QUALIFYING_SCHEDULED_TASKS");
  } else if (
    lateTaskFraction !== null &&
    lateTaskFraction >= config.delayedStartFractionThreshold
  ) {
    executionStatus = "DETECTED";
  } else {
    executionStatus = "NO_PATTERN";
  }

  const patternMetrics: ScheduleVariancePatternMetrics = {
    medianStartDeltaSeconds,
    iqrStartDeltaSeconds,
    meanStartDeltaSeconds,
    lateTaskFraction,
    earlyTaskFraction,
    onTimeTaskFraction,
    punctualStartTaskCount,
    delayedStartTaskCount,
    notObservedTaskCount,
    indeterminateStartTaskCount,
    unplannedTaskCount,
    totalTaskCount,
    observedStartTaskCount,
  };

  return createPatternResult<ScheduleVariancePatternMetrics>(
    context,
    evaluationId,
    patternId,
    executionStatus,
    {
      patternType: "schedule_variance",
      taxonomy: "schedule_fidelity",
      temporalWindow: {
        start: context.timeline.windowStart,
        end: context.timeline.windowEnd,
        scale: "14_DAY",
      },
      sample: {
        qualifyingDays: distinctDays,
        qualifyingEpisodes: observedStartTaskCount,
        totalObservedHours: totalObservedActiveSeconds / 3600,
        meanCoverageRatio: 1.0,
      },
      baseline: {
        strategy: "NONE",
        comparedMetric: "startDeltaSeconds",
        baselineValue: null,
        currentValue: medianStartDeltaSeconds,
        deltaRatio: null, // Strictly null on signed deviation
        comparisonStatus: "NOT_APPLICABLE",
      },
      metrics: patternMetrics,
      reliability: {
        tier: "PROVISIONAL",
        calibrationStatus: "UNVALIDATED_PROTOTYPE",
        evidenceQualityFactors: {
          qualifyingDayCount: distinctDays,
          qualifyingEpisodeCount: observedStartTaskCount,
          meanTelemetryCoverageRatio: 1.0,
          temporalVariability: null,
          baselineMaturityDays: 0,
          hasCorroboratingSelfReport: false,
        },
      },
      evidenceReferences: {
        contributingTaskIds: contributingTaskIds.sort(),
        contributingSessionIds: contributingSessionIds.sort(),
        sampleBoundingWindows: [
          { start: context.timeline.windowStart, end: context.timeline.windowEnd },
        ],
      },
      epistemicCaveats,
    }
  );
}
