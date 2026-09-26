import { Router } from "express";
import { sessionCreateSchema, sessionUpdateSchema, sessionListQuerySchema } from "@repo/validation";
import { requireAuth, userIdFrom } from "../middleware/auth";
import {
  createSession,
  listSessions,
  getActiveSession,
  pauseSession,
  resumeSession,
  updateSession,
  deleteSession,
} from "../services/sessions/service";

export const sessionsRouter: Router = Router();
sessionsRouter.use(requireAuth);

sessionsRouter.get("/", async (request, response, next) => {
  try {
    const query = sessionListQuerySchema.parse(request.query);
    response.json(await listSessions(userIdFrom(request), query));
  } catch (error) {
    next(error);
  }
});

sessionsRouter.get("/active", async (request, response, next) => {
  try {
    const active = await getActiveSession(userIdFrom(request));
    response.json(active);
  } catch (error) {
    next(error);
  }
});

sessionsRouter.post("/", async (request, response, next) => {
  try {
    response
      .status(201)
      .json(await createSession(userIdFrom(request), sessionCreateSchema.parse(request.body)));
  } catch (error) {
    next(error);
  }
});

sessionsRouter.post("/:id/pause", async (request, response, next) => {
  try {
    response.json(await pauseSession(userIdFrom(request), request.params.id));
  } catch (error) {
    next(error);
  }
});

sessionsRouter.post("/:id/resume", async (request, response, next) => {
  try {
    response.json(await resumeSession(userIdFrom(request), request.params.id));
  } catch (error) {
    next(error);
  }
});

sessionsRouter.patch("/:id", async (request, response, next) => {
  try {
    response.json(
      await updateSession(
        userIdFrom(request),
        request.params.id,
        sessionUpdateSchema.parse(request.body),
      ),
    );
  } catch (error) {
    next(error);
  }
});

sessionsRouter.delete("/:id", async (request, response, next) => {
  try {
    response.json(await deleteSession(userIdFrom(request), request.params.id));
  } catch (error) {
    next(error);
  }
});
