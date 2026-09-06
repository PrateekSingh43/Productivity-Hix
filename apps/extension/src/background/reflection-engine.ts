import { activityEngine, type ActivityState } from "./activity-engine";
import { showCheckInNotification } from "./notifications";

const STORAGE_KEY = "productivehix_reflection_engine_state";
const SCHEDULER_STORAGE_KEY = "productivehix_scheduler_state"; // For reading user settings

interface EngineState {
  activeTimeMs: number;
  lastNotificationSentAt: number | null;
  cooldownUntil: number | null;
}

const DEFAULT_STATE: EngineState = {
  activeTimeMs: 0,
  lastNotificationSentAt: null,
  cooldownUntil: null,
};

export class ReflectionEngine {
  private state: EngineState = { ...DEFAULT_STATE };
  private config: any = {};
  private loaded = false;
  private isTriggering = false;
  private previousActivityState: ActivityState = "IDLE";

  constructor() {
    this.init();
  }

  private async init() {
    await this.loadState();
    
    // Subscribe to raw ticks
    activityEngine.subscribe((state, dtMs, now) => {
      this.handleTick(state, dtMs, now);
    });
  }

  private async loadState() {
    const data = await chrome.storage.local.get([STORAGE_KEY, SCHEDULER_STORAGE_KEY]);
    if (data[STORAGE_KEY]) {
      this.state = { ...DEFAULT_STATE, ...data[STORAGE_KEY] };
    }
    
    // Load config from old scheduler state so UI settings (like 50m / 10s presets) continue working
    if (data[SCHEDULER_STORAGE_KEY]) {
      this.config = data[SCHEDULER_STORAGE_KEY];
    } else {
      this.config = { devMode: true, devIntervalSeconds: 10, checkInsPaused: false, sleepScheduleEnabled: true, sleepStart: "23:00", sleepEnd: "07:00" };
    }
    this.loaded = true;
  }

  private async saveState() {
    await chrome.storage.local.set({ [STORAGE_KEY]: this.state });
  }

  public async reloadConfig() {
    const data = await chrome.storage.local.get(SCHEDULER_STORAGE_KEY);
    if (data[SCHEDULER_STORAGE_KEY]) {
      this.config = data[SCHEDULER_STORAGE_KEY];
      
      // If the cooldown in the UI was reset, clear our cooldown
      if (!this.config.checkInCooldownUntil) {
        this.state.cooldownUntil = null;
        await this.saveState();
      }
    }
  }

  public async forceReset() {
    this.state.activeTimeMs = 0;
    this.state.cooldownUntil = null;
    await this.saveState();
  }

  public async forceTrigger() {
    await this.triggerNotification(Date.now(), true);
  }

  private isWithinSleepSchedule(nowMs: number): boolean {
    if (!this.config.sleepScheduleEnabled) return false;
    try {
      const now = new Date(nowMs);
      const [startH, startM] = (this.config.sleepStart || "23:00").split(":").map(Number);
      const [endH, endM] = (this.config.sleepEnd || "07:00").split(":").map(Number);
      const currentMinutes = now.getHours() * 60 + now.getMinutes();
      const startMinutes = (startH ?? 23) * 60 + (startM ?? 0);
      const endMinutes = (endH ?? 7) * 60 + (endM ?? 0);

      if (startMinutes <= endMinutes) {
        return currentMinutes >= startMinutes && currentMinutes < endMinutes;
      }
      return currentMinutes >= startMinutes || currentMinutes < endMinutes;
    } catch {
      return false;
    }
  }

  private async handleTick(activityState: ActivityState, dtMs: number, now: number) {
    if (!this.loaded) return;
    if (this.config.checkInsPaused) return;

    if (this.isWithinSleepSchedule(now)) {
      // During sleep schedule, do not accumulate time, and do not trigger.
      this.previousActivityState = activityState;
      return;
    }

    // Accumulate active time
    if (activityState === "ACTIVE") {
      this.state.activeTimeMs += dtMs;
    }

    // Edge trigger: if transitioning from ACTIVE to IDLE, evaluate if we should show a check-in
    if (this.previousActivityState === "ACTIVE" && activityState === "IDLE") {
      await this.evaluateEligibility(now);
    }

    this.previousActivityState = activityState;

    // Periodically save state (every 30 seconds)
    if (now % 30000 < 1000) {
      void this.saveState();
    }
  }

  private async evaluateEligibility(now: number) {
    if (this.state.cooldownUntil && now < this.state.cooldownUntil) {
      return;
    }

    const requiredMs = this.config.devMode
      ? Math.max(5000, (this.config.devIntervalSeconds || 10) * 1000)
      : 50 * 60 * 1000; // 50 minutes

    if (this.state.activeTimeMs >= requiredMs) {
      await this.triggerNotification(now, false);
    }
  }

  private async isFocusSessionActive(): Promise<boolean> {
    try {
      const { apiClient } = await import("../api/client");
      const sessions = await apiClient.getSessions();
      return sessions.some(s => !s.endedAt);
    } catch {
      return false;
    }
  }

  private async triggerNotification(now: number, force: boolean) {
    if (this.isTriggering) return;
    this.isTriggering = true;

    try {
      const focusActive = await this.isFocusSessionActive();
      if (focusActive && !force) {
        console.log("[ReflectionEngine] Blocked periodic notification because a focus session is active.");
        return;
      }

      const activeMinutes = Math.max(1, Math.round(this.state.activeTimeMs / 60000));

      await showCheckInNotification({
        activeMinutes,
        isAwayReview: false
      });

      // Reset accumulators and set cooldown
      this.state.activeTimeMs = 0;
      this.state.lastNotificationSentAt = now;
      
      const intervalSec = this.config.devMode ? (this.config.devIntervalSeconds || 10) : 50 * 60;
      const cooldownMs = this.config.devMode ? 2000 : Math.min(15 * 60 * 1000, intervalSec * 1000);
      this.state.cooldownUntil = now + cooldownMs;

      // Also update the old CheckInScheduler config so the UI countdown resets properly
      this.config.checkInCooldownUntil = new Date(this.state.cooldownUntil).toISOString();
      this.config.nextTriggerAt = now + intervalSec * 1000;
      this.config.activeSecondsInWindow = 0;
      await chrome.storage.local.set({ [SCHEDULER_STORAGE_KEY]: this.config });

      await this.saveState();
    } finally {
      this.isTriggering = false;
    }
  }
}

export const reflectionEngine = new ReflectionEngine();
