"use client";

import { useEffect, useState, useRef } from "react";
import type { TelemetryEvent } from "@repo/telemetry";

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
      const wsUrl = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:4000/ws";
      const url = `${wsUrl}?userId=00000000-0000-0000-0000-000000000001`;

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
            const data = JSON.parse(event.data);

            if (data.type === "telemetry:event" && data.event) {
              const tel = data.event as TelemetryEvent;
              setState((prev) => {
                let app = prev.activeApp;
                let title = prev.windowTitle;
                let afk = prev.isAfk;
                let domain = prev.activeDomain;
                let tabTitle = prev.activeTabTitle;
                let eventTitle: string = tel.eventType;

                if (tel.source === "desktop") {
                  if (tel.eventType === "active_window") {
                    const d = tel.data as { application?: string; windowTitle?: string };
                    app = d.application || app;
                    title = d.windowTitle || title;
                    eventTitle = d.application ? `${d.application}` : "Active Window";
                  } else if (tel.eventType === "afk") {
                    const d = tel.data as { state?: string };
                    afk = d.state === "afk";
                    eventTitle = d.state ? `AFK: ${d.state}` : "AFK State";
                  }
                } else if (tel.source === "browser") {
                  const d = tel.data as { domain?: string; pageTitle?: string };
                  domain = d.domain || domain;
                  tabTitle = d.pageTitle || tabTitle;
                  eventTitle = d.domain || "Web Activity";
                }

                const newRecent = [
                  {
                    id: tel.eventId || `${Date.now()}-${Math.random()}`,
                    source: tel.source,
                    type: tel.eventType,
                    title: eventTitle,
                    timestamp: tel.timestamp,
                    raw: tel.data,
                  },
                  ...prev.recentEvents.slice(0, 9),
                ];

                return {
                  ...prev,
                  activeApp: app,
                  windowTitle: title,
                  isAfk: afk,
                  activeDomain: domain,
                  activeTabTitle: tabTitle,
                  lastSyncTime: new Date(),
                  eventCount: prev.eventCount + 1,
                  recentEvents: newRecent,
                };
              });
            } else if (data.type === "device:sync") {
              setState((prev) => ({
                ...prev,
                lastSyncTime: new Date(),
              }));
            }
          } catch {
            // Ignore parse errors
          }
        };

        ws.onclose = () => {
          if (unmounted) return;
          setState((prev) => ({ ...prev, connected: false }));
          reconnectTimeoutRef.current = setTimeout(connect, 3000);
        };

        ws.onerror = () => {
          if (unmounted) return;
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
      if (wsRef.current) wsRef.current.close();
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
    };
  }, []);

  return {
    ...state,
    secondsAgo,
  };
}
