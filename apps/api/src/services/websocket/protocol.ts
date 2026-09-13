import { z } from "zod";

// ── Inbound message types (client → server) ──────────────────────────

export const WS_INBOUND_TYPES = ["ai:message", "ping"] as const;
export type WSInboundType = (typeof WS_INBOUND_TYPES)[number];

// ── Outbound message types (server → client) ─────────────────────────

export const WS_OUTBOUND_TYPES = [
  "connection:established",
  "ai:started",
  "ai:delta",
  "ai:completed",
  "ai:error",
  "pong",
  "error",
] as const;
export type WSOutboundType = (typeof WS_OUTBOUND_TYPES)[number];

// ── Inbound schemas ──────────────────────────────────────────────────

export const aiMessageSchema = z.object({
  type: z.literal("ai:message"),
  requestId: z.string().min(1).optional(),
  conversationId: z.string().min(1),
  messageId: z.string().min(1),
  content: z.string().min(1).max(32_000),
});
export type AIMessagePayload = z.infer<typeof aiMessageSchema>;

export const pingSchema = z.object({
  type: z.literal("ping"),
});

export const wsInboundSchema = z.discriminatedUnion("type", [
  aiMessageSchema,
  pingSchema,
]);
export type WSInboundMessage = z.infer<typeof wsInboundSchema>;

// ── Outbound payload helpers ─────────────────────────────────────────

export interface WSOutboundMessage {
  type: WSOutboundType;
  [key: string]: unknown;
}

export function makeAIStarted(
  conversationId: string,
  messageId: string,
  requestId?: string,
): WSOutboundMessage {
  return {
    type: "ai:started",
    ...(requestId ? { requestId } : {}),
    conversationId,
    messageId,
  };
}

export function makeAIDelta(
  conversationId: string,
  messageId: string,
  text: string,
  requestId?: string,
): WSOutboundMessage {
  return {
    type: "ai:delta",
    ...(requestId ? { requestId } : {}),
    conversationId,
    messageId,
    text,
    delta: text,
  };
}

export function makeAICompleted(
  conversationId: string,
  messageId: string,
  finishReason: string = "stop",
  requestId?: string,
): WSOutboundMessage {
  return {
    type: "ai:completed",
    ...(requestId ? { requestId } : {}),
    conversationId,
    messageId,
    finishReason,
  };
}

export function makeAIError(
  conversationId: string,
  messageId: string,
  message: string,
  requestId?: string,
  code: string = "not_implemented",
): WSOutboundMessage {
  return {
    type: "ai:error",
    ...(requestId ? { requestId } : {}),
    conversationId,
    messageId,
    code,
    message,
    error: message,
  };
}
