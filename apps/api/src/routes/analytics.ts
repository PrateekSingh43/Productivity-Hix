import { Router } from "express";
import { requireAuth, userIdFrom } from "../middleware/auth";
import { dailyAnalytics } from "../services/analytics/service";

export const analyticsRouter: Router = Router();
analyticsRouter.use(requireAuth);
analyticsRouter.get("/daily", async (request, response, next) => {
  try {
    response.json(await dailyAnalytics(userIdFrom(request)));
  } catch (error) {
    next(error);
  }
});
