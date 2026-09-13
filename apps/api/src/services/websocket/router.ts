import type { WebSocket } from "ws";
import { wsInboundSchema, makeAIError, type WSOutboundMessage } from "./protocol";

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
export function routeWSMessage(ws: WebSocket, userId: string, raw: string): void {
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
      // Phase 0 stub: AI chat is not yet implemented.
      // Do NOT log raw message content.
      sendJSON(ws, makeAIError(
        message.conversationId,
        message.messageId,
        "AI chat is not yet implemented",
        message.requestId,
        "not_implemented",
      ));
      break;
  }
}

function sendJSON(ws: WebSocket, payload: WSOutboundMessage | Record<string, unknown>): void {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}
