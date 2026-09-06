import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";

export const errorHandler: ErrorRequestHandler = (error, request, response, next) => {
  if (response.headersSent) return next(error);
  if (error instanceof ZodError) {
    response.status(400).json({ error: "Invalid request", details: error.flatten() });
    return;
  }
  if (request.log?.error) {
    request.log.error({ err: error, requestId: request.requestId }, "API request failed");
  } else {
    console.error("API request failed:", error);
  }
  response.status(500).json({ error: "Internal server error", requestId: request.requestId });
};
