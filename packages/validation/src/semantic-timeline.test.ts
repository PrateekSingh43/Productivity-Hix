import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateTemporalDurations,
  validateContributionInterval,
  validateTargetScope,
  validateTenantBoundary,
  validateGapExplanation,
  validateClaimEvidenceTarget,
  validateConfidence,
  computeObservationSetFingerprint,
} from './semantic-timeline';

// ============================================================================
// Required Test Group C — Duration Arithmetic Invariants
// ============================================================================
test('Group C: Temporal Duration Invariants', async (t) => {
  await t.test('valid duration set -> PASS', () => {
    const res = validateTemporalDurations({
      wallClockDurationMs: 1800000, // 30m
      observedActiveDurationMs: 1500000, // 25m
      pausedDurationMs: 300000, // 5m
    });
    assert.equal(res.isValid, true);
    assert.equal(res.errors.length, 0);
  });

  await t.test('negative wall-clock -> FAIL', () => {
    const res = validateTemporalDurations({
      wallClockDurationMs: -100,
      observedActiveDurationMs: 0,
      pausedDurationMs: -100,
    });
    assert.equal(res.isValid, false);
    assert.match(res.errors.join('; '), /wallClockDurationMs \(-100\) cannot be negative/);
  });

  await t.test('negative active -> FAIL', () => {
    const res = validateTemporalDurations({
      wallClockDurationMs: 1000,
      observedActiveDurationMs: -50,
      pausedDurationMs: 1050,
    });
    assert.equal(res.isValid, false);
    assert.match(res.errors.join('; '), /observedActiveDurationMs \(-50\) cannot be negative/);
  });

  await t.test('negative paused -> FAIL', () => {
    const res = validateTemporalDurations({
      wallClockDurationMs: 1000,
      observedActiveDurationMs: 1000,
      pausedDurationMs: -10,
    });
    assert.equal(res.isValid, false);
    assert.match(res.errors.join('; '), /pausedDurationMs \(-10\) cannot be negative/);
  });

  await t.test('active > wall-clock -> FAIL', () => {
    const res = validateTemporalDurations({
      wallClockDurationMs: 1000,
      observedActiveDurationMs: 1200,
      pausedDurationMs: -200,
    });
    assert.equal(res.isValid, false);
    assert.match(res.errors.join('; '), /exceeds wallClockDurationMs/);
  });

  await t.test('paused != wall-clock - active -> FAIL', () => {
    const res = validateTemporalDurations({
      wallClockDurationMs: 1000,
      observedActiveDurationMs: 800,
      pausedDurationMs: 100, // should be 200
    });
    assert.equal(res.isValid, false);
    assert.match(res.errors.join('; '), /must exactly equal wallClockDurationMs - observedActiveDurationMs/);
  });
});

