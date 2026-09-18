import {
  materializeTemporalBlocks,
  resolveBlockSemantics,
  type BlockEngineInput,
  type BlockSemantics,
} from "@repo/analytics";
import {
  validateTemporalDurations,
  validateContributionInterval,
  validateClaimEvidenceTarget,
  validateTenantBoundary,
} from "@repo/validation";
import type { PrismaClient } from "@repo/db";
import type { Prisma } from "@repo/db";

export interface MaterializerResult {
  blocksCreated: number;
  blocksUpdated: number;
  observationsCreated: number;
  claimsCreated: number;
  evidenceCreated: number;
  attentionCreated: number;
  gapsCreated: number;
}

interface NormalizedRow {
  id: string;
  externalId: string;
  source: string;
  watcher: string;
  timestamp: Date;
  duration: number;
  data: unknown;
}

export interface MaterializeOptions {
  maxGapMs?: number;
  minBreakMs?: number;
  transientThresholdMs?: number;
  maxBreakMs?: number;
  minGapSeconds?: number;
}

const ENGINE_VERSION = "3b.0.1";

function rowToInput(row: NormalizedRow, userId: string, deviceId: string | null): BlockEngineInput | null {
  const startMs = row.timestamp.getTime();
  const durationMs = Math.round(row.duration * 1000);
  if (!Number.isFinite(startMs) || durationMs <= 0) return null;
  const data = (row.data && typeof row.data === "object" && !Array.isArray(row.data)
    ? (row.data as Record<string, unknown>)
    : {}) as Record<string, any>;
  const isAfk = row.watcher === "afk" && (data.state === "afk" || data.status === "afk" || data.state === true || data.status === true);
  const application = typeof data.application === "string" && data.application ? data.application : typeof data.app === "string" ? data.app : "";
  const title = typeof data.windowTitle === "string" ? data.windowTitle : typeof data.pageTitle === "string" ? data.pageTitle : typeof data.title === "string" ? data.title : "";
  return {
    activityId: row.id,
    userId,
    deviceId,
    source: row.source === "browser" ? "browser" : "desktop",
    watcher: row.watcher,
    application: isAfk ? "afk" : application || "unknown",
    title: typeof title === "string" ? title : "",
    domain: typeof data.domain === "string" && data.domain ? data.domain : null,
    url: typeof data.sanitizedUrl === "string" ? data.sanitizedUrl : typeof data.url === "string" ? data.url : null,
    isAfk,
    start: startMs,
    end: startMs + durationMs,
    data,
  };
}

export interface IntentContext {
  tasks: Array<{ id: string; title: string; description: string | null; status: string }>;
  dailyGoals: Array<{ id: string; title: string }>;
  workSessions: Array<{ id: string; taskId: string | null; startedAt: Date; endedAt: Date | null }>;
}

export async function materializeBlocksForUserDay(
  prisma: PrismaClient,
  userId: string,
  from: Date,
  to: Date,
  options: MaterializeOptions = {}
): Promise<MaterializerResult> {
  const result: MaterializerResult = {
    blocksCreated: 0,
    blocksUpdated: 0,
    observationsCreated: 0,
    claimsCreated: 0,
    evidenceCreated: 0,
    attentionCreated: 0,
    gapsCreated: 0,
  };

  const [userPref, rules, overrides, tasks, dailyGoals, workSessions] = await Promise.all([
    prisma.userPreference.findUnique({ where: { userId }, select: { quietHoursEnabled: true, quietHoursStart: true, quietHoursEnd: true } }),
    prisma.userActivityRule.findMany({ where: { userId, isEnabled: true }, orderBy: [{ priority: "asc" }, { createdAt: "asc" }] }),
    prisma.userActivityOverride.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
    prisma.task.findMany({
      where: { userId, createdAt: { lte: to } },
      select: { id: true, title: true, description: true, status: true },
    }),
    prisma.dailyGoal.findMany({
      where: { userId, createdAt: { lte: to } },
      select: { id: true, title: true },
    }),
    prisma.workSession.findMany({
      where: {
        userId,
        startedAt: { lte: to },
        OR: [{ endedAt: null }, { endedAt: { gte: from } }],
      },
      select: { id: true, taskId: true, startedAt: true, endedAt: true },
    }),
  ]);
  void userPref;

  const intentCtx: IntentContext = {
    tasks: tasks.map((t) => ({ id: t.id, title: t.title, description: t.description, status: t.status })),
    dailyGoals: dailyGoals.map((g) => ({ id: g.id, title: g.title })),
    workSessions: workSessions.map((w) => ({ id: w.id, taskId: w.taskId, startedAt: w.startedAt, endedAt: w.endedAt })),
  };

  const rows = (await prisma.normalizedActivity.findMany({
    where: { userId, timestamp: { gte: from, lt: to }, duration: { gt: 0 } },
    orderBy: [{ timestamp: "asc" }, { id: "asc" }],
  })) as NormalizedRow[];

  if (rows.length === 0) return result;

  const deviceId = await resolvePrimaryDeviceId(prisma, userId);
  const inputs = rows
    .map((row) => rowToInput(row, userId, deviceId))
    .filter((v): v is BlockEngineInput => v !== null);

  const blocks = materializeTemporalBlocks(inputs, options);

  const existingBlocks = await prisma.temporalActivityBlock.findMany({
    where: {
      userId,
      startTime: { gte: from, lte: to },
      track: "FOREGROUND",
    },
    select: {
      id: true,
      observationSetFingerprint: true,
      _count: {
        select: { claims: true },
      },
    },
  });
  const validFingerprints = new Set(
    existingBlocks.filter((b) => b._count.claims > 0).map((b) => b.observationSetFingerprint)
  );

  for (const block of blocks) {
    if (validFingerprints.has(block.observationSetFingerprint)) {
      continue;
    }
    await persistBlock(prisma, userId, block, rules, overrides, intentCtx, result);
  }

  await detectCoverageGaps(prisma, userId, inputs, options.minGapSeconds ?? 50 * 60);
  return result;
}

