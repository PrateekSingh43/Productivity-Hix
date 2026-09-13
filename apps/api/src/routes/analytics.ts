import { Router } from "express";
import { requireAuth, userIdFrom } from "../middleware/auth";
import { dailyAnalytics } from "../services/analytics/service";
import { assertDuckDBReady } from "../services/data/duckdb";

export const analyticsRouter: Router = Router();
analyticsRouter.use(requireAuth);
analyticsRouter.use((_req, _res, next) => {
  try {
    assertDuckDBReady();
    next();
  } catch (error) {
    next(error);
  }
});

analyticsRouter.get("/daily", async (request, response, next) => {
  try {
    const date = (request.query.date as string) || undefined;
    const timezone = (request.query.timezone as string) || undefined;
    response.json(await dailyAnalytics(userIdFrom(request), date, timezone));
  } catch (error) {
    next(error);
  }
});
