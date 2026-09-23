import type {
  CanonicalMachineState,
  MachineUnavailableReason,
  MachineAvailabilityEvidence,
  ExpectedRestWindow,
} from "@repo/types";
import { resolveLocalDayInterval, localDateTimeToUtc } from "@repo/types";

/**
 * Classifies machine state strictly from authoritative telemetry.
 *
 * CRITICAL DOMAIN INVARIANTS:
 * - If no explicit machine-state producer exists: UNKNOWN is the only epistemically valid state.
 * - Long silence is NOT sleep.
 * - Long inactivity/AFK is NOT sleep or power-off.
 * - Missing heartbeat is NOT sleep or power-off.
 * - Absence of input is NOT proof of absence.
 * - UNAVAILABLE (with reason SLEEP, HIBERNATION, POWER_OFF, LOCKED) may ONLY be declared
 *   when an authoritative producer (e.g. OS power event from Rust agent or collector lifecycle)
 *   explicitly recorded it.
 */
export function classifyMachineState(
  evidence?: MachineAvailabilityEvidence | null
): { state: CanonicalMachineState; reason?: MachineUnavailableReason } {
  if (!evidence) {
    return { state: "UNKNOWN" };
  }
  return {
    state: evidence.state,
    reason: evidence.reason,
  };
}

/**
 * Evaluates observed activity against a user-authored ExpectedRestWindow.
 *
 * CRITICAL DOMAIN INVARIANTS:
 * - ExpectedRestWindow is user-authored routine context only.
 * - It is NOT machine availability.
 * - It is NOT sleep detection.
 * - It is NOT AFK or silence.
 * - It is NOT a productivity judgment or penalty.
 * - Observed activity occurring during expected rest remains ordinary OBSERVED_ACTIVITY.
 * - Machine unavailability during expected rest does NOT imply verified sleep.
 */
export interface RestWindowEvaluationResult {
  isWithinExpectedRest: boolean;
  activityClassification: "OBSERVED_ACTIVITY";
  routineContextLabel: string;
}

export function evaluateActivityAgainstExpectedRest(params: {
  activityStart: Date | string | number;
  activityEnd: Date | string | number;
  restWindow?: ExpectedRestWindow | null;
  timezone?: string;
}): RestWindowEvaluationResult {
  const start = params.activityStart instanceof Date ? params.activityStart : new Date(params.activityStart);
  const end = params.activityEnd instanceof Date ? params.activityEnd : new Date(params.activityEnd);
  const timezone = params.timezone ?? "UTC";
  const restWindow = params.restWindow;

  if (!restWindow || !restWindow.isEnabled) {
    return {
      isWithinExpectedRest: false,
      activityClassification: "OBSERVED_ACTIVITY",
      routineContextLabel: "STANDARD_ROUTINE",
    };
  }

  // Resolve local calendar day of the activity
  const dayIv = resolveLocalDayInterval(start, { timezone });
  const [y, m, d] = dayIv.localDate.split("-").map(Number);

  const [startH, startMin] = restWindow.startLocalTime.split(":").map(Number);
  const [endH, endMin] = restWindow.endLocalTime.split(":").map(Number);

  // If startLocalTime > endLocalTime (e.g. 23:00 to 07:00), window spans overnight:
  if (startH > endH || (startH === endH && startMin > endMin)) {
    const todayRestStart = localDateTimeToUtc(y, m, d, startH, startMin, 0, timezone);
    const tomorrowCal = new Date(Date.UTC(y, m - 1, d + 1));
    const tomorrowRestEnd = localDateTimeToUtc(
      tomorrowCal.getUTCFullYear(),
      tomorrowCal.getUTCMonth() + 1,
      tomorrowCal.getUTCDate(),
      endH,
      endMin,
      0,
      timezone
    );

    const yesterdayCal = new Date(Date.UTC(y, m - 1, d - 1));
    const yesterdayRestStart = localDateTimeToUtc(
      yesterdayCal.getUTCFullYear(),
      yesterdayCal.getUTCMonth() + 1,
      yesterdayCal.getUTCDate(),
      startH,
      startMin,
      0,
      timezone
    );
    const todayRestEnd = localDateTimeToUtc(y, m, d, endH, endMin, 0, timezone);

    // Half-open interval overlap check
    const overlapsTodayNight = start < tomorrowRestEnd && end > todayRestStart;
    const overlapsMorning = start < todayRestEnd && end > yesterdayRestStart;
    const isWithin = overlapsTodayNight || overlapsMorning;

    return {
      isWithinExpectedRest: isWithin,
      activityClassification: "OBSERVED_ACTIVITY",
      routineContextLabel: isWithin ? "EXPECTED_REST_WINDOW_OVERLAP" : "STANDARD_ROUTINE",
    };
  } else {
    const restStartUtc = localDateTimeToUtc(y, m, d, startH, startMin, 0, timezone);
    const restEndUtc = localDateTimeToUtc(y, m, d, endH, endMin, 0, timezone);
    const isWithin = start < restEndUtc && end > restStartUtc;

    return {
      isWithinExpectedRest: isWithin,
      activityClassification: "OBSERVED_ACTIVITY",
      routineContextLabel: isWithin ? "EXPECTED_REST_WINDOW_OVERLAP" : "STANDARD_ROUTINE",
    };
  }
}
