import { Router } from "express";
import { learningAnswerSchema, learningAssessmentCreateSchema } from "@repo/validation";
import { requireAuth, userIdFrom } from "../middleware/auth";
import { answerQuestion, createAssessment, listAssessments } from "../services/learning/service";

export const learningRouter: Router = Router();
learningRouter.use(requireAuth);
learningRouter.get("/assessments", async (request, response, next) => {
  try {
    response.json(await listAssessments(userIdFrom(request)));
  } catch (error) {
    next(error);
  }
});
learningRouter.post("/assessments", async (request, response, next) => {
  try {
    response
      .status(201)
      .json(
        await createAssessment(
          userIdFrom(request),
          learningAssessmentCreateSchema.parse(request.body),
        ),
      );
  } catch (error) {
    next(error);
  }
});
learningRouter.post("/answers", async (request, response, next) => {
  try {
    const input = learningAnswerSchema.parse(request.body);
    response.json(await answerQuestion(userIdFrom(request), input.questionId, input));
  } catch (error) {
    next(error);
  }
});