function activityModalityValues(): string[] {
  return [
    "development",
    "reading_research",
    "writing_documentation",
    "communication",
    "administration",
    "media_consumption",
    "gaming",
    "idle_away",
    "system_maintenance",
    "unknown",
  ];
}

function toSafeModality(value: string): string {
  return activityModalityValues().includes(value) ? value : "unknown";
}

async function resolvePrimaryDeviceId(prisma: PrismaClient, userId: string): Promise<string | null> {
  const device = await prisma.desktopDevice.findFirst({
    where: { userId },
    orderBy: { lastActiveAt: "desc" },
    select: { id: true },
  });
  return device?.id ?? null;
}

function evidenceRows(
  target: { claimId?: string; linkId?: string; inferenceId?: string },
  semantics: BlockSemantics
): Array<{ evidenceType: string; evidenceReference: string; weight: number }> {
  const evidence = semantics.evidence.map((e) => ({
    evidenceType: e.kind,
    evidenceReference: e.reference,
    weight: 1,
  }));
  if (evidence.length === 0 && (target.claimId || target.linkId || target.inferenceId)) {
    evidence.push({ evidenceType: "OBSERVATION", evidenceReference: "block_inputs", weight: 1 });
  }
  return evidence;
}

function evaluateIntentAlignment(
  startTime: Date,
  endTime: Date,
  block: ReturnType<typeof materializeTemporalBlocks>[number],
  semantics: BlockSemantics,
  intentCtx: IntentContext
): {
  targetScope: "TASK" | "GOAL" | "UNLINKED";
  taskId: string | null;
  goalId: string | null;
  relevance: "DIRECT" | "SUPPORTIVE" | "UNRELATED" | "UNKNOWN";
  intentionRelationship: "ALIGNED" | "DIVERGENT" | "UNLINKED" | "UNKNOWN";
} {
  const startMs = startTime.getTime();
  const endMs = endTime.getTime();

  // 1. Overlapping active work session
  const activeSession = intentCtx.workSessions.find((s) => {
    const sStart = s.startedAt.getTime();
    const sEnd = s.endedAt ? s.endedAt.getTime() : Infinity;
    return sStart < endMs && sEnd > startMs;
  });

  if (activeSession && activeSession.taskId) {
    const task = intentCtx.tasks.find((t) => t.id === activeSession.taskId);
    if (task) {
      if (
        semantics.primaryModality === "gaming" ||
        (semantics.primaryModality === "media_consumption" && semantics.activityType === "media")
      ) {
        return {
          targetScope: "TASK",
          taskId: task.id,
          goalId: null,
          relevance: "UNRELATED",
          intentionRelationship: "DIVERGENT",
        };
      }
      return {
        targetScope: "TASK",
        taskId: task.id,
        goalId: null,
        relevance: "DIRECT",
        intentionRelationship: "ALIGNED",
      };
    }
  }

  // 2. Keyword/description match with active task
  const contextStr = `${semantics.context ?? ""} ${block.cleanTitle} ${block.primaryApplication}`.toLowerCase();
  for (const task of intentCtx.tasks) {
    if (task.status === "done" || task.status === "archived") continue;
    const taskTitle = task.title.toLowerCase();
    const taskDesc = task.description?.toLowerCase();
    const matchesTitle = taskTitle.length >= 4 && contextStr.includes(taskTitle);
    const matchesDesc = Boolean(taskDesc && taskDesc.length >= 4 && contextStr.includes(taskDesc));
    if (matchesTitle || matchesDesc) {
      return {
        targetScope: "TASK",
        taskId: task.id,
        goalId: null,
        relevance: "DIRECT",
        intentionRelationship: "ALIGNED",
      };
    }
  }

  // 3. Keyword match with daily goal
  for (const goal of intentCtx.dailyGoals) {
    const goalTitle = goal.title.toLowerCase();
    if (goalTitle.length >= 4 && contextStr.includes(goalTitle)) {
      return {
        targetScope: "GOAL",
        taskId: null,
        goalId: goal.id,
        relevance: "SUPPORTIVE",
        intentionRelationship: "ALIGNED",
      };
    }
  }

  return {
    targetScope: "UNLINKED",
    taskId: null,
    goalId: null,
    relevance: "UNKNOWN",
    intentionRelationship: "UNLINKED",
  };
}

