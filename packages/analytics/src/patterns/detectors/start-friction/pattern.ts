import type { BehavioralPatternOutput, PatternExecutionStatus } from "@repo/types";
import type { PatternLevelExecutionContext } from "../../base/context";
import { createPatternResult } from "../../base/detector";
import { iqr, median, recurrenceFraction } from "../../baseline/statistics";
import { safeDivide } from "../../shared/math";
import { countDistinctCalendarDays } from "../../qualification/temporal";
import type { TaskScheduleInstance } from "../schedule-variance/types";
import { calculateStartLatency, resolveFirstWorkStart } from "./sequence";
import type { StartFrictionConfig, StartFrictionPatternMetrics } from "./types";

function calculateMean(values: number[]): number | null {
  if (values.length === 0) return null;
  return safeDivide(values.reduce((sum, value) => sum + value, 0), values.length);
}

/**
 * Evaluates recurring start-friction across planned tasks (Tier 2 pattern).
 *
 * Purpose: decide whether first recorded work recurrently begins later than
 * the authoritative planned start. Median latency sets the contrast;
 * directional share (LATE onsets / observed onsets) sets recurrence.
 *
 * Units: seconds for latencies; frictionShare is a fraction in [0, 1].
 * Assumes instances carry authoritative plannedStart values (never inferred)
 * and linked sessions as onset evidence.
 *
 * Edge cases: below-minimum populations report INSUFFICIENT_EVIDENCE.
 * DETECTED requires BOTH a late directional share at or above
 * frictionShareThreshold AND a median latency strictly beyond the on-time
 * tolerance (a bare majority of 1-second delays is not friction). The
 * baseline strategy is NONE: the reference is the declared intention itself,
 * so no own-history maturity gate applies. deltaRatio stays null (signed
 * latency, mirroring D4).
 */
export function evaluateStartFrictionPattern(
  context: PatternLevelExecutionContext,
  evaluationId: string,
  patternId: string,
  taskInstances: TaskScheduleInstance[],
  config: StartFrictionConfig,
): BehavioralPatternOutput<StartFrictionPatternMetrics> {
  const sorted = [...taskInstances].sort((a, b) => {
    if (!a.plannedStart && !b.plannedStart) return a.taskId.localeCompare(b.taskId);
    if (!a.plannedStart) return 1;
    if (!b.plannedStart) return -1;
    const aMs = Date.parse(a.plannedStart);
    const bMs = Date.parse(b.plannedStart);
    if (aMs !== bMs) return aMs - bMs;
    return a.taskId.localeCompare(b.taskId);
  });

  let frictionTaskCount = 0;
  let punctualTaskCount = 0;
  let notObservedTaskCount = 0;
  let unplannedTaskCount = 0;
  const observedLatencies: number[] = [];
  const observedPlannedDates: string[] = [];
  const contributingTaskIds: string[] = [];
  const contributingSessionIds: string[] = [];
  let totalObservedActiveSeconds = 0;
  const epistemicCaveats: string[] = [];

  for (const instance of sorted) {
    if (!instance.plannedStart) {
      unplannedTaskCount++;
      continue;
    }
    const actualStart = resolveFirstWorkStart(instance);
    const metrics = calculateStartLatency(
      instance.taskId,
      instance.plannedStart,
      actualStart,
      config.onTimeToleranceSeconds,
      instance.plannedCapturedAt ?? null,
    );
    if (metrics.status !== "OBSERVED") {
      if (metrics.status === "INTEGRITY_ERROR") {
        epistemicCaveats.push(`INTEGRITY_ERROR_CORRUPT_TIMESTAMPS:${instance.taskId}`);
      } else {
        notObservedTaskCount++;
      }
      continue;
    }
    contributingTaskIds.push(instance.taskId);
    const firstSession = instance.sessions
      .filter((session) => session.startedAt === metrics.actualStart)
      .map((session) => session.id)
      .sort()[0];
    if (firstSession) contributingSessionIds.push(firstSession);
    observedLatencies.push(metrics.latencySeconds!);
    observedPlannedDates.push(instance.plannedStart);
    for (const session of instance.sessions) {
      if (typeof session.durationSeconds === "number" && session.durationSeconds > 0) {
        totalObservedActiveSeconds += session.durationSeconds;
      } else if (session.startedAt && session.endedAt) {
        const dur = (Date.parse(session.endedAt) - Date.parse(session.startedAt)) / 1000;
        if (dur > 0) totalObservedActiveSeconds += dur;
      }
    }
    if (metrics.classification === "LATE") frictionTaskCount++;
    else punctualTaskCount++;
  }

  const observedTaskCount = frictionTaskCount + punctualTaskCount;
  const frictionShare = recurrenceFraction(frictionTaskCount, observedTaskCount);
  const medianLatencySeconds = observedLatencies.length ? median(observedLatencies) : null;
  const distinctDays = countDistinctCalendarDays(observedPlannedDates, context.timezone);

  let executionStatus: PatternExecutionStatus = "NO_PATTERN";
  const sufficient =
    observedTaskCount >= config.minimumQualifyingTaskInstances &&
    distinctDays >= config.minimumDistinctCalendarDays;
  if (!sufficient) {
    executionStatus = "INSUFFICIENT_EVIDENCE";
    epistemicCaveats.push("INSUFFICIENT_QUALIFYING_PLANNED_TASKS");
  } else if (
    frictionShare !== null &&
    frictionShare >= config.frictionShareThreshold &&
    medianLatencySeconds !== null &&
    medianLatencySeconds > config.onTimeToleranceSeconds
  ) {
    executionStatus = "DETECTED";
  } else {
    executionStatus = "NO_PATTERN";
  }

  return createPatternResult<StartFrictionPatternMetrics>(
    context,
    evaluationId,
    patternId,
    executionStatus,
    {
      patternType: "start_friction",
      taxonomy: "execution_friction",
      temporalWindow: {
        start: context.timeline.windowStart,
        end: context.timeline.windowEnd,
        scale: "14_DAY",
      },
      sample: {
        qualifyingDays: distinctDays,
        qualifyingEpisodes: observedTaskCount,
        totalObservedHours: totalObservedActiveSeconds / 3600,
        meanCoverageRatio: 1.0,
      },
      baseline: {
        strategy: "NONE",
        comparedMetric: "latencySeconds",
        baselineValue: null,
        currentValue: medianLatencySeconds,
        deltaRatio: null,
        comparisonStatus: "NOT_APPLICABLE",
      },
      metrics: {
        medianLatencySeconds,
        iqrLatencySeconds: observedLatencies.length ? iqr(observedLatencies) : null,
        meanLatencySeconds: calculateMean(observedLatencies),
        frictionShare,
        frictionTaskCount,
        punctualTaskCount,
        notObservedTaskCount,
        unplannedTaskCount,
        totalTaskCount: taskInstances.length,
        observedTaskCount,
      },
      reliability: {
        tier: "PROVISIONAL",
        calibrationStatus: "UNVALIDATED_PROTOTYPE",
        evidenceQualityFactors: {
          qualifyingDayCount: distinctDays,
          qualifyingEpisodeCount: observedTaskCount,
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
    },
  );
}
