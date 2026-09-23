import type { WebSocket } from "ws";
import { AIRuntime, AIError, type ChatMessage } from "@repo/ai";
import { getAIRuntime } from "../ai/runtime";
import {
  appendAssistantMessage,
  appendUserMessage,
  getGenerationMessages,
} from "../ai/conversations";
import {
  makeAIDelta,
  makeAICompleted,
  makeAIError,
  makeAIStarted,
  type AIMessagePayload,
  type WSOutboundMessage,
} from "./protocol";
import { PRODUCTIVEHIX_SYSTEM_PROMPT } from "../ai/prompt";

function sendJSON(ws: WebSocket, payload: WSOutboundMessage): void {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(payload));
}

/**
 * Streams one authenticated conversation turn and persists the final answer.
 * The only model context is the bounded durable transcript plus a grounding
 * instruction; raw telemetry is never read or placed in the provider request.
 */
export async function handleAIMessage(
  ws: WebSocket,
  userId: string,
  message: AIMessagePayload,
): Promise<void> {
  sendJSON(ws, makeAIStarted(message.conversationId, message.messageId, message.requestId));

  try {
    await appendUserMessage(
      userId,
      message.conversationId,
      message.messageId,
      message.content,
    );

    const runtime = getAIRuntime();
    if (!runtime) {
      sendJSON(
        ws,
        makeAIError(
          message.conversationId,
          message.messageId,
          "AI is not configured. Add a provider key to apps/ai/.env.",
          message.requestId,
          "config",
        ),
      );
      return;
    }

    const transcript = await getGenerationMessages(userId, message.conversationId);
    const messages: ChatMessage[] = [
      { role: "system", content: PRODUCTIVEHIX_SYSTEM_PROMPT },
      ...transcript,
    ];
    let answer = "";
    let finishReason = "stop";

    for await (const chunk of runtime.generateStream({ messages })) {
      if (chunk.text) {
        answer += chunk.text;
        sendJSON(
          ws,
          makeAIDelta(
            message.conversationId,
            message.messageId,
            chunk.text,
            message.requestId,
          ),
        );
      }
      if (chunk.done) break;
    }

    const providerInfo = runtime.getProviderInfo();
    await appendAssistantMessage(
      userId,
      message.conversationId,
      `${message.messageId}:assistant`,
      answer,
      {
        provider: providerInfo.provider,
        model: providerInfo.model,
        finishReason,
      },
    );
    sendJSON(
      ws,
      makeAICompleted(
        message.conversationId,
        message.messageId,
        finishReason,
        message.requestId,
      ),
    );
  } catch (error) {
    const messageText =
      error instanceof AIError
        ? error.message
        : error instanceof Error && error.name === "ConversationNotFoundError"
          ? "Conversation not found"
          : "AI generation failed. Please try again.";
    const code = error instanceof AIError ? error.code : "provider";
    sendJSON(
      ws,
      makeAIError(
        message.conversationId,
        message.messageId,
        messageText,
        message.requestId,
        code,
      ),
    );
  }
}