// ============================================================================
// Required Test Group D — Contribution Interval & Containment
// ============================================================================
test('Group D: Contribution Interval and Containment', async (t) => {
  const baseStart = 1700000000000;
  const baseEnd = 1700000060000; // +60s

  await t.test('valid contribution -> PASS', () => {
    const res = validateContributionInterval(
      {
        contributionStart: baseStart,
        contributionEnd: baseEnd,
        contributionDurationMs: 60000,
      },
      {
        sourceActivity: { start: baseStart - 10000, end: baseEnd + 10000 },
        temporalBlock: { startTime: baseStart - 5000, endTime: baseEnd + 5000 },
      }
    );
    assert.equal(res.isValid, true);
    assert.equal(res.errors.length, 0);
  });

  await t.test('start >= end -> FAIL', () => {
    const res = validateContributionInterval({
      contributionStart: baseEnd,
      contributionEnd: baseStart,
      contributionDurationMs: 0,
    });
    assert.equal(res.isValid, false);
    assert.match(res.errors.join('; '), /must be strictly less than contributionEnd/);
  });

  await t.test('negative duration -> FAIL', () => {
    const res = validateContributionInterval({
      contributionStart: baseStart,
      contributionEnd: baseEnd,
      contributionDurationMs: -60000,
    });
    assert.equal(res.isValid, false);
    assert.match(res.errors.join('; '), /cannot be negative/);
  });

  await t.test('duration mismatch with timestamps -> FAIL', () => {
    const res = validateContributionInterval({
      contributionStart: baseStart,
      contributionEnd: baseEnd,
      contributionDurationMs: 30000, // actual is 60000
    });
    assert.equal(res.isValid, false);
    assert.match(res.errors.join('; '), /must equal end - start/);
  });

  await t.test('outside source observation -> FAIL', () => {
    const res = validateContributionInterval(
      {
        contributionStart: baseStart,
        contributionEnd: baseEnd,
        contributionDurationMs: 60000,
      },
      {
        sourceActivity: { start: baseStart + 1000, end: baseEnd }, // starts too late
      }
    );
    assert.equal(res.isValid, false);
    assert.match(res.errors.join('; '), /outside source activity interval/);
  });

  await t.test('outside temporal block -> FAIL', () => {
    const res = validateContributionInterval(
      {
        contributionStart: baseStart,
        contributionEnd: baseEnd,
        contributionDurationMs: 60000,
      },
      {
        temporalBlock: { startTime: baseStart, endTime: baseEnd - 1000 }, // ends too early
      }
    );
    assert.equal(res.isValid, false);
    assert.match(res.errors.join('; '), /outside temporal block interval/);
  });
});

// ============================================================================
// Required Test Group E — TargetScope Formal Mapping
// ============================================================================
test('Group E: TargetScope Formal Mapping', async (t) => {
  await t.test('TASK mapping: valid with taskId only', () => {
    const res = validateTargetScope({
      targetScope: 'TASK',
      taskId: 'task-123',
    });
    assert.equal(res.isValid, true);
  });

  await t.test('TASK mapping: valid with taskId, goalId, and projectTag', () => {
    const res = validateTargetScope({
      targetScope: 'TASK',
      taskId: 'task-123',
      goalId: 'goal-456',
      projectTag: 'infra',
    });
    assert.equal(res.isValid, true);
  });

  await t.test('TASK mapping: missing taskId -> FAIL', () => {
    const res = validateTargetScope({
      targetScope: 'TASK',
      taskId: null,
      goalId: 'goal-456',
    });
    assert.equal(res.isValid, false);
    assert.match(res.errors.join('; '), /requires taskId to be non-null/);
  });

  await t.test('GOAL mapping: valid with goalId and no taskId', () => {
    const res = validateTargetScope({
      targetScope: 'GOAL',
      goalId: 'goal-456',
      taskId: null,
    });
    assert.equal(res.isValid, true);
  });

  await t.test('GOAL mapping: missing goalId -> FAIL', () => {
    const res = validateTargetScope({
      targetScope: 'GOAL',
      goalId: null,
      taskId: null,
    });
    assert.equal(res.isValid, false);
    assert.match(res.errors.join('; '), /requires goalId to be non-null/);
  });

  await t.test('GOAL mapping: has taskId -> FAIL', () => {
    const res = validateTargetScope({
      targetScope: 'GOAL',
      goalId: 'goal-456',
      taskId: 'task-123',
    });
    assert.equal(res.isValid, false);
    assert.match(res.errors.join('; '), /requires taskId to be null/);
  });

  await t.test('PROJECT mapping: valid with projectTag and no task/goal', () => {
    const res = validateTargetScope({
      targetScope: 'PROJECT',
      projectTag: 'core-pipeline',
      taskId: null,
      goalId: null,
    });
    assert.equal(res.isValid, true);
  });

  await t.test('PROJECT mapping: has taskId -> FAIL', () => {
    const res = validateTargetScope({
      targetScope: 'PROJECT',
      projectTag: 'core-pipeline',
      taskId: 'task-123',
    });
    assert.equal(res.isValid, false);
    assert.match(res.errors.join('; '), /requires taskId to be null/);
  });

  await t.test('PROJECT mapping: has goalId -> FAIL', () => {
    const res = validateTargetScope({
      targetScope: 'PROJECT',
      projectTag: 'core-pipeline',
      goalId: 'goal-456',
    });
    assert.equal(res.isValid, false);
    assert.match(res.errors.join('; '), /requires goalId to be null/);
  });

  await t.test('PROJECT mapping: missing projectTag -> FAIL', () => {
    const res = validateTargetScope({
      targetScope: 'PROJECT',
      projectTag: null,
    });
    assert.equal(res.isValid, false);
    assert.match(res.errors.join('; '), /requires projectTag to be non-null/);
  });

  await t.test('GENERAL_WORK mapping: valid when all null', () => {
    const res = validateTargetScope({
      targetScope: 'GENERAL_WORK',
      taskId: null,
      goalId: null,
      projectTag: null,
    });
    assert.equal(res.isValid, true);
  });

  await t.test('GENERAL_WORK mapping: has task -> FAIL', () => {
    const res = validateTargetScope({
      targetScope: 'GENERAL_WORK',
      taskId: 'task-123',
    });
    assert.equal(res.isValid, false);
    assert.match(res.errors.join('; '), /requires taskId to be null/);
  });

  await t.test('GENERAL_WORK mapping: has goal -> FAIL', () => {
    const res = validateTargetScope({
      targetScope: 'GENERAL_WORK',
      goalId: 'goal-456',
    });
    assert.equal(res.isValid, false);
    assert.match(res.errors.join('; '), /requires goalId to be null/);
  });

  await t.test('GENERAL_WORK mapping: has projectTag -> FAIL', () => {
    const res = validateTargetScope({
      targetScope: 'GENERAL_WORK',
      projectTag: 'analytics',
    });
    assert.equal(res.isValid, false);
    assert.match(res.errors.join('; '), /requires projectTag to be null/);
  });

  await t.test('UNLINKED mapping: valid when all null', () => {
    const res = validateTargetScope({
      targetScope: 'UNLINKED',
      taskId: null,
      goalId: null,
      projectTag: null,
    });
    assert.equal(res.isValid, true);
  });

  await t.test('UNLINKED mapping: has any link -> FAIL', () => {
    const res = validateTargetScope({
      targetScope: 'UNLINKED',
      taskId: 'task-123',
    });
    assert.equal(res.isValid, false);
    assert.match(res.errors.join('; '), /requires taskId to be null/);
  });
});

