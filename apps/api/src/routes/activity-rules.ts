import { Router } from "express";
import {
  userActivityRuleCreateSchema,
  userActivityRuleUpdateSchema,
  userOverrideCreateSchema,
} from "@repo/validation";
import { requireAuth, userIdFrom } from "../middleware/auth";
import { getDb } from "../lib/prisma";

export const activityRulesRouter: Router = Router();

activityRulesRouter.use(requireAuth);

/**
 * Transactional helper to record rule revision and publish outbox event.
 * Invariant: Never deletes historical activity blocks. Marks state STALE for background recomputation.
 */
async function emitRuleChangedEventTx(
  tx: any,
  params: {
    userId: string;
    correlationId: string;
    targetWindow?: { start?: Date | null; end?: Date | null };
  }
): Promise<void> {
  const now = new Date();
  const hasValidStart = params.targetWindow?.start instanceof Date && !isNaN(params.targetWindow.start.getTime());
  const hasValidEnd = params.targetWindow?.end instanceof Date && !isNaN(params.targetWindow.end.getTime());

  const localDate = hasValidStart
    ? params.targetWindow!.start!.toISOString().slice(0, 10)
    : now.toISOString().slice(0, 10);

  const startIso = hasValidStart
    ? params.targetWindow!.start!.toISOString()
    : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();

  const endIso = hasValidEnd
    ? params.targetWindow!.end!.toISOString()
    : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999)).toISOString();

  const dayState = await tx.timelineDayState.upsert({
    where: { userId_localDate: { userId: params.userId, localDate } },
    create: {
      userId: params.userId,
      localDate,
      currentObservationRevision: 0,
      currentRuleRevision: 1,
      status: "STALE",
    },
    update: {
      currentRuleRevision: { increment: 1 },
      status: "STALE",
      updatedAt: now,
    },
  });

  await tx.outboxEvent.create({
    data: {
      eventType: "rule.changed",
      aggregateType: "user",
      aggregateId: params.userId,
      payload: {
        userId: params.userId,
        localDate,
        sourceRevision: dayState.currentObservationRevision,
        scope: {
          start: startIso,
          end: endIso,
        },
        reason: "rule_changed",
        ruleRevision: dayState.currentRuleRevision,
      },
      correlationId: params.correlationId,
      causationId: null,
      schemaVersion: "1.0.0",
      occurredAt: now,
      status: "PENDING",
      publicationAttemptCount: 0,
      maxAttempts: 5,
      availableAt: now,
    },
  });
}

activityRulesRouter.get("/rules", async (request, response, next) => {
  try {
    const userId = userIdFrom(request);
    const rules = await getDb().userActivityRule.findMany({
      where: { userId },
      orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
    });
    response.json({ rules });
  } catch (error) {
    next(error);
  }
});

activityRulesRouter.post("/rules", async (request, response, next) => {
  try {
    const userId = userIdFrom(request);
    const input = userActivityRuleCreateSchema.parse(request.body);
    const correlationId =
      (request.headers["x-correlation-id"] as string) ||
      `corr-rule-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    const rule = await getDb().$transaction(async (tx) => {
      const created = await tx.userActivityRule.create({
        data: {
          userId,
          name: input.name,
          priority: input.priority,
          isEnabled: input.isEnabled,
          applicationPattern: input.applicationPattern ?? null,
          domainPattern: input.domainPattern ?? null,
          titlePattern: input.titlePattern ?? null,
          urlPattern: input.urlPattern ?? null,
          assignedModality: input.assignedModality ?? null,
          assignedContext: input.assignedContext ?? null,
          defaultRelevance: input.defaultRelevance ?? null,
        },
      });

      await emitRuleChangedEventTx(tx, { userId, correlationId });
      return created;
    });

    response.status(201).json({ rule });
  } catch (error) {
    next(error);
  }
});

activityRulesRouter.patch("/rules/:id", async (request, response, next) => {
  try {
    const userId = userIdFrom(request);
    const input = userActivityRuleUpdateSchema.parse(request.body);
    const correlationId =
      (request.headers["x-correlation-id"] as string) ||
      `corr-rule-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    const existing = await getDb().userActivityRule.findFirst({
      where: { id: request.params.id, userId },
      select: { id: true },
    });
    if (!existing) {
      response.status(404).json({ error: "Rule not found" });
      return;
    }

    const rule = await getDb().$transaction(async (tx) => {
      const updated = await tx.userActivityRule.update({
        where: { id: existing.id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.priority !== undefined ? { priority: input.priority } : {}),
          ...(input.isEnabled !== undefined ? { isEnabled: input.isEnabled } : {}),
          ...(input.applicationPattern !== undefined ? { applicationPattern: input.applicationPattern } : {}),
          ...(input.domainPattern !== undefined ? { domainPattern: input.domainPattern } : {}),
          ...(input.titlePattern !== undefined ? { titlePattern: input.titlePattern } : {}),
          ...(input.urlPattern !== undefined ? { urlPattern: input.urlPattern } : {}),
          ...(input.assignedModality !== undefined ? { assignedModality: input.assignedModality } : {}),
          ...(input.assignedContext !== undefined ? { assignedContext: input.assignedContext } : {}),
          ...(input.defaultRelevance !== undefined ? { defaultRelevance: input.defaultRelevance } : {}),
        },
      });

      await emitRuleChangedEventTx(tx, { userId, correlationId });
      return updated;
    });

    response.json({ rule });
  } catch (error) {
    next(error);
  }
});

