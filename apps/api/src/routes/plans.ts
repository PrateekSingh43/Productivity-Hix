import { Router } from "express";
import { dailyPlanUpsertSchema, goalOutcomeUpdateSchema } from "@repo/validation";
import { resolveProductiveDay, resolveTomorrowProductiveDay } from "@repo/types";
import { requireAuth, userIdFrom } from "../middleware/auth";
import {
  getDayPlan,
  upsertPlan,
  updateGoalOutcome,
  deleteGoal,
} from "../services/plans/service";

export const plansRouter: Router = Router();
plansRouter.use(requireAuth);

plansRouter.get("/today", async (request, response, next) => {
  try {
    const userId = userIdFrom(request);
    const timezone = (request.query.timezone as string) || undefined;
    const boundary = (request.query.boundary as string) || undefined;
    const resolvedDate =
      (request.query.date as string) ||
      resolveProductiveDay(new Date(), { timezone, boundary });

    const plan = await getDayPlan(userId, resolvedDate);
    response.json(plan);
  } catch (error) {
    next(error);
  }
});

plansRouter.get("/tomorrow", async (request, response, next) => {
  try {
    const userId = userIdFrom(request);
    const timezone = (request.query.timezone as string) || undefined;
    const boundary = (request.query.boundary as string) || undefined;
    const resolvedDate =
      (request.query.date as string) ||
      resolveTomorrowProductiveDay(new Date(), { timezone, boundary });

    const plan = await getDayPlan(userId, resolvedDate);
    response.json(plan);
  } catch (error) {
    next(error);
  }
});

plansRouter.get("/:date", async (request, response, next) => {
  try {
    const userId = userIdFrom(request);
    const plan = await getDayPlan(userId, request.params.date);
    response.json(plan);
  } catch (error) {
    next(error);
  }
});

plansRouter.post("/", async (request, response, next) => {
  try {
    const userId = userIdFrom(request);
    const input = dailyPlanUpsertSchema.parse(request.body);
    const plan = await upsertPlan(userId, input);
    response.status(200).json(plan);
  } catch (error) {
    next(error);
  }
});

plansRouter.patch("/goals/:goalId/outcome", async (request, response, next) => {
  try {
    const userId = userIdFrom(request);
    const { outcome } = goalOutcomeUpdateSchema.parse(request.body);
    const goal = await updateGoalOutcome(userId, request.params.goalId, outcome);
    response.json(goal);
  } catch (error) {
    next(error);
  }
});

plansRouter.delete("/goals/:goalId", async (request, response, next) => {
  try {
    const userId = userIdFrom(request);
    await deleteGoal(userId, request.params.goalId);
    response.json({ success: true });
  } catch (error) {
    next(error);
  }
});
