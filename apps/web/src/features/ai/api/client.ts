import { apiFetch, jsonBody } from "@shared/api/client";
import type { ConversationDetail, ConversationSummary } from "../types";

export function listConversations(): Promise<ConversationSummary[]> {
  return apiFetch<ConversationSummary[]>("/api/ai/conversations");
}

export function getConversation(conversationId: string): Promise<ConversationDetail> {
  return apiFetch<ConversationDetail>(`/api/ai/conversations/${encodeURIComponent(conversationId)}`);
}

export function createConversation(title?: string): Promise<ConversationSummary> {
  return apiFetch<ConversationSummary>("/api/ai/conversations", jsonBody({ title }));
}

export function deleteConversation(conversationId: string): Promise<{ deleted: true }> {
  return apiFetch<{ deleted: true }>(
    `/api/ai/conversations/${encodeURIComponent(conversationId)}`,
    jsonBody({}, "DELETE"),
  );
}
