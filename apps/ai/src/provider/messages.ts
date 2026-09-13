import { AIError } from "./errors";
import type { ChatMessage, FinishReason, GenerateRequest } from "./types";

export function splitSystemMessages(messages: ChatMessage[]): {
  systemInstruction?: string;
  conversation: ChatMessage[];
} {
  const systemParts = messages
    .filter((message) => message.role === "system")
    .map((message) => message.content.trim())
    .filter(Boolean);
  const conversation = messages.filter((message) => message.role !== "system");
  return {
    systemInstruction: systemParts.length > 0 ? systemParts.join("\n") : undefined,
    conversation,
  };
}

export function assertGenerateRequest(request: GenerateRequest, provider?: "gemini" | "groq"): void {
  if (!request.messages || request.messages.length === 0) {
    throw new AIError("Generation requires at least one message", "invalid_request", 400, provider);
  }
  const hasUserOrAssistant = request.messages.some(
    (message) => message.role === "user" || message.role === "assistant",
  );
  if (!hasUserOrAssistant) {
    throw new AIError(
      "Generation requires a user or assistant message in addition to any system instruction",
      "invalid_request",
      400,
      provider,
    );
  }
}

export function mapFinishReason(value: string | null | undefined): FinishReason {
  const normalized = (value ?? "stop").toLowerCase();
  if (normalized === "length" || normalized === "max_tokens") {
    return "length";
  }
  if (normalized === "tool_calls" || normalized === "function_call") {
    return "tool_calls";
  }
  if (normalized === "content_filter" || normalized === "safety") {
    return "content_filter";
  }
  return "stop";
}
