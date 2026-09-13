import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { AIError } from "@repo/ai";

export const errorHandler: ErrorRequestHandler = (error, request, response, next) => {
  if (response.headersSent) return next(error);
  if (error instanceof ZodError) {
    response.status(400).json({ error: "Invalid request", details: error.flatten() });
    return;
  }
  if (error instanceof AIError || error?.name === "AIError") {
    const statusCode = error.statusCode ?? error.status ?? 500;
    if (request.log?.error) {
      request.log.error({ err: error, requestId: request.requestId }, "AI request failed");
    } else {
      console.error("AI request failed:", error);
    }
    response.status(statusCode).json({
      error: error.message,
      code: error.code,
      requestId: request.requestId,
    });
    return;
  }
  const statusCode =
    typeof error?.statusCode === "number"
      ? error.statusCode
      : typeof error?.status === "number"
        ? error.status
        : 500;

  if (request.log?.error) {
    request.log.error({ err: error, requestId: request.requestId }, "API request failed");
  } else {
    console.error("API request failed:", error);
  }
  response
    .status(statusCode)
    .json({
      error: statusCode < 500 || statusCode === 503 ? error.message : "Internal server error",
      requestId: request.requestId,
    });
};
