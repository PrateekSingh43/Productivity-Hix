import { useState, useEffect, useRef, useMemo } from "react";
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
  Sparkles,
} from "lucide-react";
import {
  apiClient,
  updateSchedulerConfig,
  triggerCheckInNotification,
  type ExtensionStatus,
} from "../api/client";
import {
  getDayBoundaryOptions,
  getQuietHoursOptions,
  formatTimeTo12Hour,
} from "@repo/validation";

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

  // User preferences (PostgreSQL backed)
  const [dayBoundary, setDayBoundary] = useState("00:00");
  const [savingPrefs, setSavingPrefs] = useState(false);

  // Check-in & Quiet hours settings
  const [checkInsPaused, setCheckInsPaused] = useState(scheduler?.checkInsPaused ?? false);
  const [quietHoursEnabled, setQuietHoursEnabled] = useState(scheduler?.quietHoursEnabled ?? true);
  const [quietHoursStart, setQuietHoursStart] = useState(scheduler?.quietHoursStart ?? "23:58");
  const [quietHoursEnd, setQuietHoursEnd] = useState(scheduler?.quietHoursEnd ?? "08:00");
  const [afterFocusReflection, setAfterFocusReflection] = useState(scheduler?.afterFocusReflection ?? true);
  const [suppressDuringFocus, setSuppressDuringFocus] = useState(
    (scheduler as any)?.suppressCheckInsDuringFocus ?? true,
  );

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

  // Load backend user preferences on mount and sync to local scheduler
  useEffect(() => {
    let mounted = true;
    apiClient
      .getUserPreferences()
      .then((prefs) => {
        if (!mounted || !prefs) return;
        setDayBoundary(prefs.dayBoundary);
        setQuietHoursEnabled(prefs.quietHoursEnabled);
        setQuietHoursStart(prefs.quietHoursStart);
        setQuietHoursEnd(prefs.quietHoursEnd);
        if (prefs.suppressCheckInsDuringFocus !== undefined) {
          setSuppressDuringFocus(prefs.suppressCheckInsDuringFocus);
        }

        void updateSchedulerConfig({
          quietHoursEnabled: prefs.quietHoursEnabled,
          quietHoursStart: prefs.quietHoursStart,
          quietHoursEnd: prefs.quietHoursEnd,
          suppressCheckInsDuringFocus: prefs.suppressCheckInsDuringFocus,
        });
      })
      .catch((err) => console.error("Failed to load user preferences in extension:", err));

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (scheduler) {
      setCheckInsPaused(scheduler.checkInsPaused);
      setQuietHoursEnabled(scheduler.quietHoursEnabled);
      setQuietHoursStart(scheduler.quietHoursStart);
      setQuietHoursEnd(scheduler.quietHoursEnd);
      setAfterFocusReflection(scheduler.afterFocusReflection);
      if ((scheduler as any).suppressCheckInsDuringFocus !== undefined) {
        setSuppressDuringFocus((scheduler as any).suppressCheckInsDuringFocus);
      }
      setDevMode(scheduler.devMode);
      setDevIntervalSeconds(scheduler.devIntervalSeconds);

      if (scheduler.nextTriggerAt) {
        const remaining = Math.max(0, Math.ceil((scheduler.nextTriggerAt - Date.now()) / 1000));
        setCountdown(remaining);
      }
    }
  }, [scheduler]);

  // Live 1-second countdown ticker in UI (Purely display; background engine controls triggers)
  useEffect(() => {
    const timer = setInterval(() => {
      if (scheduler?.nextTriggerAt) {
        const remaining = Math.max(0, Math.ceil((scheduler.nextTriggerAt - Date.now()) / 1000));
        setCountdown(remaining);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [scheduler?.nextTriggerAt]);

  const saveSchedulerSetting = async (patch: {
    checkInsPaused?: boolean;
    quietHoursEnabled?: boolean;
    quietHoursStart?: string;
    quietHoursEnd?: string;
    afterFocusReflection?: boolean;
    suppressCheckInsDuringFocus?: boolean;
    devMode?: boolean;
    devIntervalSeconds?: number;
    customIntervalSeconds?: number;
    resetCooldown?: boolean;
  }) => {
    await updateSchedulerConfig(patch);
    onRefresh();
  };

  const handleDayBoundaryChange = async (newBoundary: string) => {
    setDayBoundary(newBoundary);
    setSavingPrefs(true);
    try {
      await apiClient.updateUserPreferences({ dayBoundary: newBoundary });
      onRefresh();
    } catch (err) {
      console.error("Failed to save day boundary preference:", err);
    } finally {
      setSavingPrefs(false);
    }
  };

  const handleQuietHoursChange = async (patch: {
    quietHoursEnabled?: boolean;
    quietHoursStart?: string;
    quietHoursEnd?: string;
  }) => {
    if (patch.quietHoursEnabled !== undefined) setQuietHoursEnabled(patch.quietHoursEnabled);
    if (patch.quietHoursStart) setQuietHoursStart(patch.quietHoursStart);
    if (patch.quietHoursEnd) setQuietHoursEnd(patch.quietHoursEnd);

    setSavingPrefs(true);
    try {
      await Promise.all([
        apiClient.updateUserPreferences(patch),
        saveSchedulerSetting(patch),
      ]);
    } catch (err) {
      console.error("Failed to save quiet hours preference:", err);
    } finally {
      setSavingPrefs(false);
    }
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

  const dayBoundaryOptions = useMemo(() => getDayBoundaryOptions(), []);
  const quietStartOptions = useMemo(
    () => getQuietHoursOptions([quietHoursStart]),
    [quietHoursStart],
  );
  const quietEndOptions = useMemo(
    () => getQuietHoursOptions([quietHoursEnd]),
    [quietHoursEnd],
  );

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
          <Sun size={13} style={{ color: "var(--text-muted)" }} />
          <span className="section-kicker">APPEARANCE & THEME</span>
        </div>

        <div
          className="setting-row"
          style={{
            flexDirection: "column",
            alignItems: "stretch",
            padding: "8px 0",
            minHeight: "auto",
            gap: 8,
          }}
        >
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
              className={`filter-toggle ${theme === "dark" ? "active" : ""}`}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 5,
                padding: "6px 8px",
              }}
            >
              <Moon size={12} /> Dark
            </button>

            <button
              type="button"
              onClick={() => handleThemeChange("light")}
              className={`filter-toggle ${theme === "light" ? "active" : ""}`}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 5,
                padding: "6px 8px",
              }}
            >
              <Sun size={12} /> Light
            </button>

            <button
              type="button"
              onClick={() => handleThemeChange("system")}
              className={`filter-toggle ${theme === "system" ? "active" : ""}`}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 5,
                padding: "6px 8px",
              }}
            >
              <Monitor size={12} /> System
            </button>
          </div>
        </div>
      </section>

      {/* 2. PRODUCTIVE DAY ROLLOVER */}
      <section className="settings-card">
        <div
          style={{
            padding: "8px 0 4px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Clock size={13} style={{ color: "var(--accent-primary)" }} />
            <span className="section-kicker" style={{ color: "var(--accent-primary)" }}>
              PRODUCTIVE CYCLE & ROLLOVER
            </span>
          </div>
          {savingPrefs && (
            <span
              style={{
                fontSize: 9.5,
                color: "var(--accent-primary)",
                fontWeight: 550,
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <Sparkles size={10} /> Saving...
            </span>
          )}
        </div>

        <div
          className="setting-row"
          style={{
            flexDirection: "column",
            alignItems: "stretch",
            padding: "8px 0",
            minHeight: "auto",
            gap: 6,
          }}
        >
          <div className="setting-copy">
            <strong>Day Rollover Boundary</strong>
            <span>Exact hour your daily goals, tasks, and telemetry reset</span>
          </div>

          <select
            value={dayBoundary}
            onChange={(e) => void handleDayBoundaryChange(e.target.value)}
            style={{
              width: "100%",
              background: "var(--bg-subtle)",
              border: "1px solid var(--border-default)",
              color: "var(--text-primary)",
              padding: "6px 8px",
              borderRadius: 6,
              fontSize: 11,
              outline: "none",
              cursor: "pointer",
            }}
          >
            {dayBoundaryOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <span style={{ fontSize: 9.5, color: "var(--text-muted)" }}>
            Current rollover:{" "}
            <strong style={{ color: "var(--text-primary)" }}>
              {formatTimeTo12Hour(dayBoundary, { showAnnotations: true })}
            </strong>
          </span>
        </div>
      </section>

      {/* 3. NOTIFICATION TRIGGER & CADENCE TESTING */}
      <section className="settings-card" style={{ borderColor: "var(--border-default)" }}>
        <div
          style={{
            padding: "8px 0 4px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Zap size={13} style={{ color: "var(--warning)" }} />
            <span className="section-kicker" style={{ color: "var(--warning)" }}>
              NOTIFICATION TRIGGER & TIMER
            </span>
          </div>
          <button
            type="button"
            onClick={handleTestNow}
            className="warning-button"
            style={{
              padding: "3px 8px",
              fontSize: 10,
              gap: 4,
            }}
          >
            <Play size={10} fill="currentColor" />
            {testDispatched ? "Triggered!" : "Test Now"}
          </button>
        </div>

        <div
          className="setting-row"
          style={{
            flexDirection: "column",
            alignItems: "stretch",
            padding: "8px 0",
            minHeight: "auto",
            gap: 6,
          }}
        >
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
              const isSelected =
                !isCustom &&
                (preset.isProd ? !devMode : devMode && devIntervalSeconds === preset.sec);
              return (
                <button
                  key={preset.label}
                  type="button"
                  className={`filter-toggle ${isSelected ? "active" : ""}`}
                  onClick={() => void handleSelectPreset(preset.sec, preset.isProd)}
                  style={{
                    flex: 1,
                    marginTop: 0,
                    padding: "6px 2px",
                    fontSize: 10,
                  }}
                >
                  {preset.label}
                </button>
              );
            })}
            <button
              type="button"
              className={`filter-toggle ${isCustom ? "active" : ""}`}
              onClick={() => setIsCustom(true)}
              style={{
                padding: "6px 8px",
                fontSize: 10,
                marginTop: 0,
              }}
            >
              Custom
            </button>
          </div>

          {/* CUSTOM TIME INPUT */}
          {isCustom && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                marginTop: 6,
                padding: "6px 8px",
                background: "var(--bg-subtle)",
                borderRadius: 7,
                border: "1px solid var(--border-default)",
              }}
            >
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
                  className={`filter-toggle ${customUnit === "sec" ? "active" : ""}`}
                  style={{ padding: "3px 6px", fontSize: 9.5 }}
                >
                  Sec
                </button>
                <button
                  type="button"
                  onClick={() => setCustomUnit("min")}
                  className={`filter-toggle ${customUnit === "min" ? "active" : ""}`}
                  style={{ padding: "3px 6px", fontSize: 9.5 }}
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
                    background:
                      countdown !== null && countdown <= 3 ? "var(--danger)" : "var(--warning)",
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
            <p
              style={{
                margin: "5px 0 0",
                fontSize: 9.5,
                color: "var(--text-muted)",
                lineHeight: 1.35,
              }}
            >
              A notification toast will appear at the <strong>bottom-right corner</strong> of your
              screen. Clicking it immediately opens the <strong>Reflect</strong> wizard.
            </p>
          </div>
        </div>
      </section>

      {/* 4. CHECK-IN PREFERENCES & REST SCHEDULE */}
      <section className="settings-card">
        <div style={{ padding: "8px 0 4px", display: "flex", alignItems: "center", gap: 6 }}>
          <Bell size={13} color="var(--accent-primary)" />
          <span className="section-kicker" style={{ color: "var(--accent-primary)" }}>
            HOURLY REFLECTION & REST
          </span>
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

        <div className="setting-row">
          <div className="setting-copy">
            <strong>Silence During Focus</strong>
            <span>Hold 50m check-ins while a focus session is active</span>
          </div>
          <button
            type="button"
            className={`secondary-button ${suppressDuringFocus ? "is-active" : ""}`}
            style={{
              padding: "3px 8px",
              fontSize: 10,
              fontWeight: 600,
              background: suppressDuringFocus ? "var(--success-subtle)" : "var(--bg-subtle)",
              borderColor: suppressDuringFocus ? "var(--success)" : "var(--border-default)",
              color: suppressDuringFocus ? "var(--success)" : "var(--text-muted)",
            }}
            onClick={() => {
              const newVal = !suppressDuringFocus;
              setSuppressDuringFocus(newVal);
              void saveSchedulerSetting({ suppressCheckInsDuringFocus: newVal });
              void apiClient.updateUserPreferences({ suppressCheckInsDuringFocus: newVal });
            }}
            aria-label="Toggle silence during focus"
          >
            {suppressDuringFocus ? "Enabled" : "Disabled"}
          </button>
        </div>

        <div
          className="setting-row"
          style={{
            flexDirection: "column",
            alignItems: "stretch",
            padding: "8px 0",
            minHeight: "auto",
            gap: 6,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div className="setting-copy">
              <strong>Quiet Hours (Rest Schedule)</strong>
              <span>Suppress check-ins and away reviews during rest</span>
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
                void handleQuietHoursChange({ quietHoursEnabled: newVal });
              }}
              aria-label="Toggle quiet hours"
            >
              {quietHoursEnabled ? "Active" : "Off"}
            </button>
          </div>

          {quietHoursEnabled && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 8,
                marginTop: 4,
                padding: "8px",
                borderRadius: 6,
                background: "var(--bg-subtle)",
                border: "1px solid var(--border-default)",
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <span style={{ fontSize: 9.5, color: "var(--text-muted)", fontWeight: 550 }}>
                  Rest Begins (Bedtime)
                </span>
                <select
                  value={quietHoursStart}
                  onChange={(e) => void handleQuietHoursChange({ quietHoursStart: e.target.value })}
                  style={{
                    background: "var(--bg-surface)",
                    border: "1px solid var(--border-default)",
                    color: "var(--text-primary)",
                    padding: "4px 6px",
                    borderRadius: 5,
                    fontSize: 10.5,
                    outline: "none",
                    cursor: "pointer",
                  }}
                >
                  {quietStartOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <span style={{ fontSize: 9.5, color: "var(--text-muted)", fontWeight: 550 }}>
                  Rest Ends (Wake Up)
                </span>
                <select
                  value={quietHoursEnd}
                  onChange={(e) => void handleQuietHoursChange({ quietHoursEnd: e.target.value })}
                  style={{
                    background: "var(--bg-surface)",
                    border: "1px solid var(--border-default)",
                    color: "var(--text-primary)",
                    padding: "4px 6px",
                    borderRadius: 5,
                    fontSize: 10.5,
                    outline: "none",
                    cursor: "pointer",
                  }}
                >
                  {quietEndOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* 5. FOCUS SETTINGS */}
      <section className="settings-card">
        <div style={{ padding: "8px 0 4px", display: "flex", alignItems: "center", gap: 6 }}>
          <Timer size={13} color="var(--accent-primary)" />
          <span className="section-kicker" style={{ color: "var(--accent-primary)" }}>
            FOCUS MODE
          </span>
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

      {/* 6. PRIVACY SETTINGS */}
      <section className="settings-card">
        <div style={{ padding: "8px 0 4px", display: "flex", alignItems: "center", gap: 6 }}>
          <ShieldCheck size={13} color="var(--success)" />
          <span className="section-kicker" style={{ color: "var(--success)" }}>
            PRIVACY & TRACKING
          </span>
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
