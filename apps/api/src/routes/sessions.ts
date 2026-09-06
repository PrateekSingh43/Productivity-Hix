import { Router } from "express";
import { sessionCreateSchema, sessionUpdateSchema } from "@repo/validation";
import { requireAuth, userIdFrom } from "../middleware/auth";
import { createSession, listSessions, updateSession } from "../services/sessions/service";

export const sessionsRouter: Router = Router();
sessionsRouter.use(requireAuth);
sessionsRouter.get("/", async (request, response, next) => {
  try {
    response.json(await listSessions(userIdFrom(request)));
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
