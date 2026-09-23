import { Router } from "express";
import { requireAuth, userIdFrom } from "../middleware/auth";
import { getPersistedPatterns, requestPatternAnalysis, resolveWindow, runInsightPipeline } from "../services/patterns/service";

export const patternsRouter: Router = Router();
export const insightsRouter: Router = Router();
patternsRouter.use(requireAuth);
insightsRouter.use(requireAuth);

patternsRouter.get("/", async (request, response, next) => {
  try {
    const window = resolveWindow(request.query.from, request.query.to);
    response.json(await getPersistedPatterns(userIdFrom(request), window));
  } catch (error) {
    next(error);
  }
});

patternsRouter.post("/analyze", async (request, response, next) => {
  try {
    const window = resolveWindow(request.body?.from, request.body?.to);
    const targetDetectors = request.body?.targetDetectors;
    if (targetDetectors !== undefined && !Array.isArray(targetDetectors)) {
      response.status(400).json({ error: "targetDetectors must be an array of detector identities." });
      return;
    }
    const result = await requestPatternAnalysis(userIdFrom(request), window, targetDetectors);
    response.status(202).json(result);
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
