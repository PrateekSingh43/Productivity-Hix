"use client";

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getBrowserDevUserId, getWebSocketBaseUrl } from "@shared/api/client";
import { sessionQueries } from "../api/queries";
import { taskQueries } from "@features/tasks/api/queries";

/**
 * Hook to maintain real-time WebSocket connection for bidirectional session synchronization.
 * When a session starts, pauses, resumes, or ends (e.g. from the Chrome Extension or API),
 * this hook immediately invalidates the TanStack Query cache so all views update instantaneously.
 */
export function useRealtimeSessionSync(): void {
  const queryClient = useQueryClient();
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    let unmounted = false;

    function connect() {
      if (typeof window === "undefined") return;
      const wsUrl = getWebSocketBaseUrl();
      const devUserId = getBrowserDevUserId();
      const url = devUserId ? `${wsUrl}?userId=${encodeURIComponent(devUserId)}` : wsUrl;

      try {
        const ws = new WebSocket(url);
        wsRef.current = ws;

        ws.onmessage = (event) => {
          if (unmounted) return;
          try {
            const msg = JSON.parse(event.data);
            if (
              msg.type === "session:started" ||
              msg.type === "session:paused" ||
              msg.type === "session:resumed" ||
              msg.type === "session:ended"
            ) {
              void queryClient.invalidateQueries({ queryKey: sessionQueries.all() });
              void queryClient.invalidateQueries({ queryKey: taskQueries.lists() });
              void queryClient.invalidateQueries({ queryKey: ["plans"] });
              void queryClient.invalidateQueries({ queryKey: ["activity"] });
            } else if (msg.type === "preferences:updated") {
              void queryClient.invalidateQueries({ queryKey: ["user-preferences"] });
            }
          } catch {
            // Ignore parse errors from other message types
          }
        };

        ws.onclose = () => {
          wsRef.current = null;
          if (!unmounted) {
            reconnectTimeoutRef.current = setTimeout(connect, 3000);
          }
        };

        ws.onerror = () => {
          try {
            ws.close();
          } catch {}
        };
      } catch {
        if (!unmounted) {
          reconnectTimeoutRef.current = setTimeout(connect, 5000);
        }
      }
    }

    connect();

    return () => {
      unmounted = true;
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch {}
      }
    };
  }, [queryClient]);
}
