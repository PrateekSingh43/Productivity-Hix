import type { WebSocket } from "ws";
import { handleAIMessage } from "./ai-handler";
import { wsInboundSchema, type WSOutboundMessage } from "./protocol";

/**
 * Route a validated inbound WebSocket message to the appropriate handler.
 *
 * Routing by namespace prefix:
 *   "ai:*"  → AI handler boundary (stub in Phase 0)
 *   "ping"  → pong
 *   unknown → error
 *
 * The router does NOT import any AI provider code — it delegates.
 */
export async function routeWSMessage(ws: WebSocket, userId: string, raw: string): Promise<void> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    sendJSON(ws, { type: "error", error: "Invalid JSON" });
    return;
  }

  const result = wsInboundSchema.safeParse(parsed);
  if (!result.success) {
    const typeValue = (parsed as Record<string, unknown>)?.type;
    sendJSON(ws, {
      type: "error",
      error: typeof typeValue === "string" ? `Unknown or invalid message type: ${typeValue}` : "Invalid message format",
    });
    return;
  }

  const message = result.data;

  switch (message.type) {
    case "ping":
      sendJSON(ws, { type: "pong", timestamp: new Date().toISOString() });
      break;

    case "ai:message":
      // Do not log raw message content. The handler owns persistence and
      // provider streaming so malformed or unauthorised conversations never
      // reach the model.
      await handleAIMessage(ws, userId, message);
      break;
  }
}

function sendJSON(ws: WebSocket, payload: WSOutboundMessage | Record<string, unknown>): void {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}
