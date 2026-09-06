import { Router } from "express";
import { activityRangeSchema } from "@repo/validation";
import { requireAuth, userIdFrom } from "../middleware/auth";
import {
  activityInRange,
  activitySummary,
  syncActivity,
  utcDayRange,
  getTimelineForDay,
} from "../services/activity/service";

export const activityRouter: Router = Router();
activityRouter.use(requireAuth);

activityRouter.get("/timeline", async (request, response, next) => {
  try {
    const dateStr = typeof request.query.date === "string" ? request.query.date : undefined;
    const timezone = typeof request.query.timezone === "string" ? request.query.timezone : undefined;
    response.json(await getTimelineForDay(userIdFrom(request), dateStr, timezone));
  } catch (error) {
    next(error);
  }
});

activityRouter.get("/today", async (request, response, next) => {
  try {
    const range = utcDayRange();
    response.json(await activityInRange(userIdFrom(request), range.from, range.to));
  } catch (error) {
    next(error);
  }
});
activityRouter.get("/range", async (request, response, next) => {
  try {
    const range = activityRangeSchema.parse(request.query);
    response.json(await activityInRange(userIdFrom(request), range.from, range.to));
  } catch (error) {
    next(error);
  }
});
activityRouter.get("/summary", async (request, response, next) => {
  try {
    const range =
      request.query.from && request.query.to
        ? activityRangeSchema.parse(request.query)
        : utcDayRange();
    response.json(await activitySummary(userIdFrom(request), range.from, range.to));
  } catch (error) {
    next(error);
  }
});
activityRouter.get("/sessions", async (request, response, next) => {
  try {
    const range =
      request.query.from && request.query.to
        ? activityRangeSchema.parse(request.query)
        : utcDayRange();
    const events = await activityInRange(userIdFrom(request), range.from, range.to);
    response.json((await import("@repo/analytics")).deriveSessions(events));
  } catch (error) {
    next(error);
  }
});
activityRouter.post("/sync", async (request, response, next) => {
  try {
    request.log.info("Activity sync requested");
    response.json(await syncActivity(userIdFrom(request)));
  } catch (error) {
    next(error);
  }
});
