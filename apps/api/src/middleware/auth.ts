import type { RequestHandler } from "express";
import { env } from "../config/env";
import { validateDeviceToken } from "../services/auth/device-auth";
import { tryExtractDevUser } from "./dev-auth";

declare global {
  namespace Express {
    interface Request {
      userId?: string;
      deviceId?: string | null;
      authSource?: "session" | "device" | "dev";
    }
  }
}

export const requireAuth: RequestHandler = async (request, response, next) => {
  // 1. Check Device Token header (x-device-token or Bearer phix_dt_...)
  const authHeader = request.header("authorization");
  const deviceHeader = request.header("x-device-token");
  const rawToken = deviceHeader || (authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : undefined);

  if (rawToken && rawToken.startsWith("phix_dt_")) {
    const validated = await validateDeviceToken(rawToken);
    if (validated) {
      request.userId = validated.userId;
      request.deviceId = validated.deviceId;
      request.authSource = "device";
      next();
      return;
    }
  }

  // 2. Check development user (isolated to non-production when ALLOW_DEV_AUTH is true)
  const devUser = tryExtractDevUser(request);
  if (devUser) {
    request.userId = devUser;
    request.authSource = "dev";
    next();
    return;
  }

  response.status(401).json({ error: "Authentication required" });
};

export function userIdFrom(request: Express.Request) {
  if (!request.userId) throw new Error("Authenticated user is missing");
  return request.userId;
}

