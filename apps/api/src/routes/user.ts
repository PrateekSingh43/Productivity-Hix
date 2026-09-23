import { Router } from "express";
import { userPreferencesUpdateSchema } from "@repo/validation";
import { requireAuth, userIdFrom } from "../middleware/auth";
import { wsManager } from "../services/websocket/server";
import {
  getUserPreferences,
  updateUserPreferences,
} from "../services/user/preferences";

export const userRouter: Router = Router();
userRouter.use(requireAuth);

userRouter.get("/preferences", async (request, response, next) => {
  try {
    const userId = userIdFrom(request);
    const prefs = await getUserPreferences(userId);
    response.json(prefs);
  } catch (error) {
    next(error);
  }
});

const updateHandler = async (request: any, response: any, next: any) => {
  try {
    const userId = userIdFrom(request);
    const patch = userPreferencesUpdateSchema.parse(request.body);
    const updated = await updateUserPreferences(userId, patch);
    wsManager.broadcastToUser(userId, {
      type: "preferences:updated",
      preferences: updated,
    });
    response.json(updated);
  } catch (error) {
    next(error);
  }
};

userRouter.patch("/preferences", updateHandler);
userRouter.post("/preferences", updateHandler);
userRouter.put("/preferences", updateHandler);