// ============================================================================
// Required Test Group F — Tenant Boundaries
// ============================================================================
test('Group F: Tenant Ownership Consistency', async (t) => {
  const userId = 'user-alice-111';
  const strangerId = 'user-bob-999';

  await t.test('same user across entities -> PASS', () => {
    const resDevice = validateTenantBoundary({
      primaryUserId: userId,
      associatedEntityUserId: userId,
      entityName: 'DesktopDevice',
    });
    const resActivity = validateTenantBoundary({
      primaryUserId: userId,
      associatedEntityUserId: userId,
      entityName: 'NormalizedActivity',
    });
    assert.equal(resDevice.isValid, true);
    assert.equal(resActivity.isValid, true);
  });

  await t.test('different user device -> FAIL', () => {
    const res = validateTenantBoundary({
      primaryUserId: userId,
      associatedEntityUserId: strangerId,
      entityName: 'DesktopDevice',
    });
    assert.equal(res.isValid, false);
    assert.match(res.errors.join('; '), /DesktopDevice userId/);
  });

  await t.test('different user activity -> FAIL', () => {
    const res = validateTenantBoundary({
      primaryUserId: userId,
      associatedEntityUserId: strangerId,
      entityName: 'NormalizedActivity',
    });
    assert.equal(res.isValid, false);
    assert.match(res.errors.join('; '), /NormalizedActivity userId/);
  });

  await t.test('different user task -> FAIL', () => {
    const res = validateTenantBoundary({
      primaryUserId: userId,
      associatedEntityUserId: strangerId,
      entityName: 'Task',
    });
    assert.equal(res.isValid, false);
    assert.match(res.errors.join('; '), /Task userId/);
  });

  await t.test('different user goal -> FAIL', () => {
    const res = validateTenantBoundary({
      primaryUserId: userId,
      associatedEntityUserId: strangerId,
      entityName: 'DailyGoal',
    });
    assert.equal(res.isValid, false);
    assert.match(res.errors.join('; '), /DailyGoal userId/);
  });

  await t.test('different user gap explanation -> FAIL', () => {
    const res = validateTenantBoundary({
      primaryUserId: userId,
      associatedEntityUserId: strangerId,
      entityName: 'UserGapExplanation',
    });
    assert.equal(res.isValid, false);
    assert.match(res.errors.join('; '), /UserGapExplanation userId/);
  });
});

