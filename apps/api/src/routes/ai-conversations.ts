import { Router } from "express";
import { z } from "zod";
import { requireAuth, userIdFrom } from "../middleware/auth";
import {
  createConversation,
  deleteConversation,
  getConversation,
  listConversations,
} from "../services/ai/conversations";

const createConversationSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
});

export const aiConversationsRouter: Router = Router();
aiConversationsRouter.use(requireAuth);

aiConversationsRouter.get("/", async (request, response, next) => {
  try {
    response.json(await listConversations(userIdFrom(request)));
  } catch (error) {
    next(error);
  }
});

aiConversationsRouter.post("/", async (request, response, next) => {
  try {
    const input = createConversationSchema.parse(request.body ?? {});
    response.status(201).json(await createConversation(userIdFrom(request), input.title));
  } catch (error) {
    next(error);
  }
});

aiConversationsRouter.delete("/:conversationId", async (request, response, next) => {
  try {
    response.json(await deleteConversation(userIdFrom(request), request.params.conversationId));
  } catch (error) {
    next(error);
  }
});

aiConversationsRouter.get("/:conversationId", async (request, response, next) => {
  try {
    response.json(await getConversation(userIdFrom(request), request.params.conversationId));
  } catch (error) {
    next(error);
  }
});
