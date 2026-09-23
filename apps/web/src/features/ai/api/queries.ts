"use client";

import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createConversation, deleteConversation, getConversation, listConversations } from "./client";
import type { ConversationSummary } from "../types";

export const aiQueries = {
  all: () => ["ai"] as const,
  conversations: () =>
    queryOptions({
      queryKey: [...aiQueries.all(), "conversations"] as const,
      queryFn: listConversations,
      staleTime: 30_000,
    }),
  conversation: (conversationId: string) =>
    queryOptions({
      queryKey: [...aiQueries.all(), "conversation", conversationId] as const,
      queryFn: () => getConversation(conversationId),
      enabled: Boolean(conversationId),
      staleTime: 0,
    }),
};

export function useConversations() {
  return useQuery(aiQueries.conversations());
}

export function useConversation(conversationId: string | null) {
  return useQuery(aiQueries.conversation(conversationId ?? ""));
}

/** Mutation invalidation blast radius: only the AI conversation index. */
export function useCreateConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (title?: string) => createConversation(title),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: aiQueries.conversations().queryKey });
    },
  });
}

/** Mutation invalidation blast radius: the AI conversation index and deleted detail. */
export function useDeleteConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (conversationId: string) => deleteConversation(conversationId),
    onSuccess: (_result, conversationId) => {
      queryClient.removeQueries({ queryKey: aiQueries.conversation(conversationId).queryKey });
      queryClient.setQueryData<ConversationSummary[]>(
        aiQueries.conversations().queryKey,
        (current) => current?.filter((conversation) => conversation.id !== conversationId),
      );
      void queryClient.invalidateQueries({ queryKey: aiQueries.conversations().queryKey });
    },
  });
}