function evaluateAttentionState(
  block: ReturnType<typeof materializeTemporalBlocks>[number],
  semantics: BlockSemantics
): "SUPPORTED" | "INSUFFICIENT" | "CONTRADICTORY" | "UNKNOWN" {
  if (block.isAfkBlock || semantics.primaryModality === "idle_away") {
    return "UNKNOWN";
  }

  // Reading / documentation allows sparse interaction
  if (semantics.primaryModality === "reading_research" || semantics.primaryModality === "writing_documentation") {
    return block.observedActiveDurationMs >= 30_000 ? "SUPPORTED" : "INSUFFICIENT";
  }

  // Development requires active engagement
  if (semantics.primaryModality === "development") {
    if (block.observedActiveDurationMs >= 60_000) {
      return "SUPPORTED";
    }
    if (block.pausedDurationMs > block.observedActiveDurationMs * 3) {
      return "INSUFFICIENT";
    }
    return block.observedActiveDurationMs >= 30_000 ? "SUPPORTED" : "INSUFFICIENT";
  }

  // Gaming / media playback
  if (semantics.primaryModality === "gaming" || semantics.primaryModality === "media_consumption") {
    return block.observedActiveDurationMs >= 60_000 ? "SUPPORTED" : "INSUFFICIENT";
  }

  // Transient window switches < 15 seconds
  if (block.wallClockDurationMs < 15_000) {
    return "INSUFFICIENT";
  }

  return block.observedActiveDurationMs >= 60_000 ? "SUPPORTED" : "INSUFFICIENT";
}

