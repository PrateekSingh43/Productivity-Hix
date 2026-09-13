import { Router } from "express";
import { requireAuth, userIdFrom } from "../middleware/auth";
import { dailyAnalytics } from "../services/analytics/service";

export const analyticsRouter: Router = Router();
analyticsRouter.use(requireAuth);
analyticsRouter.get("/daily", async (request, response, next) => {
  try {
    const date = (request.query.date as string) || undefined;
    const timezone = (request.query.timezone as string) || undefined;
    response.json(await dailyAnalytics(userIdFrom(request), date, timezone));
  } catch (error) {
    next(error);
  }
});
