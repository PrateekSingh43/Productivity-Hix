import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { PrismaClient } from './generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import { randomUUID } from 'node:crypto';

describe('Phase 3A Database Invariant Tests (PostgreSQL Engine Enforcement)', () => {
  let prisma: PrismaClient;
  const testUserId = randomUUID();
  const testBlockId = randomUUID();
  let testClaimId: string;
  let testLinkId: string;
  let testInferenceId: string;

  before(async () => {
    const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DIRECT_URL or DATABASE_URL must be configured');
    }
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

    // 1. Create test user
    await prisma.user.create({
      data: {
        id: testUserId,
        displayName: 'Phase 3A Invariant Test User',
      },
    });

    // 2. Create base temporal activity block
    const now = new Date();
    const halfHourLater = new Date(now.getTime() + 1800000);
    await prisma.temporalActivityBlock.create({
      data: {
        id: testBlockId,
        userId: testUserId,
        observationSetFingerprint: 'dummy-test-fingerprint-for-invariants',
        startTime: now,
        endTime: halfHourLater,
        wallClockDurationMs: 1800000,
        observedActiveDurationMs: 1500000,
        pausedDurationMs: 300000,
        primaryApplication: 'Visual Studio Code',
        cleanTitle: 'Phase 3A Invariant Testing',
      },
    });

    // 3. Create sample targets for ClaimEvidence: a claim, a link, and an inference
    testClaimId = randomUUID();
    await prisma.semanticClaim.create({
      data: {
        id: testClaimId,
        blockId: testBlockId,
        claimType: 'TOPIC_CONTEXT',
        value: 'Database Constraints',
        engineVersion: '1.0.0',
      },
    });

    testLinkId = randomUUID();
    await prisma.activityContextLink.create({
      data: {
        id: testLinkId,
        blockId: testBlockId,
        userId: testUserId,
        targetScope: 'GENERAL_WORK',
      },
    });

    testInferenceId = randomUUID();
    await prisma.attentionInference.create({
      data: {
        id: testInferenceId,
        blockId: testBlockId,
        focusEvidenceState: 'SUPPORTED',
      },
    });
  });

  after(async () => {
    // Cascade delete test user and all dependent records
    try {
      if (prisma) {
        await prisma.user.delete({
          where: { id: testUserId },
        });
        await prisma.$disconnect();
      }
    } catch {
      // Ignored during teardown
    }
  });

  // ==========================================================================
  // Required Test Group A — ClaimEvidence Single Target Constraint
  // Invariant: chk_claim_evidence_single_target (num_nonnulls = 1)
  // ==========================================================================
  test('Group A: ClaimEvidence PostgreSQL single-target invariant', async (t) => {
    await t.test('exactly one target (claim_id only) -> PASS', async () => {
      const evidence = await prisma.claimEvidence.create({
        data: {
          claimId: testClaimId,
          evidenceType: 'TOKEN_MATCH',
          evidenceReference: 'ref-1',
          weight: 1.0,
        },
      });
      assert.ok(evidence.id);
      // Clean up
      await prisma.claimEvidence.delete({ where: { id: evidence.id } });
    });

    await t.test('exactly one target (link_id only) -> PASS', async () => {
      const evidence = await prisma.claimEvidence.create({
        data: {
          linkId: testLinkId,
          evidenceType: 'WINDOW_AFFINITY',
          evidenceReference: 'ref-2',
          weight: 0.9,
        },
      });
      assert.ok(evidence.id);
      // Clean up
      await prisma.claimEvidence.delete({ where: { id: evidence.id } });
    });

    await t.test('exactly one target (inference_id only) -> PASS', async () => {
      const evidence = await prisma.claimEvidence.create({
        data: {
          inferenceId: testInferenceId,
          evidenceType: 'KEYSTROKE_DENSITY',
          evidenceReference: 'ref-3',
          weight: 0.85,
        },
      });
      assert.ok(evidence.id);
      // Clean up
      await prisma.claimEvidence.delete({ where: { id: evidence.id } });
    });

    await t.test('zero targets -> FAIL (rejected by PostgreSQL CHECK constraint)', async () => {
      await assert.rejects(
        async () => {
          await prisma.claimEvidence.create({
            data: {
              claimId: null,
              linkId: null,
              inferenceId: null,
              evidenceType: 'INVALID_EVIDENCE',
              evidenceReference: 'no-target',
            },
          });
        },
        (err: Error) => {
          const msg = err.message.toLowerCase();
          return msg.includes('chk_claim_evidence_single_target') || msg.includes('check constraint');
        }
      );
    });

    await t.test('two targets (claim_id AND link_id) -> FAIL (rejected by PostgreSQL CHECK)', async () => {
      await assert.rejects(
        async () => {
          await prisma.claimEvidence.create({
            data: {
              claimId: testClaimId,
              linkId: testLinkId,
              evidenceType: 'DUAL_TARGET',
              evidenceReference: 'dual-target-ref',
            },
          });
        },
        (err: Error) => {
          const msg = err.message.toLowerCase();
          return msg.includes('chk_claim_evidence_single_target') || msg.includes('check constraint');
        }
      );
    });

    await t.test('three targets (claim_id, link_id, inference_id) -> FAIL (rejected by PostgreSQL CHECK)', async () => {
      await assert.rejects(
        async () => {
          await prisma.claimEvidence.create({
            data: {
              claimId: testClaimId,
              linkId: testLinkId,
              inferenceId: testInferenceId,
              evidenceType: 'TRIPLE_TARGET',
              evidenceReference: 'triple-target-ref',
            },
          });
        },
        (err: Error) => {
          const msg = err.message.toLowerCase();
          return msg.includes('chk_claim_evidence_single_target') || msg.includes('check constraint');
        }
      );
    });
  });

  // ==========================================================================
  // Required Test Group B — Primary Modality Uniqueness Partial Index
  // Invariant: idx_semantic_claims_primary_modality_current
  // ==========================================================================
  test('Group B: Primary Modality Uniqueness Partial Unique Index', async (t) => {
    let primaryClaim1Id: string | null = null;
    let secondaryClaim1Id: string | null = null;
    let secondaryClaim2Id: string | null = null;
    let oldPrimaryClaimId: string | null = null;
    let newPrimaryClaimId: string | null = null;

    await t.test('one current primary -> PASS', async () => {
      const claim = await prisma.semanticClaim.create({
        data: {
          blockId: testBlockId,
          claimType: 'MODALITY_PRIMARY',
          value: 'development',
          isCurrent: true,
          engineVersion: '1.0.0',
        },
      });
      primaryClaim1Id = claim.id;
      assert.ok(claim.id);
    });

    await t.test('multiple secondary claims alongside current primary -> PASS', async () => {
      const sec1 = await prisma.semanticClaim.create({
        data: {
          blockId: testBlockId,
          claimType: 'MODALITY_SECONDARY',
          value: 'communication',
          isCurrent: true,
          engineVersion: '1.0.0',
        },
      });
      const sec2 = await prisma.semanticClaim.create({
        data: {
          blockId: testBlockId,
          claimType: 'MODALITY_SECONDARY',
          value: 'media_consumption',
          isCurrent: true,
          engineVersion: '1.0.0',
        },
      });
      secondaryClaim1Id = sec1.id;
      secondaryClaim2Id = sec2.id;
      assert.ok(sec1.id);
      assert.ok(sec2.id);
    });

    await t.test('two current primary claims on same block -> FAIL (rejected by PostgreSQL partial index)', async () => {
      await assert.rejects(
        async () => {
          await prisma.semanticClaim.create({
            data: {
              blockId: testBlockId,
              claimType: 'MODALITY_PRIMARY',
              value: 'reading_research',
              isCurrent: true, // Collision with primaryClaim1Id
              engineVersion: '1.0.0',
            },
          });
        },
        (err: Error) => {
          const msg = err.message.toLowerCase();
          return (
            msg.includes('idx_semantic_claims_primary_modality_current') ||
            msg.includes('unique constraint')
          );
        }
      );
    });

    await t.test('old non-current primary (superseded) + new current primary -> PASS', async () => {
      // Clean up current primary
      if (primaryClaim1Id) {
        await prisma.semanticClaim.delete({ where: { id: primaryClaim1Id } });
        primaryClaim1Id = null;
      }

      // Create old primary with is_current = false
      const oldPrimary = await prisma.semanticClaim.create({
        data: {
          blockId: testBlockId,
          claimType: 'MODALITY_PRIMARY',
          value: 'development',
          isCurrent: false, // Old/superseded
          engineVersion: '0.9.0',
        },
      });
      oldPrimaryClaimId = oldPrimary.id;

      // Create new current primary superseding the old one
      const newPrimary = await prisma.semanticClaim.create({
        data: {
          blockId: testBlockId,
          claimType: 'MODALITY_PRIMARY',
          value: 'reading_research',
          isCurrent: true, // Active replacement
          engineVersion: '1.0.0',
          supersedesId: oldPrimary.id,
        },
      });
      newPrimaryClaimId = newPrimary.id;

      assert.ok(oldPrimary.id);
      assert.ok(newPrimary.id);
      assert.equal(newPrimary.supersedesId, oldPrimary.id);
    });

    // Cleanup semantic claims created in group B
    const idsToDelete: (string | null)[] = [
      secondaryClaim1Id,
      secondaryClaim2Id,
      oldPrimaryClaimId,
      newPrimaryClaimId,
    ];

    for (const id of idsToDelete) {
      if (id) {
        await prisma.semanticClaim.delete({ where: { id } }).catch(() => {});
      }
    }
  });

  // ==========================================================================
  // Additional PostgreSQL DB Level CHECK Constraint Verification
  // ==========================================================================
  test('Group C (DB Level): PostgreSQL Temporal Duration Arithmetic Check', async (t) => {
    await t.test('invalid paused duration (paused != wall - active) -> FAIL (rejected by DB CHECK)', async () => {
      const badBlockId = randomUUID();
      const now = new Date();
      await assert.rejects(
        async () => {
          await prisma.temporalActivityBlock.create({
            data: {
              id: badBlockId,
              userId: testUserId,
              observationSetFingerprint: 'dummy-fp',
              startTime: now,
              endTime: new Date(now.getTime() + 1000),
              wallClockDurationMs: 1000,
              observedActiveDurationMs: 800,
              pausedDurationMs: 100, // Invalid: should be 200
              primaryApplication: 'App',
              cleanTitle: 'Title',
            },
          });
        },
        (err: Error) => {
          const msg = err.message.toLowerCase();
          return msg.includes('chk_temporal_blocks_durations') || msg.includes('check constraint');
        }
      );
    });
  });

  test('Group D (DB Level): PostgreSQL Confidence Range Check', async (t) => {
    await t.test('confidence > 1.0 -> FAIL (rejected by DB CHECK)', async () => {
      await assert.rejects(
        async () => {
          await prisma.semanticClaim.create({
            data: {
              blockId: testBlockId,
              claimType: 'TOPIC_CONTEXT',
              value: 'Invalid Confidence',
              confidence: 1.5, // Invalid: > 1.0
              engineVersion: '1.0.0',
            },
          });
        },
        (err: Error) => {
          const msg = err.message.toLowerCase();
          return msg.includes('chk_semantic_claims_confidence') || msg.includes('check constraint');
        }
      );
    });
  });
});
