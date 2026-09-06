"use client";

import { useState, useEffect } from "react";
import { Play, Pause, Square, Code, Globe, Terminal, Sparkles } from "lucide-react";
import { useLiveTelemetry } from "../../src/hooks/use-live-telemetry";

interface CurrentSessionProps {
  onSessionEnded?: () => void;
}

export function CurrentSession({ onSessionEnded }: CurrentSessionProps) {
  const telemetry = useLiveTelemetry();
  const [sessionActive, setSessionActive] = useState(true);
  const [sessionSeconds, setSessionSeconds] = useState(2538); // 42m 18s counter
  const [taskIntent, setTaskIntent] = useState("Dashboard redesign & personal operating system");

  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;
    if (sessionActive) {
      timer = setInterval(() => {
        setSessionSeconds((prev) => prev + 1);
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [sessionActive]);

  const formatTimer = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) {
      return `${h}h ${m.toString().padStart(2, "0")}m ${s.toString().padStart(2, "0")}s`;
    }
    return `${m}m ${s.toString().padStart(2, "0")}s`;
  };

  const appName = telemetry.activeApp || "Visual Studio Code";
  const windowContext = telemetry.windowTitle || "ProductiveHix — components/overview/dashboard.tsx";
  const isAfk = telemetry.isAfk;

  const AppIcon = appName.toLowerCase().includes("code")
    ? Code
    : appName.toLowerCase().includes("chrome") || appName.toLowerCase().includes("browser")
    ? Globe
    : appName.toLowerCase().includes("term") || appName.toLowerCase().includes("powershell")
    ? Terminal
    : Sparkles;

  return (
    <div className="rounded-[var(--radius-lg)] border border-[#232733] bg-[#111319] p-5 flex flex-col justify-between gap-5 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03)]">
      {/* Top Header Row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[#8f96a8]">
            Current Session
          </span>
          <span className="text-[#4b5162]">•</span>
          <span
            className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[var(--radius-sm)] text-[10px] font-semibold tracking-wide ${
              isAfk
                ? "bg-amber-400/10 text-amber-400 border border-amber-400/20"
                : sessionActive
                ? "bg-emerald-400/10 text-emerald-400 border border-emerald-400/20"
                : "bg-[#181a23] text-[#6b7280] border border-[#262a36]"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                isAfk ? "bg-amber-400" : sessionActive ? "bg-emerald-400 animate-pulse" : "bg-[#6b7280]"
              }`}
            />
            {isAfk ? "IDLE / AFK" : sessionActive ? "ACTIVE" : "PAUSED"}
          </span>
        </div>

        {/* Live Elapsed Counter */}
        <div className="font-mono text-sm font-semibold tracking-tight text-[#f4f4f6]">
          {formatTimer(sessionSeconds)}
        </div>
      </div>

      {/* Main Focus Detail */}
      <div className="space-y-3">
        {/* App & Context line */}
        <div className="flex items-start gap-3 p-3.5 rounded-[var(--radius-md)] bg-[#0c0d12] border border-[#1d212b]">
          <div className="h-8 w-8 rounded-[var(--radius-sm)] bg-[#181b24] border border-[#2a2f3d] flex items-center justify-center text-[#707df7] shrink-0">
            <AppIcon size={16} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[#f4f4f6] truncate">
                {appName}
              </span>
              <span className="text-[10px] font-mono text-[#6b7280]">
                Foreground
              </span>
            </div>
            <p className="text-[11px] text-[#9ca3af] truncate mt-0.5" title={windowContext}>
              {windowContext}
            </p>
          </div>
        </div>

        {/* Intention statement */}
        <div className="px-1">
          <span className="text-[10px] uppercase tracking-wider text-[#6b7280] font-medium">
            Working on
          </span>
          <p className="text-xs text-[#f4f4f6] font-medium mt-0.5 line-clamp-1">
            {taskIntent}
          </p>
        </div>
      </div>

      {/* Action Controls */}
      <div className="flex items-center justify-between pt-2.5 border-t border-[#1d212b]">
        <div className="flex items-center gap-2">
          {sessionActive ? (
            <button
              onClick={() => setSessionActive(false)}
              className="inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-[#272b38] bg-[#161822] px-2.5 py-1.5 text-xs font-medium text-[#9ca3af] hover:text-[#f4f4f6] hover:border-[#383e50] transition-colors"
            >
              <Pause size={12} /> Pause
            </button>
          ) : (
            <button
              onClick={() => setSessionActive(true)}
              className="inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-[#272b38] bg-[#161822] px-2.5 py-1.5 text-xs font-medium text-[#9ca3af] hover:text-[#f4f4f6] hover:border-[#383e50] transition-colors"
            >
              <Play size={12} /> Resume
            </button>
          )}

          <button
            onClick={() => {
              setSessionActive(false);
              onSessionEnded?.();
            }}
            className="inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-[#272b38] bg-[#161822] px-2.5 py-1.5 text-xs font-medium text-[#9ca3af] hover:text-red-400 hover:border-red-500/30 transition-colors"
          >
            <Square size={12} /> End Session
          </button>
        </div>

        <span className="text-[11px] text-[#6b7280]">
          Linked to: <span className="text-[#9ca3af]">Dashboard task</span>
        </span>
      </div>
    </div>
  );
}