// ============================================================================
// Required Test Group G — Gap Explanation Invariants
// ============================================================================
test('Group G: Telemetry Coverage Gap & 1:N Explanations', async (t) => {
  const gapStart = 1700000000000;
  const gapEnd = 1700003600000; // 1 hour

  await t.test('one gap + one explanation -> PASS', () => {
    const res = validateGapExplanation(
      {
        startTime: gapStart + 300000,
        endTime: gapEnd - 300000,
      },
      { startTime: gapStart, endTime: gapEnd }
    );
    assert.equal(res.isValid, true);
  });

  await t.test('one gap + many explanations (non-overlapping sub-intervals) -> PASS', () => {
    const exp1 = validateGapExplanation(
      { startTime: gapStart, endTime: gapStart + 1800000 },
      { startTime: gapStart, endTime: gapEnd }
    );
    const exp2 = validateGapExplanation(
      { startTime: gapStart + 1800000, endTime: gapEnd },
      { startTime: gapStart, endTime: gapEnd }
    );
    assert.equal(exp1.isValid, true);
    assert.equal(exp2.isValid, true);
  });

  await t.test('explanation outside gap (starts before gap) -> FAIL', () => {
    const res = validateGapExplanation(
      {
        startTime: gapStart - 1000,
        endTime: gapEnd,
      },
      { startTime: gapStart, endTime: gapEnd }
    );
    assert.equal(res.isValid, false);
    assert.match(res.errors.join('; '), /must be contained within TelemetryCoverageGap/);
  });

  await t.test('explanation outside gap (ends after gap) -> FAIL', () => {
    const res = validateGapExplanation(
      {
        startTime: gapStart,
        endTime: gapEnd + 1000,
      },
      { startTime: gapStart, endTime: gapEnd }
    );
    assert.equal(res.isValid, false);
    assert.match(res.errors.join('; '), /must be contained within TelemetryCoverageGap/);
  });

  await t.test('reversed explanation interval -> FAIL', () => {
    const res = validateGapExplanation(
      {
        startTime: gapStart + 2000,
        endTime: gapStart + 1000,
      },
      { startTime: gapStart, endTime: gapEnd }
    );
    assert.equal(res.isValid, false);
    assert.match(res.errors.join('; '), /must be strictly less than end_time/);
  });
});

