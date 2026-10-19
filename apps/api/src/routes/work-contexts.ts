import { Router } from "express";
import {
  workContextSwitchSchema,
  workContextEndSchema,
  workContextHistoryQuerySchema,
} from "@repo/validation";
import { requireAuth, userIdFrom } from "../middleware/auth";
import {
  switchContext,
  endContext,
  getCurrentContext,
  listContextHistory,
} from "../services/work-contexts/service";

export const workContextsRouter: Router = Router();
workContextsRouter.use(requireAuth);

workContextsRouter.get("/current", async (request, response, next) => {
  try {
    response.json(await getCurrentContext(userIdFrom(request)));
  } catch (error) {
    next(error);
  }
});

workContextsRouter.get("/history", async (request, response, next) => {
  try {
    const query = workContextHistoryQuerySchema.parse(request.query);
    response.json(await listContextHistory(userIdFrom(request), query));
  } catch (error) {
    next(error);
  }
});

workContextsRouter.post("/switch", async (request, response, next) => {
  try {
    const input = workContextSwitchSchema.parse(request.body);
    response.json(await switchContext(userIdFrom(request), input));
  } catch (error) {
    next(error);
  }
});

workContextsRouter.post("/end", async (request, response, next) => {
  try {
    const input = workContextEndSchema.parse(request.body ?? {});
    response.json(await endContext(userIdFrom(request), input));
  } catch (error) {
    next(error);
  }
});
