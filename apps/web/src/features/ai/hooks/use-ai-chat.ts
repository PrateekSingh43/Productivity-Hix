"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getWebSocketBaseUrl } from "@shared/api/client";
import { aiQueries } from "../api/queries";
import type { ConversationDetail } from "../types";

interface AIEvent {
  type: string;
  conversationId?: string;
  messageId?: string;
  text?: string;
  message?: string;
  error?: string;
}

export function useAIChat(conversationId: string | null) {
  const queryClient = useQueryClient();
  const socketRef = useRef<WebSocket | null>(null);
  const activeGenerationRef = useRef<{ conversationId: string; messageId: string } | null>(null);
  const streamingTextRef = useRef("");
  const streamingFrameRef = useRef<number | null>(null);
  const [connected, setConnected] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const resetStreamingText = useCallback(() => {
    if (streamingFrameRef.current !== null) {
      cancelAnimationFrame(streamingFrameRef.current);
      streamingFrameRef.current = null;
    }
    streamingTextRef.current = "";
    setStreamingText("");
  }, []);

  const appendStreamingText = useCallback((text: string) => {
    if (!text) return;
    streamingTextRef.current += text;
    if (streamingFrameRef.current !== null) return;

    streamingFrameRef.current = requestAnimationFrame(() => {
      streamingFrameRef.current = null;
      setStreamingText(streamingTextRef.current);
    });
  }, []);

  useEffect(() => {
    let disposed = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let reconnectAttempt = 0;

    const clearGeneration = (nextError?: string) => {
      activeGenerationRef.current = null;
      setStreamingMessageId(null);
      resetStreamingText();
      if (nextError) setError(nextError);
    };

    const connect = () => {
      if (disposed) return;

      const socket = new WebSocket(getWebSocketBaseUrl());
      socketRef.current = socket;

      socket.onopen = () => {
        reconnectAttempt = 0;
        setConnected(true);
        setError(null);
      };

      socket.onclose = () => {
        if (socketRef.current !== socket) return;
        socketRef.current = null;
        setConnected(false);
        if (activeGenerationRef.current) {
          clearGeneration("The AI connection closed before the response finished. Try sending again.");
        }

        if (!disposed) {
          const delay = Math.min(1_000 * 2 ** reconnectAttempt, 5_000);
          reconnectAttempt += 1;
          reconnectTimer = setTimeout(connect, delay);
        }
      };

      socket.onerror = () => {
        setError("The AI connection is unavailable. Reconnecting…");
      };

      socket.onmessage = (event) => {
        let payload: AIEvent;
        try {
          payload = JSON.parse(event.data) as AIEvent;
        } catch {
          clearGeneration("The AI connection returned an invalid response.");
          return;
        }

        if (payload.type === "ai:started") {
          if (payload.messageId) {
            activeGenerationRef.current = {
              conversationId: payload.conversationId ?? "",
              messageId: payload.messageId,
            };
          }
          setStreamingMessageId(payload.messageId ?? null);
          resetStreamingText();
          setError(null);
        } else if (payload.type === "ai:delta") {
          if (!activeGenerationRef.current || activeGenerationRef.current.messageId === payload.messageId) {
            appendStreamingText(payload.text ?? "");
          }
        } else if (payload.type === "ai:completed") {
          if (payload.conversationId) {
            void queryClient.invalidateQueries({
              queryKey: aiQueries.conversation(payload.conversationId).queryKey,
            });
          }
          void queryClient.invalidateQueries({ queryKey: aiQueries.conversations().queryKey });
          clearGeneration();
        } else if (payload.type === "ai:error") {
          clearGeneration(payload.message ?? payload.error ?? "AI generation failed.");
        }
      };
    };

    connect();

    return () => {
      disposed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      socketRef.current?.close();
      socketRef.current = null;
      if (streamingFrameRef.current !== null) cancelAnimationFrame(streamingFrameRef.current);
      streamingFrameRef.current = null;
    };
  }, [appendStreamingText, queryClient, resetStreamingText]);

  const sendMessage = useCallback(
    (content: string, targetConversationId = conversationId) => {
      const normalized = content.trim();
      if (!targetConversationId || !normalized) return false;
      const socket = socketRef.current;
      if (activeGenerationRef.current) {
        setError("The chat is still connecting or finishing the previous response.");
        return false;
      }
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        setError("The AI connection is still starting. Try again in a moment.");
        return false;
      }

      const messageId = crypto.randomUUID();
      const current = queryClient.getQueryData<ConversationDetail>(
        aiQueries.conversation(targetConversationId).queryKey,
      );
      const now = new Date().toISOString();
      queryClient.setQueryData<ConversationDetail>(
        aiQueries.conversation(targetConversationId).queryKey,
        {
          id: targetConversationId,
          title: current?.title ?? normalized.slice(0, 120),
          createdAt: current?.createdAt ?? now,
          updatedAt: now,
          messageCount: (current?.messageCount ?? 0) + 1,
          messages: [
            ...(current?.messages ?? []),
            {
              id: messageId,
              role: "user",
              content: normalized,
              provider: null,
              model: null,
              finishReason: null,
              createdAt: now,
            },
          ],
        },
      );
      setError(null);
      activeGenerationRef.current = { conversationId: targetConversationId, messageId };
      setStreamingMessageId(messageId);
      resetStreamingText();
      try {
        socket.send(
          JSON.stringify({
            type: "ai:message",
            conversationId: targetConversationId,
            messageId,
            content: normalized,
          }),
        );
      } catch {
        activeGenerationRef.current = null;
        setStreamingMessageId(null);
        resetStreamingText();
        setError("The AI connection closed before your message was sent. Try again.");
        return false;
      }
      return true;
    },
    [conversationId, queryClient, resetStreamingText],
  );

  return {
    connected,
    error,
    streamingMessageId,
    streamingText,
    sendMessage,
  };
}