async function persistBlock(
  prisma: PrismaClient,
  userId: string,
  block: ReturnType<typeof materializeTemporalBlocks>[number],
  rules: Array<Record<string, unknown> & { id: string; priority: number; isEnabled: boolean; applicationPattern: string | null; domainPattern: string | null; titlePattern: string | null; urlPattern: string | null; assignedModality: string | null; assignedContext: string | null; defaultRelevance: string | null }>,
  overrides: Array<{ id: string; targetTimeWindowStart: Date; targetTimeWindowEnd: Date; targetApplication: string; targetClaimFamily: string; targetClaimType: string; overriddenValue: string }>,
  intentCtx: IntentContext,
  result: MaterializerResult
): Promise<void> {
  const startTime = new Date(block.startTime);
  const endTime = new Date(block.endTime);

  const durations = validateTemporalDurations({
    wallClockDurationMs: block.wallClockDurationMs,
    observedActiveDurationMs: block.observedActiveDurationMs,
    pausedDurationMs: block.pausedDurationMs,
  });
  if (!durations.isValid) {
    throw new Error(`Temporal duration validation failed: ${durations.errors.join("; ")}`);
  }

  const semantics = resolveBlockSemantics(
    {
      start: block.startTime,
      end: block.endTime,
      application: block.primaryApplication,
      domain: block.domain,
      title: block.cleanTitle,
      url: block.sanitizedUrl,
      isAfk: block.isAfkBlock,
      source: block.sourceChannel === "BROWSER_TAB" ? "browser" : "desktop",
    },
    {
      rules: rules.map((r) => ({
        id: r.id,
        name: typeof r.name === "string" && r.name ? r.name : r.id,
        priority: r.priority,
        isEnabled: r.isEnabled,
        applicationPattern: r.applicationPattern,
        domainPattern: r.domainPattern,
        titlePattern: r.titlePattern,
        urlPattern: r.urlPattern,
        assignedModality: r.assignedModality as never,
        assignedContext: r.assignedContext,
        defaultRelevance: r.defaultRelevance as never,
      })),
      overrides: overrides.map((o) => ({
        id: o.id,
        targetTimeWindowStart: o.targetTimeWindowStart.getTime(),
        targetTimeWindowEnd: o.targetTimeWindowEnd.getTime(),
        targetApplication: o.targetApplication,
        targetClaimFamily: o.targetClaimFamily,
        targetClaimType: o.targetClaimType,
        overriddenValue: o.overriddenValue,
      })),
    }
  );

  const alignment = evaluateIntentAlignment(startTime, endTime, block, semantics, intentCtx);
  const focusState = evaluateAttentionState(block, semantics);

  const blockData = {
    userId,
    deviceId: null,
    observationSetFingerprint: block.observationSetFingerprint,
    startTime,
    endTime,
    wallClockDurationMs: block.wallClockDurationMs,
    observedActiveDurationMs: block.observedActiveDurationMs,
    pausedDurationMs: block.pausedDurationMs,
    track: block.track,
    primaryApplication: block.primaryApplication,
    cleanTitle: block.cleanTitle.slice(0, 512),
    domain: block.domain,
    sanitizedUrl: block.sanitizedUrl,
    sourceChannel: block.sourceChannel,
    rawEventCount: block.rawEventCount,
    interactionDensity: block.interactionDensity as Prisma.InputJsonValue,
    sourceComposition: block.sourceComposition as Prisma.InputJsonValue,
  };

  await prisma.$transaction(async (tx) => {
    const existing = await tx.temporalActivityBlock.findFirst({
      where: { userId, observationSetFingerprint: block.observationSetFingerprint },
      select: { id: true },
    });

    let blockId: string;
    if (existing) {
      blockId = existing.id;
      await tx.temporalActivityBlock.update({
        where: { id: blockId },
        data: {
          startTime,
          endTime,
          wallClockDurationMs: block.wallClockDurationMs,
          observedActiveDurationMs: block.observedActiveDurationMs,
          pausedDurationMs: block.pausedDurationMs,
          track: block.track,
          primaryApplication: block.primaryApplication,
          cleanTitle: block.cleanTitle.slice(0, 512),
          domain: block.domain,
          sanitizedUrl: block.sanitizedUrl,
          sourceChannel: block.sourceChannel,
          rawEventCount: block.rawEventCount,
          interactionDensity: block.interactionDensity as Prisma.InputJsonValue,
          sourceComposition: block.sourceComposition as Prisma.InputJsonValue,
          updatedAt: new Date(),
        },
      });
      result.blocksUpdated++;

      await tx.activityContextLink.deleteMany({ where: { blockId } });
      await tx.claimEvidence.deleteMany({ where: { claim: { blockId } } });
      await tx.semanticClaim.deleteMany({ where: { blockId } });
      await tx.blockObservation.deleteMany({ where: { blockId } });
      await tx.attentionInference.deleteMany({ where: { blockId } });
    } else {
      const created = await tx.temporalActivityBlock.create({ data: blockData, select: { id: true } });
      blockId = created.id;
      result.blocksCreated++;
    }

    for (const obs of block.observations) {
      const validity = validateContributionInterval(
        {
          contributionStart: new Date(obs.contributionStart),
          contributionEnd: new Date(obs.contributionEnd),
          contributionDurationMs: obs.contributionDurationMs,
        },
        {
          temporalBlock: { startTime, endTime },
        }
      );
      if (!validity.isValid) continue;
      await tx.blockObservation.create({
        data: {
          blockId,
          activityId: obs.activityId,
          contributionStart: new Date(obs.contributionStart),
          contributionEnd: new Date(obs.contributionEnd),
          contributionDurationMs: obs.contributionDurationMs,
        },
      });
      result.observationsCreated++;
    }

    // Primary modality claim
    const claim = await tx.semanticClaim.create({
      data: {
        blockId,
        claimType: "MODALITY_PRIMARY",
        value: toSafeModality(semantics.primaryModality),
        confidence: semantics.primaryConfidence,
        provenance: semantics.primaryProvenance,
        authority: semantics.primaryProvenance === "USER_OVERRIDE" ? "USER" : "SYSTEM",
        engineVersion: ENGINE_VERSION,
        evaluatedAt: new Date(),
        inputFingerprint: block.observationSetFingerprint,
        isCurrent: true,
      },
      select: { id: true },
    });
    result.claimsCreated++;

    // Inferred behavior (Activity Type) claim
    if (semantics.activityType) {
      await tx.semanticClaim.create({
        data: {
          blockId,
          claimType: "INFERRED_BEHAVIOR",
          value: semantics.activityType,
          confidence: semantics.primaryConfidence,
          provenance: semantics.primaryProvenance,
          authority: semantics.primaryProvenance === "USER_OVERRIDE" ? "USER" : "SYSTEM",
          engineVersion: ENGINE_VERSION,
          evaluatedAt: new Date(),
          isCurrent: true,
        },
      });
      result.claimsCreated++;
    }

    // Topic context claim
    if (semantics.context) {
      await tx.semanticClaim.create({
        data: {
          blockId,
          claimType: "TOPIC_CONTEXT",
          value: semantics.context,
          confidence: null,
          provenance: (semantics.contextProvenance ?? "CONTEXT_HEURISTIC") as never,
          authority: semantics.contextProvenance === "USER_RULE" || semantics.contextProvenance === "USER_OVERRIDE" ? "USER" : "SYSTEM",
          engineVersion: ENGINE_VERSION,
          evaluatedAt: new Date(),
          isCurrent: true,
        },
      });
      result.claimsCreated++;
    }

    // Activity context link (Intent association)
    await tx.activityContextLink.create({
      data: {
        blockId,
        userId,
        targetScope: alignment.targetScope as never,
        taskId: alignment.taskId,
        goalId: alignment.goalId,
        relevance: alignment.relevance as never,
        intentionRelationship: alignment.intentionRelationship as never,
        confidence: null,
        provenance: alignment.intentionRelationship === "ALIGNED" || alignment.intentionRelationship === "DIVERGENT" ? "ACTIVE_SESSION_AFFINITY" : "INFERRED",
        authority: "SYSTEM",
      },
    });

    // Evidence citations
    const evidence = evidenceRows({ claimId: claim.id }, semantics);
    for (const ev of evidence) {
      await tx.claimEvidence.create({ data: { claimId: claim.id, ...ev } });
      result.evidenceCreated++;
    }

    // Attention inference
    await tx.attentionInference.create({
      data: {
        blockId,
        focusEvidenceState: focusState,
        confidence: null,
        provenance: "INFERRED",
        authority: "SYSTEM",
      },
    });
    result.attentionCreated++;
  });

  void validateClaimEvidenceTarget;
  void validateTenantBoundary;
}

