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

async function invalidateUserTimelineCache(userId: string): Promise<void> {
  const db = getDb();
  if (typeof (db as any).temporalActivityBlock?.deleteMany === "function") {
    await (db as any).temporalActivityBlock.deleteMany({ where: { userId } });
  }
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
    const rule = await getDb().userActivityRule.create({
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
    await invalidateUserTimelineCache(userId);
    response.status(201).json({ rule });
  } catch (error) {
    next(error);
  }
});

activityRulesRouter.patch("/rules/:id", async (request, response, next) => {
  try {
    const userId = userIdFrom(request);
    const input = userActivityRuleUpdateSchema.parse(request.body);
    const existing = await getDb().userActivityRule.findFirst({
      where: { id: request.params.id, userId },
      select: { id: true },
    });
    if (!existing) {
      response.status(404).json({ error: "Rule not found" });
      return;
    }
    const rule = await getDb().userActivityRule.update({
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
    await invalidateUserTimelineCache(userId);
    response.json({ rule });
  } catch (error) {
    next(error);
  }
});

activityRulesRouter.delete("/rules/:id", async (request, response, next) => {
  try {
    const userId = userIdFrom(request);
    const existing = await getDb().userActivityRule.findFirst({
      where: { id: request.params.id, userId },
      select: { id: true },
    });
    if (!existing) {
      response.status(404).json({ error: "Rule not found" });
      return;
    }
    await getDb().userActivityRule.delete({ where: { id: existing.id } });
    await invalidateUserTimelineCache(userId);
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
    const override = await getDb().userActivityOverride.create({
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
    await invalidateUserTimelineCache(userId);
    response.status(201).json({ override });
  } catch (error) {
    next(error);
  }
});

activityRulesRouter.delete("/overrides/:id", async (request, response, next) => {
  try {
    const userId = userIdFrom(request);
    const existing = await getDb().userActivityOverride.findFirst({
      where: { id: request.params.id, userId },
      select: { id: true },
    });
    if (!existing) {
      response.status(404).json({ error: "Override not found" });
      return;
    }
    await getDb().userActivityOverride.delete({ where: { id: existing.id } });
    await invalidateUserTimelineCache(userId);
    response.json({ deleted: true });
  } catch (error) {
    next(error);
  }
});

