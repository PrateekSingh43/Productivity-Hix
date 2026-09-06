import { useState } from "react";
import {
  Bell,
  CheckCircle2,
  Clock,
  Database,
  Radio,
  RefreshCw,
  Zap,
  ArrowLeft,
  Monitor,
  Activity,
} from "lucide-react";
import {
  triggerCheckInNotification,
  triggerSync,
  type ExtensionStatus,
} from "../api/client";

interface DiagnosticsViewProps {
  status?: ExtensionStatus;
  onBack?: () => void;
  onRefresh: () => void;
}

function formatIso(iso?: string | null): string {
  if (!iso) return "None";
  try {
    const d = new Date(iso);
    return `${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`;
  } catch {
    return iso;
  }
}

export function DiagnosticsView({ status, onBack, onRefresh }: DiagnosticsViewProps) {
  const scheduler = status?.scheduler;
  const [triggering, setTriggering] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [triggerResult, setTriggerResult] = useState<string | null>(null);

  const handleTestNotification = async () => {
    setTriggering(true);
    setTriggerResult(null);
    try {
      const res = await triggerCheckInNotification();
      if (res.sent) {
        setTriggerResult("Native notification dispatched!");
      } else {
        setTriggerResult("Failed to dispatch notification");
      }
    } catch (e: any) {
      setTriggerResult(e.message || "Failed");
    } finally {
      setTriggering(false);
      onRefresh();
    }
  };

  const handleSyncNow = async () => {
    setSyncing(true);
    try {
      await triggerSync();
    } finally {
      setSyncing(false);
      onRefresh();
    }
  };

  return (
    <main className="content" style={{ gap: 10 }}>
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            background: "transparent",
            border: 0,
            color: "#90869e",
            fontSize: 11,
            cursor: "pointer",
            padding: "2px 0",
            alignSelf: "flex-start",
          }}
        >
          <ArrowLeft size={13} /> Back to More
        </button>
      )}

      <div className="section-heading compact">
        <div>
          <span className="section-kicker">SYSTEM OBSERVABILITY</span>
          <h1>Extension Diagnostics</h1>
        </div>
        <button className="icon-button" onClick={onRefresh} title="Refresh telemetry">
          <RefreshCw size={13} />
        </button>
      </div>

      {/* COMPONENT STATUS */}
      <section className="diagnostics">
        <span className="section-kicker">INFRASTRUCTURE HEALTH</span>

        <div className="diag-row">
          <span className="diag-label">Extension Collector</span>
          <span className={`status-pill ${status?.trackingPaused ? "warn" : "good"}`}>
            ● {status?.trackingPaused ? "Paused" : "Active"}
          </span>
        </div>

        <div className="diag-row">
          <span className="diag-label">Express API (Port 4000)</span>
          <span className={`status-pill ${status?.apiReachable ? "good" : "bad"}`}>
            ● {status?.apiReachable ? "Connected" : "Offline"}
          </span>
        </div>

        <div className="diag-row">
          <span className="diag-label">Desktop Bridge Agent</span>
          <span className={`status-pill ${status?.desktop?.connected ? "good" : "bad"}`}>
            ● {status?.desktop?.connected ? "Connected" : "Not connected"}
          </span>
        </div>

        <div className="diag-row">
          <span className="diag-label">ActivityWatch Instance</span>
          <span className={`status-pill ${status?.desktop?.activityWatchRunning ? "good" : "warn"}`}>
            ● {status?.desktop?.activityWatchRunning ? "Running (127.0.0.1:5600)" : "Not running"}
          </span>
        </div>

        <div className="diag-row">
          <span className="diag-label">Authentication</span>
          <span className={`status-pill ${status?.authenticated ? "good" : "bad"}`}>
            ● {status?.authenticated ? "Authenticated" : "Unpaired"}
          </span>
        </div>

        <div className="diag-row">
          <span className="diag-label">Installation ID</span>
          <span className="diag-value" title={status?.installationId}>
            {status?.installationId ? `${status.installationId.slice(0, 18)}...` : "Loading..."}
          </span>
        </div>
      </section>

      {/* DISAMBIGUATED EVENT ACCOUNTING */}
      <section className="diagnostics">
        <span className="section-kicker">TELEMETRY INGESTION METRICS</span>
        <div className="diagnostic-grid three-col">
          <div className="metric-card" style={{ padding: "8px 6px" }}>
            <span style={{ fontSize: "8.5px", color: "#81798d" }}>CREATED</span>
            <strong style={{ fontSize: "13px" }}>{status?.eventsCreated ?? 0}</strong>
          </div>
          <div className="metric-card" style={{ padding: "8px 6px" }}>
            <span style={{ fontSize: "8.5px", color: "#81798d" }}>QUEUED</span>
            <strong style={{ fontSize: "13px" }}>{status?.eventsQueued ?? status?.queueSize ?? 0}</strong>
          </div>
          <div className="metric-card" style={{ padding: "8px 6px" }}>
            <span style={{ fontSize: "8.5px", color: "#81798d" }}>UPLOADED</span>
            <strong style={{ fontSize: "13px" }}>{status?.eventsUploaded ?? 0}</strong>
          </div>
        </div>
        <p style={{ fontSize: 9.5, color: "#81798d", margin: "4px 0 0", lineHeight: 1.3 }}>
          * Created = unique events generated locally; Uploaded = unique events acknowledged by API server.
        </p>

        <div className="diag-row" style={{ marginTop: 8 }}>
          <span className="diag-label">Last Observed Tab</span>
          <span className="diag-value">
            {status?.lastEvent?.domain ? `${status.lastEvent.domain} (${formatIso(status.lastEvent.timestamp)})` : "Waiting for tab"}
          </span>
        </div>

        <div className="diag-row">
          <span className="diag-label">Last Batch Upload</span>
          <span className="diag-value">
            {status?.lastUpload ? `${status.lastUpload.count} evts at ${formatIso(status.lastUpload.timestamp)}` : "None"}
          </span>
        </div>

        <button
          type="button"
          className="secondary-button full"
          onClick={handleSyncNow}
          disabled={syncing || !status?.apiReachable}
        >
          <RefreshCw size={12} className={syncing ? "spin" : ""} /> {syncing ? "Syncing..." : "Flush Telemetry Queue"}
        </button>
      </section>

      {/* SCHEDULER & NOTIFICATION DIAGNOSTICS */}
      <section className="diagnostics">
        <span className="section-kicker">CHECK-IN SCHEDULER & NOTIFICATIONS</span>

        <div className="diag-row">
          <span className="diag-label">Eligibility Status</span>
          <span className={`status-pill ${scheduler?.eligibility?.eligible ? "good" : "warn"}`}>
            ● {scheduler?.eligibility?.eligible ? "Eligible" : "Not eligible"}
          </span>
        </div>

        <div className="diag-row">
          <span className="diag-label">Evaluation Reason</span>
          <span className="diag-value" style={{ maxWidth: 190, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={scheduler?.eligibility?.reason}>
            {scheduler?.eligibility?.reason || "Normal"}
          </span>
        </div>

        <div className="diag-row">
          <span className="diag-label">Active Time in Window</span>
          <span className="diag-value">
            {scheduler?.devMode
              ? `${scheduler.activeSecondsInWindow}s / ${scheduler.devIntervalSeconds}s`
              : `${Math.round((scheduler?.activeSecondsInWindow ?? 0) / 60)}m / 45m`}
          </span>
        </div>

        <div className="diag-row">
          <span className="diag-label">Last Notification Sent</span>
          <span className="diag-value">{formatIso(scheduler?.lastNotificationSentAt)}</span>
        </div>

        <div className="diag-row">
          <span className="diag-label">Last Notification Clicked</span>
          <span className="diag-value">{formatIso(scheduler?.lastNotificationClickedAt)}</span>
        </div>

        <div className="diag-row">
          <span className="diag-label">Last Check-In Completed</span>
          <span className="diag-value">{formatIso(scheduler?.lastCompletedCheckIn)}</span>
        </div>

        <div className="diag-row">
          <span className="diag-label">Cooldown Until</span>
          <span className="diag-value">{formatIso(scheduler?.checkInCooldownUntil)}</span>
        </div>

        <div style={{ marginTop: 10 }}>
          <button
            type="button"
            className="primary-button full"
            onClick={handleTestNotification}
            disabled={triggering}
          >
            <Zap size={12} /> {triggering ? "Dispatching..." : "Send Test Notification Now"}
          </button>
          {triggerResult && (
            <div style={{ marginTop: 6, fontSize: 10, textAlign: "center", color: "#72e0ad" }}>
              {triggerResult}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
