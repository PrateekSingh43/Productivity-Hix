import type { IncomingMessage } from "node:http";
import { validateDeviceToken } from "../auth/device-auth";
import { isDevAuthAllowed } from "../../middleware/dev-auth";

export interface WSAuthResult {
  userId: string;
  authSource: "device" | "dev";
}

/**
 * Authenticate a WebSocket connection request.
 *
 * Trust model:
 * 1. If a valid device token is provided via `?token=`, derive userId from it.
 * 2. If dev-auth is allowed (non-production + ALLOW_DEV_AUTH), use a static dev user.
 * 3. Otherwise, reject.
 *
 * A raw `?userId=` query parameter is NEVER accepted as an identity source.
 */
export async function authenticateWSConnection(
  req: IncomingMessage,
): Promise<WSAuthResult | null> {
  const url = new URL(req.url || "", "http://localhost");
  const queryToken = url.searchParams.get("token") || undefined;

  // 1. Validate device token
  if (queryToken && queryToken.startsWith("phix_dt_")) {
    const validated = await validateDeviceToken(queryToken);
    if (validated) {
      return { userId: validated.userId, authSource: "device" };
    }
  }

  // 2. Dev-auth fallback (non-production only)
  if (isDevAuthAllowed()) {
    return {
      userId: "00000000-0000-0000-0000-000000000001",
      authSource: "dev",
    };
  }

  return null;
}
