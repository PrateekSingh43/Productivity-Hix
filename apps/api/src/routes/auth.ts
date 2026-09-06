import { Router } from "express";
import { requireAuth, userIdFrom } from "../middleware/auth";
import { isDevAuthAllowed } from "../middleware/dev-auth";
import { env } from "../config/env";
import { authConfiguration, ensureUser } from "../services/auth/service";
import {
  createDeviceAuthorization,
  verifyDeviceAuthorization,
  exchangeDeviceToken,
  createExtensionDevToken,
} from "../services/auth/device-auth";
import {
  deviceCodeRequestSchema,
  deviceVerifySchema,
  deviceTokenRequestSchema,
} from "@repo/validation";
import { wsManager } from "../services/websocket/server";

export const authRouter: Router = Router();

authRouter.get("/providers", (_request, response) => {
  response.json(authConfiguration());
});

authRouter.get("/me", requireAuth, async (request, response, next) => {
  try {
    const user = await ensureUser(userIdFrom(request));
    response.json({
      authenticated: true,
      user: {
        id: user.id,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        createdAt: user.createdAt.toISOString(),
      },
      providers: authConfiguration().providers,
    });
  } catch (error) {
    next(error);
  }
});

// RFC 8628: Request device pairing code
authRouter.post("/device/code", async (request, response, next) => {
  try {
    const parsed = deviceCodeRequestSchema.parse(request.body);
    const result = await createDeviceAuthorization(parsed);
    response.json(result);
  } catch (error) {
    next(error);
  }
});

// User authorizes device code in Web UI
authRouter.post("/device/verify", requireAuth, async (request, response, next) => {
  try {
    const userId = userIdFrom(request);
    const parsed = deviceVerifySchema.parse(request.body);
    const result = await verifyDeviceAuthorization(userId, parsed);

    // Broadcast live event over WebSocket to user's connected UI
    wsManager.broadcastToUser(userId, {
      type: "device:authorized",
      userCode: parsed.userCode,
      timestamp: new Date().toISOString(),
    });

    response.json(result);
  } catch (error) {
    next(error);
  }
});

// Desktop agent polls for token
authRouter.post("/device/token", async (request, response, next) => {
  try {
    const parsed = deviceTokenRequestSchema.parse(request.body);
    const result = await exchangeDeviceToken(parsed);

    if (result.status === 200) {
      response.json(result.credentials);
    } else {
      response.status(result.status).json({ error: result.error });
    }
  } catch (error) {
    next(error);
  }
});

// Deterministic DEV authentication for local browser extension
authRouter.post("/extension/dev-token", async (request, response, next) => {
  try {
    if (!isDevAuthAllowed()) {
      response.status(403).json({ error: "Development auth is disabled in this environment" });
      return;
    }
    const { installationId, clientName, browser } = request.body || {};
    if (!installationId || typeof installationId !== "string") {
      response.status(400).json({ error: "installationId is required" });
      return;
    }
    const credentials = await createExtensionDevToken({ installationId, clientName, browser });
    console.log(`[DEV AUTH] Generated extension device token for installation: ${installationId}`);
    response.json(credentials);
  } catch (error) {
    next(error);
  }
});


