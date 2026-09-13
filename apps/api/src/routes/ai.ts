import { Router } from "express";
import { AIError, generateRequestSchema } from "@repo/ai";
import { requireAuth } from "../middleware/auth";
import { getAIRuntime, getAIStatus } from "../services/ai/runtime";

export const aiRouter: Router = Router();
aiRouter.use(requireAuth);

function requireRuntime() {
  const runtime = getAIRuntime();
  if (!runtime) {
    throw new AIError("AI is not configured", "config", 503);
  }
  return runtime;
}

aiRouter.get("/status", (_request, response, next) => {
  try {
    response.json(getAIStatus());
  } catch (error) {
    next(error);
  }
});

aiRouter.post("/generate", async (request, response, next) => {
  try {
    const runtime = requireRuntime();
    const input = generateRequestSchema.parse(request.body);
    const result = await runtime.generate(input);
    response.json(result);
  } catch (error) {
    next(error);
  }
});

aiRouter.post("/generate/stream", async (request, response, next) => {
  try {
    const runtime = requireRuntime();
    const input = generateRequestSchema.parse(request.body);
    response.status(200);
    response.setHeader("Content-Type", "text/event-stream");
    response.setHeader("Cache-Control", "no-cache");
    response.setHeader("Connection", "keep-alive");
    response.flushHeaders?.();

    try {
      for await (const chunk of runtime.generateStream(input)) {
        response.write(`data: ${JSON.stringify(chunk)}\n\n`);
      }
    } catch (error) {
      const mapped =
        error instanceof AIError
          ? error
          : new AIError("AI generation failed", "provider", 502);
      response.write(
        `data: ${JSON.stringify({
          error: mapped.message,
          code: mapped.code,
          done: true,
        })}\n\n`,
      );
    }
    response.end();
  } catch (error) {
    next(error);
  }
});
