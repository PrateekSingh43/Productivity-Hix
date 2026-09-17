import { Router } from "express";
import { requireAuth, userIdFrom } from "../middleware/auth";
import { resolveWindow, runInsightPipeline, runPatternPipeline } from "../services/patterns/service";

export const patternsRouter: Router = Router();
export const insightsRouter: Router = Router();
patternsRouter.use(requireAuth);
insightsRouter.use(requireAuth);

patternsRouter.get("/", async (request, response, next) => {
  try {
    const window = resolveWindow(request.query.from, request.query.to);
    response.json(await runPatternPipeline(userIdFrom(request), window));
  } catch (error) {
    next(error);
  }
});

insightsRouter.get("/", async (request, response, next) => {
  try {
    const window = resolveWindow(request.query.from, request.query.to);
    response.json(await runInsightPipeline(userIdFrom(request), window));
  } catch (error) {
    next(error);
  }
});
