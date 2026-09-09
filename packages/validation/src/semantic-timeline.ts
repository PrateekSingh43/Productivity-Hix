import { createHash } from 'node:crypto';
import type {
  TargetScope,
  ActivityModality,
  ClaimType,
  ClaimProvenance,
  ClaimAuthority,
  ContextRelevance,
  IntentionRelationship,
  FocusEvidenceState,
  TrackType,
  CoverageState,
  ReconciliationState,
  SourceChannel,
  MachinePowerState,
  CollectorState,
  InputState,
} from '@repo/types';

// Helper to reliably convert Date | string | number to epoch milliseconds
export function toEpochMs(val: Date | string | number): number {
  if (val instanceof Date) return val.getTime();
  if (typeof val === 'number') return val;
  const parsed = new Date(val).getTime();
  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid date/time value: ${val}`);
  }
  return parsed;
}

// ============================================================================
// 1. Temporal Arithmetic Invariants
// ============================================================================

export interface TemporalDurations {
  wallClockDurationMs: number;
  observedActiveDurationMs: number;
  pausedDurationMs: number;
}

export function validateTemporalDurations(durations: TemporalDurations): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  const { wallClockDurationMs, observedActiveDurationMs, pausedDurationMs } = durations;

  if (wallClockDurationMs < 0) {
    errors.push(`wallClockDurationMs (${wallClockDurationMs}) cannot be negative`);
  }
  if (observedActiveDurationMs < 0) {
    errors.push(`observedActiveDurationMs (${observedActiveDurationMs}) cannot be negative`);
  }
  if (pausedDurationMs < 0) {
    errors.push(`pausedDurationMs (${pausedDurationMs}) cannot be negative`);
  }
  if (observedActiveDurationMs > wallClockDurationMs) {
    errors.push(
      `observedActiveDurationMs (${observedActiveDurationMs}) exceeds wallClockDurationMs (${wallClockDurationMs})`
    );
  }
  const expectedPaused = wallClockDurationMs - observedActiveDurationMs;
  if (pausedDurationMs !== expectedPaused) {
    errors.push(
      `pausedDurationMs (${pausedDurationMs}) must exactly equal wallClockDurationMs - observedActiveDurationMs (${expectedPaused})`
    );
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

// ============================================================================
// 2. Contribution Interval & Containment Invariants
// ============================================================================

export interface ContributionInterval {
  contributionStart: Date | string | number;
  contributionEnd: Date | string | number;
  contributionDurationMs: number;
}

export interface ContainmentBounds {
  sourceActivity?: {
    start: Date | string | number;
    end: Date | string | number;
  };
  temporalBlock?: {
    startTime: Date | string | number;
    endTime: Date | string | number;
  };
}

export function validateContributionInterval(
  contribution: ContributionInterval,
  bounds?: ContainmentBounds
): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  const startMs = toEpochMs(contribution.contributionStart);
  const endMs = toEpochMs(contribution.contributionEnd);

  if (startMs >= endMs) {
    errors.push(`contributionStart (${startMs}) must be strictly less than contributionEnd (${endMs})`);
  }

  if (contribution.contributionDurationMs < 0) {
    errors.push(`contributionDurationMs (${contribution.contributionDurationMs}) cannot be negative`);
  }

  const expectedDuration = endMs - startMs;
  if (contribution.contributionDurationMs !== expectedDuration) {
    errors.push(
      `contributionDurationMs (${contribution.contributionDurationMs}) must equal end - start (${expectedDuration})`
    );
  }

  if (bounds?.sourceActivity) {
    const actStart = toEpochMs(bounds.sourceActivity.start);
    const actEnd = toEpochMs(bounds.sourceActivity.end);
    if (startMs < actStart || endMs > actEnd) {
      errors.push(
        `Contribution [${startMs}, ${endMs}] is outside source activity interval [${actStart}, ${actEnd}]`
      );
    }
  }

  if (bounds?.temporalBlock) {
    const blockStart = toEpochMs(bounds.temporalBlock.startTime);
    const blockEnd = toEpochMs(bounds.temporalBlock.endTime);
    if (startMs < blockStart || endMs > blockEnd) {
      errors.push(
        `Contribution [${startMs}, ${endMs}] is outside temporal block interval [${blockStart}, ${blockEnd}]`
      );
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

// ============================================================================
// 3. TargetScope Formal Entity Mapping Invariants
// ============================================================================

export interface TargetScopeAssociation {
  targetScope: TargetScope;
  taskId?: string | null;
  goalId?: string | null;
  projectTag?: string | null;
}

export function validateTargetScope(assoc: TargetScopeAssociation): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  const hasTask = assoc.taskId !== null && assoc.taskId !== undefined && assoc.taskId.trim() !== '';
  const hasGoal = assoc.goalId !== null && assoc.goalId !== undefined && assoc.goalId.trim() !== '';
  const hasProject = assoc.projectTag !== null && assoc.projectTag !== undefined && assoc.projectTag.trim() !== '';

  switch (assoc.targetScope) {
    case 'TASK':
      if (!hasTask) {
        errors.push("TargetScope 'TASK' requires taskId to be non-null");
      }
      // goalId and projectTag are allowed
      break;

    case 'GOAL':
      if (!hasGoal) {
        errors.push("TargetScope 'GOAL' requires goalId to be non-null");
      }
      if (hasTask) {
        errors.push("TargetScope 'GOAL' requires taskId to be null");
      }
      break;

    case 'PROJECT':
      if (!hasProject) {
        errors.push("TargetScope 'PROJECT' requires projectTag to be non-null");
      }
      if (hasTask) {
        errors.push("TargetScope 'PROJECT' requires taskId to be null");
      }
      if (hasGoal) {
        errors.push("TargetScope 'PROJECT' requires goalId to be null");
      }
      break;

    case 'GENERAL_WORK':
      if (hasTask) {
        errors.push("TargetScope 'GENERAL_WORK' requires taskId to be null");
      }
      if (hasGoal) {
        errors.push("TargetScope 'GENERAL_WORK' requires goalId to be null");
      }
      if (hasProject) {
        errors.push("TargetScope 'GENERAL_WORK' requires projectTag to be null");
      }
      break;

    case 'UNLINKED':
      if (hasTask) {
        errors.push("TargetScope 'UNLINKED' requires taskId to be null");
      }
      if (hasGoal) {
        errors.push("TargetScope 'UNLINKED' requires goalId to be null");
      }
      if (hasProject) {
        errors.push("TargetScope 'UNLINKED' requires projectTag to be null");
      }
      break;

    default:
      errors.push(`Unknown TargetScope: ${assoc.targetScope as string}`);
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

// ============================================================================
// 4. Tenant Boundary Invariants
// ============================================================================

export interface TenantAssociation {
  primaryUserId: string;
  associatedEntityUserId?: string | null;
  entityName: string;
}

export function validateTenantBoundary(assoc: TenantAssociation): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  if (
    assoc.associatedEntityUserId !== null &&
    assoc.associatedEntityUserId !== undefined &&
    assoc.associatedEntityUserId !== assoc.primaryUserId
  ) {
    errors.push(
      `Tenant boundary violation: ${assoc.entityName} userId (${assoc.associatedEntityUserId}) does not match primary userId (${assoc.primaryUserId})`
    );
  }
  return {
    isValid: errors.length === 0,
    errors,
  };
}

// ============================================================================
// 5. Gap Explanation Invariants (1:N Sub-intervals)
// ============================================================================

export interface GapInterval {
  startTime: Date | string | number;
  endTime: Date | string | number;
}

export interface GapExplanationInterval {
  startTime: Date | string | number;
  endTime: Date | string | number;
}

export function validateGapExplanation(
  explanation: GapExplanationInterval,
  gap: GapInterval
): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  const expStart = toEpochMs(explanation.startTime);
  const expEnd = toEpochMs(explanation.endTime);
  const gapStart = toEpochMs(gap.startTime);
  const gapEnd = toEpochMs(gap.endTime);

  if (expStart >= expEnd) {
    errors.push(
      `UserGapExplanation start_time (${expStart}) must be strictly less than end_time (${expEnd})`
    );
  }

  if (expStart < gapStart || expEnd > gapEnd) {
    errors.push(
      `UserGapExplanation [${expStart}, ${expEnd}] must be contained within TelemetryCoverageGap [${gapStart}, ${gapEnd}]`
    );
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

// ============================================================================
// 6. ClaimEvidence Target Invariant (num_nonnulls = 1)
// ============================================================================

export interface ClaimEvidenceTargets {
  claimId?: string | null;
  linkId?: string | null;
  inferenceId?: string | null;
}

export function validateClaimEvidenceTarget(targets: ClaimEvidenceTargets): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  const count = [
    targets.claimId !== null && targets.claimId !== undefined,
    targets.linkId !== null && targets.linkId !== undefined,
    targets.inferenceId !== null && targets.inferenceId !== undefined,
  ].filter(Boolean).length;

  if (count !== 1) {
    errors.push(
      `ClaimEvidence must reference exactly one target (claimId, linkId, or inferenceId). Received non-null count: ${count}`
    );
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

// ============================================================================
// 7. Confidence Calibration Invariant (null OR 0.0 <= c <= 1.0)
// ============================================================================

export function validateConfidence(confidence: number | null | undefined): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  if (confidence !== null && confidence !== undefined) {
    if (typeof confidence !== 'number' || Number.isNaN(confidence)) {
      errors.push(`Confidence must be a valid number or null. Received: ${confidence}`);
    } else if (confidence < 0.0 || confidence > 1.0) {
      errors.push(`Confidence must be between 0.0 and 1.0 inclusive. Received: ${confidence}`);
    }
  }
  return {
    isValid: errors.length === 0,
    errors,
  };
}

// ============================================================================
// 8. Observation Set Fingerprint (Deterministic Identity Hash)
// SHA256(userId | deviceId | sorted(activityId | startMs | endMs))
// ============================================================================

export interface ObservationContribution {
  activityId: string;
  contributionStart: Date | string | number;
  contributionEnd: Date | string | number;
}

export interface FingerprintInput {
  userId: string;
  deviceId?: string | null;
  observations: ObservationContribution[];
}

export function computeObservationSetFingerprint(input: FingerprintInput): string {
  const { userId, deviceId, observations } = input;

  // 1. Sort observations deterministically by activityId, then start, then end
  const normalizedObservations = observations.map((obs) => ({
    activityId: obs.activityId,
    startMs: toEpochMs(obs.contributionStart),
    endMs: toEpochMs(obs.contributionEnd),
  }));

  normalizedObservations.sort((a, b) => {
    if (a.activityId !== b.activityId) {
      return a.activityId.localeCompare(b.activityId);
    }
    if (a.startMs !== b.startMs) {
      return a.startMs - b.startMs;
    }
    return a.endMs - b.endMs;
  });

  // 2. Format sorted contributions: activityId|startMs|endMs
  const obsStrings = normalizedObservations.map(
    (o) => `${o.activityId}:${o.startMs}:${o.endMs}`
  );

  // 3. Construct canonical serialization: userId|deviceId|obs1;obs2;...
  const canonicalPayload = [
    userId,
    deviceId ?? '',
    obsStrings.join(';'),
  ].join('|');

  // 4. Return SHA256 hex digest
  return createHash('sha256').update(canonicalPayload, 'utf8').digest('hex');
}