activityRulesRouter.delete("/rules/:id", async (request, response, next) => {
  try {
    const userId = userIdFrom(request);
    const correlationId =
      (request.headers["x-correlation-id"] as string) ||
      `corr-rule-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    const existing = await getDb().userActivityRule.findFirst({
      where: { id: request.params.id, userId },
      select: { id: true },
    });
    if (!existing) {
      response.status(404).json({ error: "Rule not found" });
      return;
    }

    await getDb().$transaction(async (tx) => {
      await tx.userActivityRule.delete({ where: { id: existing.id } });
      await emitRuleChangedEventTx(tx, { userId, correlationId });
    });

    response.json({ deleted: true });
  } catch (error) {
    next(error);
  }
});

activityRulesRouter.get("/overrides", async (request, response, next) => {
  try {
    const userId = userIdFrom(request);
    const overrides = await getDb().userActivityOverride.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    response.json({ overrides });
  } catch (error) {
    next(error);
  }
});

activityRulesRouter.post("/overrides", async (request, response, next) => {
  try {
    const userId = userIdFrom(request);
    const input = userOverrideCreateSchema.parse(request.body);
    const start = new Date(input.targetTimeWindowStart);
    const end = new Date(input.targetTimeWindowEnd);
    if (end.getTime() <= start.getTime()) {
      response.status(400).json({ error: "targetTimeWindowEnd must be after targetTimeWindowStart" });
      return;
    }

    const correlationId =
      (request.headers["x-correlation-id"] as string) ||
      `corr-override-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    const override = await getDb().$transaction(async (tx) => {
      const created = await tx.userActivityOverride.create({
        data: {
          userId,
          targetTimeWindowStart: start,
          targetTimeWindowEnd: end,
          targetApplication: input.targetApplication,
          targetClaimFamily: input.targetClaimFamily,
          targetClaimType: input.targetClaimType,
          overriddenValue: input.overriddenValue,
          reason: input.reason ?? null,
        },
      });

      await emitRuleChangedEventTx(tx, {
        userId,
        correlationId,
        targetWindow: { start, end },
      });

      return created;
    });

    response.status(201).json({ override });
  } catch (error) {
    next(error);
  }
});

activityRulesRouter.delete("/overrides/:id", async (request, response, next) => {
  try {
    const userId = userIdFrom(request);
    const correlationId =
      (request.headers["x-correlation-id"] as string) ||
      `corr-override-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    const existing = await getDb().userActivityOverride.findFirst({
      where: { id: request.params.id, userId },
      select: { id: true, targetTimeWindowStart: true, targetTimeWindowEnd: true },
    });
    if (!existing) {
      response.status(404).json({ error: "Override not found" });
      return;
    }

    await getDb().$transaction(async (tx) => {
      await tx.userActivityOverride.delete({ where: { id: existing.id } });
      await emitRuleChangedEventTx(tx, {
        userId,
        correlationId,
        targetWindow: {
          start: existing.targetTimeWindowStart,
          end: existing.targetTimeWindowEnd,
        },
      });
    });

    response.json({ deleted: true });
  } catch (error) {
    next(error);
  }
});
