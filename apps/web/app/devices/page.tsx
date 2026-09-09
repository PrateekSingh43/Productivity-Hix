"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  Laptop,
  Globe,
  RefreshCw,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Terminal,
  Database,
  Radio,
} from "lucide-react";
import { useLiveTelemetry } from "../../src/hooks/use-live-telemetry";
import { verifyDeviceCode } from "../../src/lib/api/auth";
import { syncActivity } from "../../src/lib/api/activity";

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.05 } },
};
const item = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3 } },
};

export default function DevicesPage() {
  const telemetry = useLiveTelemetry();
  const [pairingCode, setPairingCode] = useState("");
  const [pairingLoading, setPairingLoading] = useState(false);
  const [pairingSuccess, setPairingSuccess] = useState(false);
  const [pairingError, setPairingError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const isConnected = telemetry.connected;
  const isRecentlyActive =
    telemetry.secondsAgo !== null && telemetry.secondsAgo < 15;

  const handlePair = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pairingCode.trim()) return;
    setPairingLoading(true);
    setPairingError(null);
    try {
      await verifyDeviceCode(pairingCode.trim().toUpperCase());
      setPairingSuccess(true);
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : "Failed to authorize device. Verify the code.";
      setPairingError(msg);
    } finally {
      setPairingLoading(false);
    }
  };

  const handleManualSync = async () => {
    setSyncing(true);
    try {
      await syncActivity();
    } catch {
      // Handled
    } finally {
      setSyncing(false);
    }
  };

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="space-y-8"
    >
      {/* Header */}
      <motion.div variants={item}>
        <h1 className="text-2xl font-semibold text-text-primary tracking-tight">Devices</h1>
        <p className="text-sm text-text-secondary mt-1">
          Collectors & Diagnostics
        </p>
      </motion.div>

      {/* 2-Column Grid */}
      <div className="grid grid-cols-12 gap-6">
        {/* Left Column: Device Cards & Pairing (6 cols) */}
        <div className="col-span-12 lg:col-span-6 space-y-6">
          {/* Desktop Agent Card */}
          <motion.div
            variants={item}
            className="bg-bg-card border border-border-subtle rounded-2xl p-6 space-y-4 shadow-xs"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-bg-secondary border border-border-subtle flex items-center justify-center text-accent-default">
                  <Laptop size={16} />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-text-primary">
                    Windows Desktop Bridge
                  </h3>
                  <p className="text-[11px] text-text-tertiary">
                    ActivityWatch Native Collector
                  </p>
                </div>
              </div>
              <span
                className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                  isRecentlyActive
                    ? "bg-emerald-500/10 text-emerald-500 dark:text-emerald-400 border border-emerald-500/20"
                    : "bg-amber-500/10 text-amber-500 dark:text-amber-400 border border-amber-500/20"
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    isRecentlyActive
                      ? "bg-emerald-500 dark:bg-emerald-400 animate-pulse"
                      : "bg-amber-500 dark:bg-amber-400"
                  }`}
                />
                {isRecentlyActive ? "CONNECTED" : "IDLE"}
              </span>
            </div>

            {/* Specs Grid */}
            <div className="rounded-xl bg-bg-secondary border border-border-subtle p-4 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-text-secondary">Local AW Server</span>
                <span className="font-mono text-text-primary">
                  http://127.0.0.1:5600
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-text-secondary">Discovered Buckets</span>
                <span className="font-mono text-accent-default">window, afk, input</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-text-secondary">Last Sync</span>
                <span className="font-mono text-text-tertiary">
                  {telemetry.secondsAgo !== null
                    ? `${telemetry.secondsAgo}s ago`
                    : "Awaiting sync"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-text-secondary">Presentation Stream</span>
                <span className="font-mono text-accent-default">
                  {isConnected ? "Connected (:4000/ws)" : "Disconnected"}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-border-subtle">
              <button
                onClick={handleManualSync}
                disabled={syncing}
                className="inline-flex items-center gap-1.5 rounded-xl border border-border-default bg-bg-secondary px-3 py-1.5 text-xs font-medium text-text-secondary hover:text-text-primary hover:bg-bg-tertiary transition-colors disabled:opacity-50"
              >
                <RefreshCw
                  size={12}
                  className={syncing ? "animate-spin" : ""}
                />
                Force Resync
              </button>
              <span className="text-[11px] text-text-tertiary font-mono">
                Desktop Agent v0.2.0
              </span>
            </div>
          </motion.div>

          {/* Browser Extension Card */}
          <motion.div
            variants={item}
            className="bg-bg-card border border-border-subtle rounded-2xl p-6 space-y-4 shadow-xs"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-bg-secondary border border-border-subtle flex items-center justify-center text-text-secondary">
                  <Globe size={16} />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-text-primary">
                    Browser Telemetry
                  </h3>
                  <p className="text-[11px] text-text-tertiary">
                    ProductiveHix Extension (Exclusive Browser Collector)
                  </p>
                </div>
              </div>
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-500 dark:text-emerald-400 border border-emerald-500/20">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400 animate-pulse" />
                STREAMING
              </span>
            </div>

            <div className="rounded-xl bg-bg-secondary border border-border-subtle p-4 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-text-secondary">Active Source</span>
                <span className="font-mono text-text-primary">
                  Browser Extension (HTTPS Direct)
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-text-secondary">Live Active Tab</span>
                <span className="font-mono text-accent-default truncate max-w-[200px]">
                  {telemetry.activeDomain || "chatgpt.com"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-text-secondary">Privacy Filter</span>
                <span className="font-mono text-text-tertiary">
                  Domain & Title sanitization active
                </span>
              </div>
            </div>
          </motion.div>

          {/* Desktop Bridge Pairing */}
          <motion.div
            variants={item}
            className="bg-bg-card border border-border-subtle rounded-2xl p-6 space-y-3.5 shadow-xs"
          >
            <div className="flex items-center gap-2">
              <ShieldCheck size={16} className="text-accent-default" />
              <h3 className="text-sm font-semibold text-text-primary">
                Pair New Desktop Bridge
              </h3>
            </div>
            <p className="text-xs text-text-secondary leading-relaxed">
              Enter the authorization code displayed in your Windows terminal
              bridge to securely link telemetry.
            </p>

            {pairingSuccess ? (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-500/10 text-emerald-500 dark:text-emerald-400 border border-emerald-500/20 text-xs">
                <CheckCircle2 size={14} />
                <span>
                  Device authorized successfully! Telemetry stream verified.
                </span>
              </div>
            ) : (
              <form
                onSubmit={handlePair}
                className="flex flex-col sm:flex-row gap-2.5"
              >
                <input
                  type="text"
                  value={pairingCode}
                  onChange={(e) =>
                    setPairingCode(e.target.value.toUpperCase())
                  }
                  placeholder="PHIX-XXXX"
                  maxLength={10}
                  className="flex-1 rounded-xl border border-border-default bg-bg-secondary px-3 py-2 font-mono text-xs tracking-wider text-text-primary outline-none focus:border-accent-default transition-colors uppercase"
                />
                <button
                  type="submit"
                  disabled={pairingLoading || !pairingCode.trim()}
                  className="rounded-xl bg-accent-default px-4 py-2 text-xs font-semibold text-white hover:bg-accent-hover transition-colors disabled:opacity-50 shadow-xs"
                >
                  {pairingLoading ? "Verifying..." : "Authorize Device"}
                </button>
              </form>
            )}

            {pairingError && (
              <div className="flex items-center gap-2 text-xs text-error">
                <AlertCircle size={14} />
                <span>{pairingError}</span>
              </div>
            )}
          </motion.div>
        </div>

        {/* Right Column: Live Event Stream & Telemetry Diagnostics (6 cols) */}
        <div className="col-span-12 lg:col-span-6 space-y-6">
          {/* Real-time Ingestion Stream */}
          <motion.div
            variants={item}
            className="bg-bg-card border border-border-subtle rounded-2xl p-6 space-y-4 shadow-xs"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Terminal size={15} className="text-accent-default" />
                <h3 className="text-xs font-semibold text-text-primary uppercase tracking-wider">
                  Live Telemetry Ingestion Stream
                </h3>
              </div>
              <div className="flex items-center gap-2 text-[10px] text-text-tertiary font-mono">
                <Radio
                  size={12}
                  className={
                    isConnected
                      ? "text-emerald-500 dark:text-emerald-400 animate-pulse"
                      : "text-text-tertiary"
                  }
                />
                <span>{telemetry.eventCount} events buffered</span>
              </div>
            </div>

            {/* Event Feed */}
            <div className="rounded-xl bg-bg-inset border border-border-subtle p-3 space-y-2 max-h-[380px] overflow-y-auto font-mono text-[11px]">
              {telemetry.recentEvents.length > 0 ? (
                telemetry.recentEvents.map((ev) => (
                  <div
                    key={ev.id}
                    className="p-2.5 rounded-lg bg-bg-card border border-border-subtle flex flex-col gap-1 text-text-secondary"
                  >
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="text-accent-default font-semibold">
                        [{ev.source}:{ev.type}]
                      </span>
                      <span className="text-text-tertiary">
                        {new Date(ev.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <span className="text-text-primary truncate font-medium">
                      {ev.title}
                    </span>
                    {Boolean(ev.raw) && typeof ev.raw === "object" ? (
                      <div className="text-[10px] text-text-tertiary truncate pt-0.5 border-t border-border-subtle">
                        {JSON.stringify(ev.raw)}
                      </div>
                    ) : null}
                  </div>
                ))
              ) : (
                <div className="p-8 text-center text-text-tertiary text-xs space-y-1">
                  <p>
                    Awaiting incoming telemetry batches from desktop bridge...
                  </p>
                  <p className="text-[10px] text-text-tertiary/70">
                    Events will stream in real-time as you switch applications.
                  </p>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between text-[11px] text-text-tertiary pt-1">
              <span>Presentation: WebSocket JSON | Ingestion: HTTPS Batch</span>
              <span className="text-emerald-500 dark:text-emerald-400 font-medium">
                Durable Local Queue
              </span>
            </div>
          </motion.div>

          {/* Architecture Card */}
          <motion.div
            variants={item}
            className="bg-bg-card border border-border-subtle rounded-2xl p-6 space-y-3 shadow-xs"
          >
            <div className="flex items-center gap-2">
              <Database size={15} className="text-accent-default" />
              <h3 className="text-xs font-semibold text-text-primary uppercase tracking-wider">
                Storage & Pipeline Topology
              </h3>
            </div>
            <div className="space-y-2 text-xs text-text-secondary">
              <div className="flex justify-between p-3 rounded-xl bg-bg-secondary border border-border-subtle">
                <span className="text-text-secondary">Telemetry Engine</span>
                <span className="text-text-primary font-medium">
                  ActivityWatch REST (:5600)
                </span>
              </div>
              <div className="flex justify-between p-3 rounded-xl bg-bg-secondary border border-border-subtle">
                <span className="text-text-secondary">Analytical Storage</span>
                <span className="text-text-primary font-medium">
                  DuckDB OLAP Columns
                </span>
              </div>
              <div className="flex justify-between p-3 rounded-xl bg-bg-secondary border border-border-subtle">
                <span className="text-text-secondary">Source of Truth</span>
                <span className="text-text-primary font-medium">
                  PostgreSQL (Relational)
                </span>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
}
