import { Router } from "express";
import {
  attributionCorrectionCreateSchema,
  attributionCorrectionListQuerySchema,
} from "@repo/validation";
import { requireAuth, userIdFrom } from "../middleware/auth";
import {
  createCorrection,
  listCorrections,
} from "../services/attribution-corrections/service";

export const attributionCorrectionsRouter: Router = Router();
attributionCorrectionsRouter.use(requireAuth);

attributionCorrectionsRouter.get("/", async (request, response, next) => {
  try {
    const query = attributionCorrectionListQuerySchema.parse(request.query);
    response.json(await listCorrections(userIdFrom(request), query));
  } catch (error) {
    next(error);
  }
});

attributionCorrectionsRouter.post("/", async (request, response, next) => {
  try {
    const input = attributionCorrectionCreateSchema.parse(request.body);
    response.status(201).json(await createCorrection(userIdFrom(request), input));
  } catch (error) {
    next(error);
  }
});