async function detectCoverageGaps(
  prisma: PrismaClient,
  userId: string,
  inputs: BlockEngineInput[],
  minGapSeconds: number
): Promise<void> {
  if (inputs.length === 0) return;
  const sorted = [...inputs].sort((a, b) => a.start - b.start);
  const minGapMs = minGapSeconds * 1000;

  const existingGaps = typeof prisma.telemetryCoverageGap?.findMany === "function"
    ? await prisma.telemetryCoverageGap.findMany({
        where: {
          userId,
          startTime: { lte: new Date(sorted[sorted.length - 1]!.end) },
          endTime: { gte: new Date(sorted[0]!.start) },
        },
        select: { startTime: true, endTime: true },
      })
    : [];

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]!;
    const curr = sorted[i]!;
    const gapStart = prev.end;
    const gapEnd = curr.start;
    if (gapEnd - gapStart < minGapMs) continue;

    const overlapping = existingGaps.some(
      (g) => g.startTime.getTime() < gapEnd && g.endTime.getTime() > gapStart
    );
    if (overlapping) continue;

    await prisma.telemetryCoverageGap.create({
      data: {
        userId,
        startTime: new Date(gapStart),
        endTime: new Date(gapEnd),
        durationSeconds: Math.round((gapEnd - gapStart) / 1000),
        coverageState: "UNKNOWN_SILENCE",
        reconciliationState: "UNEXPLAINED",
      },
    });
  }
}

