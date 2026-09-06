"use client";

import { useEffect, useState, useRef } from "react";
import { Monitor, Globe, Activity, Wifi, WifiOff, Clock, ShieldCheck, Laptop } from "lucide-react";
import type { TelemetryEvent } from "@repo/telemetry";

interface LiveState {
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
  }>;
}

export function LiveActivityCard() {
  const [state, setState] = useState<LiveState>({
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
                    eventTitle = d.application || "Window";
                  } else if (tel.eventType === "afk") {
                    const d = tel.data as { state?: string };
                    afk = d.state === "afk";
                    eventTitle = d.state ? `AFK: ${d.state}` : "AFK";
                  }
                } else if (tel.source === "browser") {
                  const d = tel.data as { domain?: string; pageTitle?: string };
                  domain = d.domain || domain;
                  tabTitle = d.pageTitle || tabTitle;
                  eventTitle = d.domain || "Web";
                }

                const newRecent = [
                  {
                    id: tel.eventId,
                    source: tel.source,
                    type: tel.eventType,
                    title: eventTitle,
                    timestamp: tel.timestamp,
                  },
                  ...prev.recentEvents.slice(0, 5),
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

  const recentlySynced = state.lastSyncTime && (secondsAgo ?? 999) < 10;

  return (
    <div className="border border-border-strong bg-bg-secondary flex flex-col font-mono text-[13px]">
      
      {/* Top Status Bar */}
      <div className="flex items-center justify-between border-b border-border-default p-3">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-2">
            <span className={`h-1.5 w-1.5 rounded-full ${recentlySynced ? "bg-success" : "bg-text-tertiary"}`} />
            <span className={recentlySynced ? "text-text-primary" : "text-text-secondary"}>Desktop</span>
          </span>
          <span className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-success" />
            <span className="text-text-primary">AW Service</span>
          </span>
          <span className="flex items-center gap-2">
            <span className={`h-1.5 w-1.5 rounded-full ${state.connected ? "bg-success" : "bg-error"}`} />
            <span className={state.connected ? "text-text-primary" : "text-error"}>
              {state.connected ? "WebSocket" : "Disconnected"}
            </span>
          </span>
        </div>
        <div className="text-text-tertiary flex items-center gap-2">
          <Clock size={12} />
          {secondsAgo !== null
            ? secondsAgo === 0
              ? "0s ago"
              : `${secondsAgo}s ago`
            : "--"}
        </div>
      </div>

      {/* Main Data Split */}
      <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-border-default">
        
        {/* Desktop State */}
        <div className="p-4 space-y-4">
          <div className="flex items-center justify-between text-text-tertiary">
            <span className="uppercase tracking-widest text-[10px] font-semibold">Foreground Window</span>
            <span className={`px-1.5 py-0.5 rounded-[var(--radius-sm)] text-[10px] font-medium ${state.isAfk ? "bg-warning-bg-subtle text-warning" : "bg-success-bg-subtle text-success"}`}>
              {state.isAfk ? "AFK" : "ACTIVE"}
            </span>
          </div>
          <div>
            <div className="text-text-primary font-semibold truncate">
              {state.activeApp || "..."}
            </div>
            <div className="text-text-secondary text-xs truncate mt-1">
              {state.windowTitle || "..."}
            </div>
          </div>
        </div>

        {/* Browser State */}
        <div className="p-4 space-y-4">
          <div className="flex items-center justify-between text-text-tertiary">
            <span className="uppercase tracking-widest text-[10px] font-semibold">Active Browser Tab</span>
            <span className="px-1.5 py-0.5 rounded-[var(--radius-sm)] text-[10px] font-medium bg-bg-tertiary text-text-secondary">
              EXT
            </span>
          </div>
          <div>
            <div className="text-text-primary font-semibold truncate">
              {state.activeDomain || "..."}
            </div>
            <div className="text-text-secondary text-xs truncate mt-1">
              {state.activeTabTitle || "..."}
            </div>
          </div>
        </div>
      </div>

      {/* Event Stream Log */}
      <div className="border-t border-border-default p-3 overflow-hidden bg-bg-inset">
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-text-tertiary">Stream</span>
          <div className="flex gap-2 text-xs truncate flex-1">
            {state.recentEvents.length > 0 ? (
              state.recentEvents.map((ev, i) => (
                <span key={ev.id} className={`truncate max-w-[120px] ${i === 0 ? "text-accent-default" : "text-text-tertiary"}`}>
                  {ev.title}
                </span>
              ))
            ) : (
              <span className="text-text-tertiary italic">Awaiting events...</span>
            )}
          </div>
          <span className="text-[10px] text-text-tertiary">
            {state.eventCount} total
          </span>
        </div>
      </div>

    </div>
  );
}

