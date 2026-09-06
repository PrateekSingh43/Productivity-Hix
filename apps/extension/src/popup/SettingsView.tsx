import { useState, useEffect } from "react";
import { ArrowLeft, Clock, Bell, Timer, ShieldCheck, Zap, Play, Check } from "lucide-react";
import {
  updateSchedulerConfig,
  resetSchedulerTimer,
  triggerCheckInNotification,
  type ExtensionStatus,
} from "../api/client";

interface SettingsViewProps {
  status?: ExtensionStatus;
  onBack: () => void;
  onRefresh: () => void;
}

export function SettingsView({ status, onBack, onRefresh }: SettingsViewProps) {
  const scheduler = status?.scheduler;

  // Check-in settings
  const [checkInsPaused, setCheckInsPaused] = useState(scheduler?.checkInsPaused ?? false);
  const [quietHoursEnabled, setQuietHoursEnabled] = useState(scheduler?.quietHoursEnabled ?? false);
  const [quietHoursStart, setQuietHoursStart] = useState(scheduler?.quietHoursStart ?? "22:00");
  const [quietHoursEnd, setQuietHoursEnd] = useState(scheduler?.quietHoursEnd ?? "08:00");
  const [afterFocusReflection, setAfterFocusReflection] = useState(scheduler?.afterFocusReflection ?? true);

  // Cadence / interval settings
  const [devMode, setDevMode] = useState(scheduler?.devMode ?? true);
  const [devIntervalSeconds, setDevIntervalSeconds] = useState(scheduler?.devIntervalSeconds ?? 10);
  const [isCustom, setIsCustom] = useState(false);
  const [customValue, setCustomValue] = useState(10);
  const [customUnit, setCustomUnit] = useState<"sec" | "min">("sec");

  // Live countdown state
  const [countdown, setCountdown] = useState<number | null>(null);
  const [testDispatched, setTestDispatched] = useState(false);

  useEffect(() => {
    if (scheduler) {
      setCheckInsPaused(scheduler.checkInsPaused);
      setQuietHoursEnabled(scheduler.quietHoursEnabled);
      setQuietHoursStart(scheduler.quietHoursStart);
      setQuietHoursEnd(scheduler.quietHoursEnd);
      setAfterFocusReflection(scheduler.afterFocusReflection);
      setDevMode(scheduler.devMode);
      setDevIntervalSeconds(scheduler.devIntervalSeconds);

      if (scheduler.nextTriggerAt) {
        const remaining = Math.max(0, Math.ceil((scheduler.nextTriggerAt - Date.now()) / 1000));
        setCountdown(remaining);
      }
    }
  }, [scheduler]);

  // Live 1-second countdown ticker in UI
  useEffect(() => {
    const timer = setInterval(() => {
      if (scheduler?.nextTriggerAt) {
        const remaining = Math.max(0, Math.ceil((scheduler.nextTriggerAt - Date.now()) / 1000));
        setCountdown(remaining);
        if (remaining <= 0 && !scheduler.checkInsPaused) {
          void triggerCheckInNotification().then(() => onRefresh());
        }
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [scheduler?.nextTriggerAt, scheduler?.checkInsPaused]);

  const saveSchedulerSetting = async (patch: {
    checkInsPaused?: boolean;
    quietHoursEnabled?: boolean;
    quietHoursStart?: string;
    quietHoursEnd?: string;
    afterFocusReflection?: boolean;
    devMode?: boolean;
    devIntervalSeconds?: number;
    customIntervalSeconds?: number;
    resetCooldown?: boolean;
  }) => {
    await updateSchedulerConfig(patch);
    onRefresh();
  };

  const handleSelectPreset = async (sec: number, isProd = false) => {
    setIsCustom(false);
    if (isProd) {
      setDevMode(false);
      await saveSchedulerSetting({ devMode: false, devIntervalSeconds: 45 * 60, resetCooldown: true });
    } else {
      setDevMode(true);
      setDevIntervalSeconds(sec);
      await saveSchedulerSetting({ devMode: true, devIntervalSeconds: sec, resetCooldown: true });
    }
    onRefresh();
  };

  const handleApplyCustom = async () => {
    const computedSec = Math.max(5, customUnit === "min" ? customValue * 60 : customValue);
    setDevMode(true);
    setDevIntervalSeconds(computedSec);
    await saveSchedulerSetting({
      devMode: true,
      devIntervalSeconds: computedSec,
      customIntervalSeconds: computedSec,
      resetCooldown: true,
    });
    onRefresh();
  };

  const handleTestNow = async () => {
    setTestDispatched(true);
    try {
      await triggerCheckInNotification();
    } finally {
      setTimeout(() => setTestDispatched(false), 3000);
      onRefresh();
    }
  };

  return (
    <main className="content" style={{ gap: 10 }}>
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

      <div className="section-heading compact">
        <div>
          <span className="section-kicker">PREFERENCES</span>
          <h1>Extension Settings</h1>
        </div>
      </div>

      {/* NOTIFICATION TRIGGER & CADENCE TESTING */}
      <section className="settings-card" style={{ borderColor: "rgba(251,191,36,0.3)" }}>
        <div style={{ padding: "8px 0 4px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Zap size={13} color="#fbbf24" />
            <span className="section-kicker" style={{ color: "#fbbf24" }}>NOTIFICATION TRIGGER & TIMER</span>
          </div>
          <button
            type="button"
            onClick={handleTestNow}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              padding: "3px 8px",
              background: "linear-gradient(135deg, #fbbf24, #d97706)",
              border: 0,
              borderRadius: 6,
              color: "#000",
              fontSize: 10,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            <Play size={10} fill="#000" />
            {testDispatched ? "Triggered!" : "Test Now"}
          </button>
        </div>

        <div className="setting-row" style={{ flexDirection: "column", alignItems: "stretch", padding: "8px 0", minHeight: "auto", gap: 6 }}>
          <div className="setting-copy">
            <strong>Trigger Cadence Presets</strong>
            <span>Select testing speed or set a custom trigger time</span>
          </div>

          <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
            {[
              { label: "10s", sec: 10 },
              { label: "30s", sec: 30 },
              { label: "60s", sec: 60 },
              { label: "2m", sec: 120 },
              { label: "Prod (45m)", sec: 45 * 60, isProd: true },
            ].map((preset) => {
              const isSelected = !isCustom && (preset.isProd ? !devMode : devMode && devIntervalSeconds === preset.sec);
              return (
                <button
                  key={preset.label}
                  type="button"
                  className="secondary-button"
                  onClick={() => void handleSelectPreset(preset.sec, preset.isProd)}
                  style={{
                    flex: 1,
                    marginTop: 0,
                    padding: "6px 2px",
                    fontSize: 10,
                    fontWeight: isSelected ? 700 : 500,
                    background: isSelected ? "rgba(251,191,36,0.22)" : undefined,
                    borderColor: isSelected ? "#fbbf24" : undefined,
                    color: isSelected ? "#fef3c7" : undefined,
                  }}
                >
                  {preset.label}
                </button>
              );
            })}
            <button
              type="button"
              className="secondary-button"
              onClick={() => setIsCustom(true)}
              style={{
                padding: "6px 8px",
                fontSize: 10,
                marginTop: 0,
                background: isCustom ? "rgba(167,139,250,0.22)" : undefined,
                borderColor: isCustom ? "#a78bfa" : undefined,
                color: isCustom ? "#e5dcfa" : undefined,
              }}
            >
              Custom
            </button>
          </div>

          {/* CUSTOM TIME INPUT */}
          {isCustom && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, padding: "6px 8px", background: "rgba(255,255,255,0.03)", borderRadius: 7, border: "1px solid rgba(255,255,255,0.08)" }}>
              <span style={{ fontSize: 10, color: "#9ca3af" }}>Custom:</span>
              <input
                type="number"
                min="5"
                max="3600"
                value={customValue}
                onChange={(e) => setCustomValue(Math.max(1, Number(e.target.value)))}
                style={{
                  width: 54,
                  background: "#161320",
                  border: "1px solid rgba(255,255,255,0.14)",
                  color: "#fff",
                  borderRadius: 6,
                  padding: "3px 6px",
                  fontSize: 11,
                  textAlign: "center",
                }}
              />
              <div style={{ display: "flex", gap: 2 }}>
                <button
                  type="button"
                  onClick={() => setCustomUnit("sec")}
                  style={{
                    padding: "3px 6px",
                    fontSize: 9.5,
                    borderRadius: 4,
                    background: customUnit === "sec" ? "rgba(167,139,250,0.3)" : "transparent",
                    color: customUnit === "sec" ? "#fff" : "#9ca3af",
                    border: "1px solid rgba(255,255,255,0.08)",
                  }}
                >
                  Sec
                </button>
                <button
                  type="button"
                  onClick={() => setCustomUnit("min")}
                  style={{
                    padding: "3px 6px",
                    fontSize: 9.5,
                    borderRadius: 4,
                    background: customUnit === "min" ? "rgba(167,139,250,0.3)" : "transparent",
                    color: customUnit === "min" ? "#fff" : "#9ca3af",
                    border: "1px solid rgba(255,255,255,0.08)",
                  }}
                >
                  Min
                </button>
              </div>
              <button
                type="button"
                className="primary-button"
                onClick={() => void handleApplyCustom()}
                style={{
                  margin: 0,
                  marginLeft: "auto",
                  padding: "4px 8px",
                  fontSize: 10,
                  height: "auto",
                }}
              >
                <Check size={11} /> Start Timer
              </button>
            </div>
          )}

          {/* LIVE TIMER COUNTDOWN STATUS */}
          <div
            style={{
              marginTop: 6,
              padding: "8px 10px",
              borderRadius: 8,
              background: "linear-gradient(135deg, rgba(139,92,246,0.12), rgba(251,191,36,0.08))",
              border: "1px solid rgba(139,92,246,0.25)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span
                  className="live-dot"
                  style={{
                    background: countdown !== null && countdown <= 3 ? "#ef4444" : "#fbbf24",
                    boxShadow: `0 0 8px ${countdown !== null && countdown <= 3 ? "#ef4444" : "#fbbf24"}`,
                  }}
                />
                <span style={{ fontSize: 11, color: "#fef3c7", fontWeight: 600 }}>
                  Next notification in:{" "}
                  <strong style={{ color: "#fff", fontSize: 12 }}>
                    {countdown !== null ? `${countdown}s` : "Calculating..."}
                  </strong>
                </span>
              </div>
              <span style={{ fontSize: 9.5, color: "#a59cb6" }}>
                Cadence: {devMode ? `${devIntervalSeconds}s` : "45m"}
              </span>
            </div>
            <p style={{ margin: "5px 0 0", fontSize: 9.5, color: "#9ca3af", lineHeight: 1.35 }}>
              A notification toast will appear at the <strong>bottom-right corner</strong> of your screen.
              Clicking it immediately opens the <strong>Reflect</strong> wizard.
            </p>
          </div>
        </div>
      </section>

      {/* CHECK-IN PREFERENCES */}
      <section className="settings-card">
        <div style={{ padding: "8px 0 4px", display: "flex", alignItems: "center", gap: 6 }}>
          <Bell size={13} color="#a78bfa" />
          <span className="section-kicker" style={{ color: "#a78bfa" }}>HOURLY REFLECTION</span>
        </div>

        <div className="setting-row">
          <div className="setting-copy">
            <strong>Hourly Reflection</strong>
            <span>Prompt for quick check-in after work blocks</span>
          </div>
          <button
            type="button"
            className={`toggle ${!checkInsPaused ? "on" : "off"}`}
            onClick={() => {
              const newVal = !checkInsPaused;
              setCheckInsPaused(newVal);
              void saveSchedulerSetting({ checkInsPaused: newVal });
            }}
            aria-label="Toggle hourly reflection"
          >
            <span />
          </button>
        </div>

        <div className="setting-row">
          <div className="setting-copy">
            <strong>After-Focus Reflection</strong>
            <span>Ask what happened when a focus block ends</span>
          </div>
          <button
            type="button"
            className={`toggle ${afterFocusReflection ? "on" : "off"}`}
            onClick={() => {
              const newVal = !afterFocusReflection;
              setAfterFocusReflection(newVal);
              void saveSchedulerSetting({ afterFocusReflection: newVal });
            }}
            aria-label="Toggle after focus reflection"
          >
            <span />
          </button>
        </div>

        <div className="setting-row" style={{ flexDirection: "column", alignItems: "stretch", padding: "8px 0", minHeight: "auto", gap: 6 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div className="setting-copy">
              <strong>Quiet Hours</strong>
              <span>Suppress check-ins during rest hours</span>
            </div>
            <button
              type="button"
              className={`toggle ${quietHoursEnabled ? "on" : "off"}`}
              onClick={() => {
                const newVal = !quietHoursEnabled;
                setQuietHoursEnabled(newVal);
                void saveSchedulerSetting({ quietHoursEnabled: newVal });
              }}
              aria-label="Toggle quiet hours"
            >
              <span />
            </button>
          </div>

          {quietHoursEnabled && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
              <Clock size={12} color="#8a8298" />
              <input
                type="time"
                value={quietHoursStart}
                onChange={(e) => {
                  setQuietHoursStart(e.target.value);
                  void saveSchedulerSetting({ quietHoursStart: e.target.value });
                }}
                style={{
                  background: "#161320",
                  border: "1px solid rgba(255,255,255,0.12)",
                  color: "#eee8f8",
                  padding: "3px 6px",
                  borderRadius: 6,
                  fontSize: 10,
                }}
              />
              <span style={{ fontSize: 10, color: "#8a8298" }}>to</span>
              <input
                type="time"
                value={quietHoursEnd}
                onChange={(e) => {
                  setQuietHoursEnd(e.target.value);
                  void saveSchedulerSetting({ quietHoursEnd: e.target.value });
                }}
                style={{
                  background: "#161320",
                  border: "1px solid rgba(255,255,255,0.12)",
                  color: "#eee8f8",
                  padding: "3px 6px",
                  borderRadius: 6,
                  fontSize: 10,
                }}
              />
            </div>
          )}
        </div>
      </section>

      {/* FOCUS SETTINGS */}
      <section className="settings-card">
        <div style={{ padding: "8px 0 4px", display: "flex", alignItems: "center", gap: 6 }}>
          <Timer size={13} color="#a78bfa" />
          <span className="section-kicker" style={{ color: "#a78bfa" }}>FOCUS MODE</span>
        </div>

        <div className="setting-row">
          <div className="setting-copy">
            <strong>Duration Presets</strong>
            <span>Standard blocks</span>
          </div>
          <span className="muted-label" style={{ color: "#d8c6ff", fontWeight: 600 }}>25m • 50m • Custom</span>
        </div>

        <div className="setting-row">
          <div className="setting-copy">
            <strong>Custom Duration Limits</strong>
            <span>Bounded block duration</span>
          </div>
          <span className="muted-label">5 to 180 min</span>
        </div>
      </section>

      {/* PRIVACY SETTINGS */}
      <section className="settings-card">
        <div style={{ padding: "8px 0 4px", display: "flex", alignItems: "center", gap: 6 }}>
          <ShieldCheck size={13} color="#a78bfa" />
          <span className="section-kicker" style={{ color: "#a78bfa" }}>PRIVACY & TRACKING</span>
        </div>

        <div className="setting-row">
          <div className="setting-copy">
            <strong>Private by Default</strong>
            <span>No page content, passwords, or keystrokes</span>
          </div>
          <span className="good-text">Protected</span>
        </div>
      </section>
    </main>
  );
}