// ============================================================================
// Required Test Group H — Observation Set Fingerprint
// ============================================================================
test('Group H: Observation Set Fingerprint Determinism', async (t) => {
  const userId = 'user-uuid-1';
  const deviceId = 'device-uuid-1';

  const obsA = {
    activityId: 'activity-a',
    contributionStart: 1700000000000,
    contributionEnd: 1700000030000,
  };
  const obsB = {
    activityId: 'activity-b',
    contributionStart: 1700000030000,
    contributionEnd: 1700000060000,
  };
  const obsC = {
    activityId: 'activity-c',
    contributionStart: 1700000060000,
    contributionEnd: 1700000090000,
  };

  await t.test('same observations/ranges -> same fingerprint', () => {
    const fp1 = computeObservationSetFingerprint({
      userId,
      deviceId,
      observations: [obsA, obsB],
    });
    const fp2 = computeObservationSetFingerprint({
      userId,
      deviceId,
      observations: [obsA, obsB],
    });
    assert.equal(fp1, fp2);
    assert.equal(typeof fp1, 'string');
    assert.equal(fp1.length, 64); // SHA256 hex length
  });

  await t.test('input ordering variation -> same fingerprint', () => {
    // Permutation [obsB, obsA, obsC] vs [obsC, obsA, obsB]
    const fp1 = computeObservationSetFingerprint({
      userId,
      deviceId,
      observations: [obsB, obsA, obsC],
    });
    const fp2 = computeObservationSetFingerprint({
      userId,
      deviceId,
      observations: [obsC, obsA, obsB],
    });
    assert.equal(fp1, fp2, 'Observation order permutation must yield identical fingerprint');
  });

  await t.test('different observation -> different fingerprint', () => {
    const fp1 = computeObservationSetFingerprint({
      userId,
      deviceId,
      observations: [obsA, obsB],
    });
    const fp2 = computeObservationSetFingerprint({
      userId,
      deviceId,
      observations: [obsA, obsC],
    });
    assert.notEqual(fp1, fp2);
  });

  await t.test('same observation, different contribution range -> different fingerprint', () => {
    const obsBModifiedRange = {
      ...obsB,
      contributionEnd: 1700000065000, // +5s
    };
    const fp1 = computeObservationSetFingerprint({
      userId,
      deviceId,
      observations: [obsA, obsB],
    });
    const fp2 = computeObservationSetFingerprint({
      userId,
      deviceId,
      observations: [obsA, obsBModifiedRange],
    });
    assert.notEqual(fp1, fp2);
  });
});

// ============================================================================
// ClaimEvidence Target & Confidence Calibration Validation Tests
// ============================================================================
test('ClaimEvidence Target & Confidence Invariants', async (t) => {
  await t.test('ClaimEvidence: exactly one target -> PASS', () => {
    assert.equal(validateClaimEvidenceTarget({ claimId: 'claim-1' }).isValid, true);
    assert.equal(validateClaimEvidenceTarget({ linkId: 'link-1' }).isValid, true);
    assert.equal(validateClaimEvidenceTarget({ inferenceId: 'inf-1' }).isValid, true);
  });

  await t.test('ClaimEvidence: zero targets -> FAIL', () => {
    const res = validateClaimEvidenceTarget({});
    assert.equal(res.isValid, false);
    assert.match(res.errors.join('; '), /must reference exactly one target/);
  });

  await t.test('ClaimEvidence: two targets -> FAIL', () => {
    const res = validateClaimEvidenceTarget({ claimId: 'claim-1', linkId: 'link-1' });
    assert.equal(res.isValid, false);
    assert.match(res.errors.join('; '), /must reference exactly one target/);
  });

  await t.test('ClaimEvidence: three targets -> FAIL', () => {
    const res = validateClaimEvidenceTarget({
      claimId: 'claim-1',
      linkId: 'link-1',
      inferenceId: 'inf-1',
    });
    assert.equal(res.isValid, false);
    assert.match(res.errors.join('; '), /must reference exactly one target/);
  });

  await t.test('Confidence: null or undefined -> PASS (uncalibrated)', () => {
    assert.equal(validateConfidence(null).isValid, true);
    assert.equal(validateConfidence(undefined).isValid, true);
  });

  await t.test('Confidence: valid range [0.0, 1.0] -> PASS', () => {
    assert.equal(validateConfidence(0.0).isValid, true);
    assert.equal(validateConfidence(0.5).isValid, true);
    assert.equal(validateConfidence(1.0).isValid, true);
  });

  await t.test('Confidence: out of bounds (< 0.0 or > 1.0) -> FAIL', () => {
    assert.equal(validateConfidence(-0.01).isValid, false);
    assert.equal(validateConfidence(1.01).isValid, false);
  });
});
