import { useState, useEffect, useRef } from "react";
import {
  ArrowLeft,
  Clock,
  Bell,
  Timer,
  ShieldCheck,
  Zap,
  Play,
  Check,
  Sun,
  Moon,
  Monitor,
} from "lucide-react";
import {
  updateSchedulerConfig,
  triggerCheckInNotification,
  type ExtensionStatus,
} from "../api/client";

interface SettingsViewProps {
  status?: ExtensionStatus;
  onBack: () => void;
  onRefresh: () => void;
}

type ThemeMode = "dark" | "light" | "system";

export function SettingsView({ status, onBack, onRefresh }: SettingsViewProps) {
  const scheduler = status?.scheduler;

  // Theme settings
  const [theme, setTheme] = useState<ThemeMode>("dark");

  useEffect(() => {
    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      chrome.storage.local.get(["theme"], (res) => {
        if (res.theme === "light" || res.theme === "dark" || res.theme === "system") {
          setTheme(res.theme);
          document.documentElement.setAttribute("data-theme", res.theme);
        } else {
          document.documentElement.setAttribute("data-theme", "dark");
        }
      });
    }
  }, []);

  const handleThemeChange = (newTheme: ThemeMode) => {
    setTheme(newTheme);
    document.documentElement.setAttribute("data-theme", newTheme);
    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      void chrome.storage.local.set({ theme: newTheme });
    }
  };

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
  const lastTriggeredRef = useRef<number>(0);

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
        if (remaining <= 0 && !scheduler.checkInsPaused && Date.now() - lastTriggeredRef.current > 4000) {
          lastTriggeredRef.current = Date.now();
          void triggerCheckInNotification().then(() => onRefresh());
        }
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [scheduler?.nextTriggerAt, scheduler?.checkInsPaused, onRefresh]);

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
      await saveSchedulerSetting({ devMode: false, devIntervalSeconds: 50 * 60, resetCooldown: true });
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
        className="text-button"
        style={{
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

      {/* 1. APPEARANCE / THEME SWITCHER */}
      <section className="settings-card">
        <div style={{ padding: "8px 0 4px", display: "flex", alignItems: "center", gap: 6 }}>
          <Sun size={13} color="var(--accent-primary)" />
          <span className="section-kicker" style={{ color: "var(--accent-primary)" }}>
            APPEARANCE & THEME
          </span>
        </div>

        <div className="setting-row" style={{ flexDirection: "column", alignItems: "stretch", padding: "8px 0", minHeight: "auto", gap: 8 }}>
          <div className="setting-copy">
            <strong>Interface Theme</strong>
            <span>Choose light, dark, or automatic system appearance</span>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 4,
              padding: 3,
              background: "var(--bg-subtle)",
              border: "1px solid var(--border-default)",
              borderRadius: 8,
            }}
          >
            <button
              type="button"
              onClick={() => handleThemeChange("dark")}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 5,
                padding: "6px 8px",
                borderRadius: 6,
                fontSize: 11,
                fontWeight: theme === "dark" ? 600 : 500,
                color: theme === "dark" ? "var(--text-primary)" : "var(--text-secondary)",
                background: theme === "dark" ? "var(--bg-active)" : "transparent",
                boxShadow: theme === "dark" ? "0 1px 2px rgba(0,0,0,0.15)" : "none",
                transition: "all 150ms cubic-bezier(0.16, 1, 0.3, 1)",
              }}
            >
              <Moon size={12} /> Dark
            </button>

            <button
              type="button"
              onClick={() => handleThemeChange("light")}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 5,
                padding: "6px 8px",
                borderRadius: 6,
                fontSize: 11,
                fontWeight: theme === "light" ? 600 : 500,
                color: theme === "light" ? "var(--text-primary)" : "var(--text-secondary)",
                background: theme === "light" ? "var(--bg-surface-elevated)" : "transparent",
                boxShadow: theme === "light" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                transition: "all 150ms cubic-bezier(0.16, 1, 0.3, 1)",
              }}
            >
              <Sun size={12} /> Light
            </button>

            <button
              type="button"
              onClick={() => handleThemeChange("system")}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 5,
                padding: "6px 8px",
                borderRadius: 6,
                fontSize: 11,
                fontWeight: theme === "system" ? 600 : 500,
                color: theme === "system" ? "var(--text-primary)" : "var(--text-secondary)",
                background: theme === "system" ? "var(--bg-active)" : "transparent",
                boxShadow: theme === "system" ? "0 1px 2px rgba(0,0,0,0.15)" : "none",
                transition: "all 150ms cubic-bezier(0.16, 1, 0.3, 1)",
              }}
            >
              <Monitor size={12} /> System
            </button>
          </div>
        </div>
      </section>

      {/* 2. NOTIFICATION TRIGGER & CADENCE TESTING */}
      <section className="settings-card" style={{ borderColor: "var(--border-default)" }}>
        <div style={{ padding: "8px 0 4px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Zap size={13} color="var(--warning)" />
            <span className="section-kicker" style={{ color: "var(--warning)" }}>NOTIFICATION TRIGGER & TIMER</span>
          </div>
          <button
            type="button"
            onClick={handleTestNow}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              padding: "4px 8px",
              background: "var(--warning)",
              border: 0,
              borderRadius: 5,
              color: "#000",
              fontSize: 10,
              fontWeight: 650,
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
              { label: "Prod (50m)", sec: 50 * 60, isProd: true },
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
                    fontWeight: isSelected ? 650 : 500,
                    background: isSelected ? "var(--warning-subtle)" : undefined,
                    borderColor: isSelected ? "var(--warning)" : undefined,
                    color: isSelected ? "var(--text-primary)" : undefined,
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
                background: isCustom ? "var(--accent-subtle)" : undefined,
                borderColor: isCustom ? "var(--accent-primary)" : undefined,
                color: isCustom ? "var(--text-primary)" : undefined,
              }}
            >
              Custom
            </button>
          </div>

          {/* CUSTOM TIME INPUT */}
          {isCustom && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, padding: "6px 8px", background: "var(--bg-subtle)", borderRadius: 7, border: "1px solid var(--border-default)" }}>
              <span style={{ fontSize: 10, color: "var(--text-muted)" }}>Custom:</span>
              <input
                type="number"
                min="5"
                max="3600"
                value={customValue}
                onChange={(e) => setCustomValue(Math.max(1, Number(e.target.value)))}
                style={{
                  width: 54,
                  background: "var(--bg-surface)",
                  border: "1px solid var(--border-default)",
                  color: "var(--text-primary)",
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
                    background: customUnit === "sec" ? "var(--accent-subtle)" : "transparent",
                    color: customUnit === "sec" ? "var(--text-primary)" : "var(--text-muted)",
                    border: "1px solid var(--border-subtle)",
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
                    background: customUnit === "min" ? "var(--accent-subtle)" : "transparent",
                    color: customUnit === "min" ? "var(--text-primary)" : "var(--text-muted)",
                    border: "1px solid var(--border-subtle)",
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
                <Check size={11} /> Apply
              </button>
            </div>
          )}

          {/* LIVE TIMER COUNTDOWN STATUS */}
          <div
            style={{
              marginTop: 6,
              padding: "8px 10px",
              borderRadius: 7,
              background: "var(--bg-subtle)",
              border: "1px solid var(--border-default)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span
                  className="live-dot"
                  style={{
                    background: countdown !== null && countdown <= 3 ? "var(--danger)" : "var(--warning)",
                    boxShadow: `0 0 8px ${countdown !== null && countdown <= 3 ? "var(--danger)" : "var(--warning)"}`,
                  }}
                />
                <span style={{ fontSize: 11, color: "var(--text-primary)", fontWeight: 550 }}>
                  Next notification in:{" "}
                  <strong style={{ fontSize: 12 }}>
                    {countdown !== null ? `${countdown}s` : "Calculating..."}
                  </strong>
                </span>
              </div>
              <span style={{ fontSize: 9.5, color: "var(--text-muted)" }}>
                Cadence: {devMode ? `${devIntervalSeconds}s` : "50m"}
              </span>
            </div>
            <p style={{ margin: "5px 0 0", fontSize: 9.5, color: "var(--text-muted)", lineHeight: 1.35 }}>
              A notification toast will appear at the <strong>bottom-right corner</strong> of your screen.
              Clicking it immediately opens the <strong>Reflect</strong> wizard.
            </p>
          </div>
        </div>
      </section>

      {/* 3. CHECK-IN PREFERENCES */}
      <section className="settings-card">
        <div style={{ padding: "8px 0 4px", display: "flex", alignItems: "center", gap: 6 }}>
          <Bell size={13} color="var(--accent-primary)" />
          <span className="section-kicker" style={{ color: "var(--accent-primary)" }}>HOURLY REFLECTION</span>
        </div>

        <div className="setting-row">
          <div className="setting-copy">
            <strong>Hourly Reflection</strong>
            <span>Prompt for quick check-in after work blocks</span>
          </div>
          <button
            type="button"
            className={`secondary-button ${!checkInsPaused ? "is-active" : ""}`}
            style={{
              padding: "3px 8px",
              fontSize: 10,
              fontWeight: 600,
              background: !checkInsPaused ? "var(--success-subtle)" : "var(--bg-subtle)",
              borderColor: !checkInsPaused ? "var(--success)" : "var(--border-default)",
              color: !checkInsPaused ? "var(--success)" : "var(--text-muted)",
            }}
            onClick={() => {
              const newVal = !checkInsPaused;
              setCheckInsPaused(newVal);
              void saveSchedulerSetting({ checkInsPaused: newVal });
            }}
            aria-label="Toggle hourly reflection"
          >
            {!checkInsPaused ? "Enabled" : "Paused"}
          </button>
        </div>

        <div className="setting-row">
          <div className="setting-copy">
            <strong>After-Focus Reflection</strong>
            <span>Ask what happened when a focus block ends</span>
          </div>
          <button
            type="button"
            className={`secondary-button ${afterFocusReflection ? "is-active" : ""}`}
            style={{
              padding: "3px 8px",
              fontSize: 10,
              fontWeight: 600,
              background: afterFocusReflection ? "var(--success-subtle)" : "var(--bg-subtle)",
              borderColor: afterFocusReflection ? "var(--success)" : "var(--border-default)",
              color: afterFocusReflection ? "var(--success)" : "var(--text-muted)",
            }}
            onClick={() => {
              const newVal = !afterFocusReflection;
              setAfterFocusReflection(newVal);
              void saveSchedulerSetting({ afterFocusReflection: newVal });
            }}
            aria-label="Toggle after focus reflection"
          >
            {afterFocusReflection ? "Enabled" : "Disabled"}
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
              className="secondary-button"
              style={{
                padding: "3px 8px",
                fontSize: 10,
                fontWeight: 600,
                background: quietHoursEnabled ? "var(--accent-subtle)" : "var(--bg-subtle)",
                borderColor: quietHoursEnabled ? "var(--accent-primary)" : "var(--border-default)",
                color: quietHoursEnabled ? "var(--accent-primary)" : "var(--text-muted)",
              }}
              onClick={() => {
                const newVal = !quietHoursEnabled;
                setQuietHoursEnabled(newVal);
                void saveSchedulerSetting({ quietHoursEnabled: newVal });
              }}
              aria-label="Toggle quiet hours"
            >
              {quietHoursEnabled ? "Active" : "Off"}
            </button>
          </div>

          {quietHoursEnabled && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
              <Clock size={12} color="var(--text-muted)" />
              <input
                type="time"
                value={quietHoursStart}
                onChange={(e) => {
                  setQuietHoursStart(e.target.value);
                  void saveSchedulerSetting({ quietHoursStart: e.target.value });
                }}
                style={{
                  background: "var(--bg-subtle)",
                  border: "1px solid var(--border-default)",
                  color: "var(--text-primary)",
                  padding: "3px 6px",
                  borderRadius: 5,
                  fontSize: 10.5,
                }}
              />
              <span style={{ fontSize: 10, color: "var(--text-muted)" }}>to</span>
              <input
                type="time"
                value={quietHoursEnd}
                onChange={(e) => {
                  setQuietHoursEnd(e.target.value);
                  void saveSchedulerSetting({ quietHoursEnd: e.target.value });
                }}
                style={{
                  background: "var(--bg-subtle)",
                  border: "1px solid var(--border-default)",
                  color: "var(--text-primary)",
                  padding: "3px 6px",
                  borderRadius: 5,
                  fontSize: 10.5,
                }}
              />
            </div>
          )}
        </div>
      </section>

      {/* 4. FOCUS SETTINGS */}
      <section className="settings-card">
        <div style={{ padding: "8px 0 4px", display: "flex", alignItems: "center", gap: 6 }}>
          <Timer size={13} color="var(--accent-primary)" />
          <span className="section-kicker" style={{ color: "var(--accent-primary)" }}>FOCUS MODE</span>
        </div>

        <div className="setting-row">
          <div className="setting-copy">
            <strong>Duration Presets</strong>
            <span>Standard intentional execution blocks</span>
          </div>
          <span style={{ fontSize: 10.5, color: "var(--text-secondary)", fontWeight: 550 }}>
            25m • 50m • Custom
          </span>
        </div>

        <div className="setting-row">
          <div className="setting-copy">
            <strong>Custom Duration Limits</strong>
            <span>Bounded block duration</span>
          </div>
          <span style={{ fontSize: 10.5, color: "var(--text-muted)" }}>5 to 180 min</span>
        </div>
      </section>

      {/* 5. PRIVACY SETTINGS */}
      <section className="settings-card">
        <div style={{ padding: "8px 0 4px", display: "flex", alignItems: "center", gap: 6 }}>
          <ShieldCheck size={13} color="var(--success)" />
          <span className="section-kicker" style={{ color: "var(--success)" }}>PRIVACY & TRACKING</span>
        </div>

        <div className="setting-row">
          <div className="setting-copy">
            <strong>Private by Default</strong>
            <span>No page content, passwords, or keystrokes</span>
          </div>
          <span className="status-pill good">Protected</span>
        </div>
      </section>
    </main>
  );
}
