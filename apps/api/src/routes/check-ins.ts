import { Router } from "express";
import { checkInCreateSchema } from "@repo/validation";
import { requireAuth, userIdFrom } from "../middleware/auth";
import { createCheckIn, listCheckIns, getCheckInPatterns } from "../services/check-ins/service";
import { wsManager } from "../services/websocket/server";

export const checkInsRouter: Router = Router();
checkInsRouter.use(requireAuth);

checkInsRouter.get("/", async (request, response, next) => {
  try {
    response.json(await listCheckIns(userIdFrom(request)));
  } catch (error) {
    next(error);
  }
});

checkInsRouter.get("/patterns", async (request, response, next) => {
  try {
    response.json(await getCheckInPatterns(userIdFrom(request)));
  } catch (error) {
    next(error);
  }
});

checkInsRouter.post("/", async (request, response, next) => {
  try {
    const userId = userIdFrom(request);
    const parsed = checkInCreateSchema.parse(request.body);
    const checkIn = await createCheckIn(userId, parsed);

    // Presentation broadcast to live Web UI
    wsManager.broadcastToUser(userId, {
      type: "checkin:created",
      checkIn,
      timestamp: new Date().toISOString(),
    });

    response.status(201).json(checkIn);
  } catch (error) {
    next(error);
  }
});
