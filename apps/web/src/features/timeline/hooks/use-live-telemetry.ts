"use client";

import { useEffect, useState, useRef } from "react";
import { getBrowserDevUserId, getWebSocketBaseUrl } from "@shared/api/client";

export interface LiveTelemetryState {
  connected: boolean;
  activeApp: string | null;
  windowTitle: string | null;
  isAfk: boolean;
  activeDomain: string | null;
  activeTabTitle: string | null;
  lastSyncTime: Date | null;
  eventCount: number;
  recentEvents: Array<{
    id: string;
    source: string;
    type: string;
    title: string;
    timestamp: string;
    raw?: unknown;
  }>;
  secondsAgo: number | null;
}

export function useLiveTelemetry() {
  const [state, setState] = useState<Omit<LiveTelemetryState, "secondsAgo">>({
    connected: false,
    activeApp: null,
    windowTitle: null,
    isAfk: false,
    activeDomain: null,
    activeTabTitle: null,
    lastSyncTime: null,
    eventCount: 0,
    recentEvents: [],
  });

  const [secondsAgo, setSecondsAgo] = useState<number | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const timer = setInterval(() => {
      if (state.lastSyncTime) {
        const diff = Math.floor((Date.now() - state.lastSyncTime.getTime()) / 1000);
        setSecondsAgo(diff);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [state.lastSyncTime]);

  useEffect(() => {
    let unmounted = false;

    function connect() {
      const wsUrl = getWebSocketBaseUrl();
      const url = `${wsUrl}?userId=${encodeURIComponent(getBrowserDevUserId())}`;

      try {
        const ws = new WebSocket(url);
        wsRef.current = ws;

        ws.onopen = () => {
          if (unmounted) return;
          setState((prev) => ({ ...prev, connected: true }));
        };

        ws.onmessage = (event) => {
          if (unmounted) return;
          try {
            const msg = JSON.parse(event.data);
            if (msg.type === "telemetry_event" && msg.event) {
              const ev = msg.event;
              const source = ev.source || (ev.data?.url ? "browser" : "desktop");
              const isBrowser = source === "browser" || Boolean(ev.data?.url);

              setState((prev) => {
                const recent = [
                  {
                    id: ev.id || `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                    source,
                    type: isBrowser ? "url" : "app",
                    title: isBrowser
                      ? ev.data?.title || ev.data?.url || "Web Activity"
                      : ev.data?.app || ev.data?.title || "App Activity",
                    timestamp: ev.timestamp || new Date().toISOString(),
                    raw: ev.data,
                  },
                  ...prev.recentEvents.slice(0, 19),
                ];

                return {
                  ...prev,
                  connected: true,
                  activeApp: !isBrowser ? (ev.data?.app ?? prev.activeApp) : prev.activeApp,
                  windowTitle: !isBrowser ? (ev.data?.title ?? prev.windowTitle) : prev.windowTitle,
                  activeDomain: isBrowser
                    ? (ev.data?.url ? extractDomain(ev.data.url) : prev.activeDomain)
                    : prev.activeDomain,
                  activeTabTitle: isBrowser ? (ev.data?.title ?? prev.activeTabTitle) : prev.activeTabTitle,
                  isAfk: ev.data?.status === "afk" || ev.data?.isAfk === true,
                  lastSyncTime: new Date(),
                  eventCount: prev.eventCount + 1,
                  recentEvents: recent,
                };
              });
            } else if (msg.type === "connected") {
              setState((prev) => ({ ...prev, connected: true }));
            }
          } catch {}
        };

        ws.onclose = () => {
          if (unmounted) return;
          setState((prev) => ({ ...prev, connected: false }));
          reconnectTimeoutRef.current = setTimeout(connect, 3000);
        };

        ws.onerror = () => {
          ws.close();
        };
      } catch {
        if (!unmounted) {
          reconnectTimeoutRef.current = setTimeout(connect, 3000);
        }
      }
    }

    connect();

    return () => {
      unmounted = true;
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  return {
    ...state,
    secondsAgo,
  };
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
