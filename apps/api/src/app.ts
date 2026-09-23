import "dotenv/config";
import cors from "cors";
import express, { type Express } from "express";
import helmet from "helmet";
import pinoHttp from "pino-http";
import { env } from "./config/env";
import { errorHandler } from "./middleware/error-handler";
import { requestId } from "./middleware/request-id";
import { healthRouter } from "./routes/health";
import { authRouter } from "./routes/auth";
import { tasksRouter } from "./routes/tasks";
import { plansRouter } from "./routes/plans";
import { sessionsRouter } from "./routes/sessions";
import { checkInsRouter } from "./routes/check-ins";
import { learningRouter } from "./routes/learning";
import { activityRouter } from "./routes/activity";
import { analyticsRouter } from "./routes/analytics";
import { patternsRouter, insightsRouter } from "./routes/patterns";
import { telemetryRouter } from "./routes/telemetry";
import { activityRulesRouter } from "./routes/activity-rules";
import { exportRouter } from "./routes/export";
import { userRouter } from "./routes/user";
import { aiRouter } from "./routes/ai";
import { aiConversationsRouter } from "./routes/ai-conversations";

export function createApp(): Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(helmet());
  const configuredOrigins = env.WEB_ORIGIN.split(",").map((o) => o.trim().replace(/\/$/, "")).filter(Boolean);
  const allowedOrigins = new Set([
    ...configuredOrigins,
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
  ]);
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || allowedOrigins.has(origin.replace(/\/$/, ""))) {
          return callback(null, true);
        }
        return callback(null, false);
      },
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(requestId);
  app.use(pinoHttp());
  app.get("/", (_request, response) => response.json({ service: "productivehix-api" }));
  app.use("/api/health", healthRouter);
  app.use("/api/auth", authRouter);
  app.use("/api/user", userRouter);
  app.use("/api/plans", plansRouter);
  app.use("/api/tasks", tasksRouter);
  app.use("/api/sessions", sessionsRouter);
  app.use("/api/check-ins", checkInsRouter);
  app.use("/api/learning", learningRouter);
  app.use("/api/activity", activityRouter);
  app.use("/api/analytics", analyticsRouter);
  app.use("/api/patterns", patternsRouter);
  app.use("/api/insights", insightsRouter);
  app.use("/api/telemetry", telemetryRouter);
  app.use("/api/activity-rules", activityRulesRouter);
  app.use("/api/export", exportRouter);
  app.use("/api/ai", aiRouter);
  app.use("/api/ai/conversations", aiConversationsRouter);
  app.use(errorHandler);
  return app;
}
