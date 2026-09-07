import { showCheckInNotification } from "./notifications";

export type SchedulerState = {
  lastCompletedCheckIn: string | null;
  lastNotificationSentAt: string | null;
  lastNotificationClickedAt: string | null;
  lastCheckInOpenedAt: string | null;
  lastEligibleActivityAt: string | null;
  checkInCooldownUntil: string | null;
  checkInsPaused: boolean;
  activeSecondsInWindow: number;
  notificationsSentCount: number;
  checkInsCompletedCount: number;
  dominantDomain: string | null;
  devMode: boolean;
  devIntervalSeconds: number;
  customIntervalSeconds: number;
  nextTriggerAt: number | null; // Used for timeouts or cooldown expiration tracking
  
  sleepScheduleEnabled: boolean;
  sleepStart: string; // "HH:MM" e.g. "23:00"
  sleepEnd: string; // "HH:MM" e.g. "07:00"
  afterFocusReflection: boolean;
};

const SCHEDULER_STORAGE_KEY = "productivehix_scheduler_state";

const DEFAULT_STATE: SchedulerState = {
  lastCompletedCheckIn: null,
  lastNotificationSentAt: null,
  lastNotificationClickedAt: null,
  lastCheckInOpenedAt: null,
  lastEligibleActivityAt: null,
  checkInCooldownUntil: null,
  checkInsPaused: false,
  activeSecondsInWindow: 0,
  notificationsSentCount: 0,
  checkInsCompletedCount: 0,
  dominantDomain: null,
  devMode: true,
  devIntervalSeconds: 10,
  customIntervalSeconds: 10,
  nextTriggerAt: null,
  sleepScheduleEnabled: false,
  sleepStart: "23:00",
  sleepEnd: "07:00",
  afterFocusReflection: true,
};

function isWithinSleepSchedule(nowMs: number, startStr: string, endStr: string): boolean {
  try {
    const now = new Date(nowMs);
    const [startH, startM] = startStr.split(":").map(Number);
    const [endH, endM] = endStr.split(":").map(Number);
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

export class CheckInScheduler {
  private state: SchedulerState = { ...DEFAULT_STATE };
  private domainSeconds: Record<string, number> = {};
  private loaded = false;
  private isTriggering = false; // Lock to prevent race conditions

  async loadState(): Promise<SchedulerState> {
    const data = await chrome.storage.local.get(SCHEDULER_STORAGE_KEY);
    if (data[SCHEDULER_STORAGE_KEY]) {
      this.state = { ...DEFAULT_STATE, ...(data[SCHEDULER_STORAGE_KEY] as Partial<SchedulerState>) };
      // Map old quietHours state to sleepSchedule if present
      if ((data[SCHEDULER_STORAGE_KEY] as any).quietHoursEnabled !== undefined) {
         this.state.sleepScheduleEnabled = (data[SCHEDULER_STORAGE_KEY] as any).quietHoursEnabled;
         this.state.sleepStart = (data[SCHEDULER_STORAGE_KEY] as any).quietHoursStart || "23:00";
         this.state.sleepEnd = (data[SCHEDULER_STORAGE_KEY] as any).quietHoursEnd || "07:00";
      }
    } else {
      this.state = { ...DEFAULT_STATE, nextTriggerAt: Date.now() + DEFAULT_STATE.devIntervalSeconds * 1000 };
      await this.saveState();
    }
    this.loaded = true;
    return this.state;
  }

  async saveState(): Promise<void> {
    await chrome.storage.local.set({ [SCHEDULER_STORAGE_KEY]: this.state });
  }

  getState(): SchedulerState {
    return { ...this.state };
  }

  getRemainingSeconds(): number {
    const requiredActiveSeconds = this.state.devMode ? Math.max(5, this.state.devIntervalSeconds) : 50 * 60;
    return Math.max(0, requiredActiveSeconds - this.state.activeSecondsInWindow);
  }

  async recordActivity(domain: string, durationMs: number): Promise<void> {
    if (!this.loaded) await this.loadState();
    if (this.state.checkInsPaused) return;

    const now = Date.now();
    const seconds = Math.max(1, Math.round(durationMs / 1000));

    // Handle long gaps (AWAY_REVIEW) logic
    if (this.state.lastEligibleActivityAt) {
      const lastActivityTime = Date.parse(this.state.lastEligibleActivityAt);
      const gapMs = now - lastActivityTime;
      // Fixed 1 hour threshold for AWAY_REVIEW regardless of dev mode, 
      // per user requirement: "should not open until the user has been inactive for more than one hour."
      const AWAY_THRESHOLD_MS = 60 * 60 * 1000;
      
      if (gapMs >= AWAY_THRESHOLD_MS) {
        // Did this gap happen during their sleep schedule?
        const asleep = this.state.sleepScheduleEnabled && isWithinSleepSchedule(now, this.state.sleepStart, this.state.sleepEnd);
        
        if (!asleep) {
          // Fire Away Review!
          await this.triggerAwayReviewNotification(gapMs);
          // Reset standard activity counter to prevent immediate double-fire
          this.state.activeSecondsInWindow = 0;
        } else {
          // If they were asleep, silently resume tracking without penalties or missed hourly backlogs
          console.log("[SCHEDULER] Resuming from sleep schedule. Ignoring gap.");
        }
      }
    }

    this.state.activeSecondsInWindow += seconds;
    this.state.lastEligibleActivityAt = new Date(now).toISOString();

    if (domain && domain !== "browser" && domain !== "unknown") {
      this.domainSeconds[domain] = (this.domainSeconds[domain] || 0) + seconds;
      let topDomain = this.state.dominantDomain;
      let maxSec = 0;
      for (const [d, s] of Object.entries(this.domainSeconds)) {
        if (s > maxSec) {
          maxSec = s;
          topDomain = d;
        }
      }
      this.state.dominantDomain = topDomain;
    }

    await this.saveState();
  }

  async notifyUserStoppedWorking(): Promise<void> {
    if (!this.loaded) await this.loadState();
    // This is called when the user transitions from RUNNING -> STOPPED (e.g. idle or focus lost)
    // We only trigger the notification if they have accrued enough active time.
    await this.triggerNotificationIfEligible();
  }

  private async isFocusSessionActive(): Promise<boolean> {
    try {
      // Need to dynamically import to avoid circular dependency if one exists,
      // but in this case we can import from client since they are in the same directory.
      const { apiClient } = await import("../api/client");
      const sessions = await apiClient.getSessions();
      return sessions.some(s => !s.endedAt);
    } catch {
      return false;
    }
  }

  evaluateEligibility(): { eligible: boolean; reason: string; nextCheckInMs?: number; remainingSeconds?: number } {
    if (this.state.checkInsPaused) {
      return { eligible: false, reason: "Check-ins are paused by user" };
    }

    const nowMs = Date.now();

    // Check sleep schedule
    if (this.state.sleepScheduleEnabled && isWithinSleepSchedule(nowMs, this.state.sleepStart, this.state.sleepEnd)) {
      return { eligible: false, reason: `Quiet hours / Sleep schedule active (${this.state.sleepStart}–${this.state.sleepEnd})` };
    }

    // Cooldown check
    if (this.state.checkInCooldownUntil) {
      const cooldownEnd = Date.parse(this.state.checkInCooldownUntil);
      if (nowMs < cooldownEnd) {
        const remainingSec = Math.round((cooldownEnd - nowMs) / 1000);
        return { eligible: false, reason: `In cooldown for another ${remainingSec}s`, nextCheckInMs: cooldownEnd - nowMs, remainingSeconds: remainingSec };
      }
    }

    // Meaningful Activity threshold
    const requiredActiveSeconds = this.state.devMode
      ? Math.max(5, this.state.devIntervalSeconds)
      : 50 * 60; // 50 minutes of meaningful activity in production

    if (this.state.activeSecondsInWindow >= requiredActiveSeconds) {
      return { eligible: true, reason: "Active activity threshold reached" };
    }

    const actRemainingSec = Math.max(0, requiredActiveSeconds - this.state.activeSecondsInWindow);
    return {
      eligible: false,
      reason: `Requires ${actRemainingSec}s more active time`,
      remainingSeconds: actRemainingSec,
    };
  }

  async triggerAwayReviewNotification(gapMs: number): Promise<boolean> {
    if (this.isTriggering) return false;
    this.isTriggering = true;
    try {
      const gapHours = (gapMs / (1000 * 60 * 60)).toFixed(1);
      const gapMinutes = Math.round(gapMs / (1000 * 60));
      
      const timeStr = this.state.devMode ? `${gapMinutes} minutes` : `${gapHours} hours`;

      // Wait for OS notification API
      await showCheckInNotification({
         isAwayReview: true,
         awayTimeStr: timeStr,
      });

      const now = Date.now();
      this.state.checkInCooldownUntil = new Date(now + 15 * 60 * 1000).toISOString(); // 15 min cooldown after away review
      this.state.lastNotificationSentAt = new Date(now).toISOString();
      await this.saveState();
      return true;
    } finally {
      this.isTriggering = false;
    }
  }

  async triggerNotificationIfEligible(force = false): Promise<boolean> {
    if (!this.loaded) await this.loadState();
    
    // Atomic lock to prevent sleep-wake barrage
    if (this.isTriggering) return false;
    this.isTriggering = true;

    try {
      const check = this.evaluateEligibility();
      if (!check.eligible && !force) {
        return false;
      }

      // Do not trigger periodic review if a focus session is active
      const focusActive = await this.isFocusSessionActive();
      if (focusActive && !force) {
        console.log("[SCHEDULER] Blocked periodic notification because a focus session is active.");
        return false;
      }

      const activeMinutes = Math.max(1, Math.round(this.state.activeSecondsInWindow / 60));
      
      // Wait for OS notification API
      await showCheckInNotification({
        activeMinutes,
        dominantContext: this.state.dominantDomain ?? undefined,
        isAwayReview: false
      });

      const now = Date.now();
      const intervalSec = this.state.devMode ? this.state.devIntervalSeconds || 10 : 50 * 60;
      const cooldownMs = this.state.devMode ? 2 * 1000 : Math.min(15 * 60 * 1000, intervalSec * 1000);
      
      this.state.checkInCooldownUntil = new Date(now + cooldownMs).toISOString();
      this.state.lastNotificationSentAt = new Date().toISOString();
      this.state.notificationsSentCount += 1;
      this.state.nextTriggerAt = now + intervalSec * 1000;

      await this.saveState();
      return true;
    } finally {
      this.isTriggering = false;
    }
  }

  async recordNotificationClicked(): Promise<void> {
    if (!this.loaded) await this.loadState();
    this.state.lastNotificationClickedAt = new Date().toISOString();
    this.state.lastCheckInOpenedAt = new Date().toISOString();
    await this.saveState();
  }

  async recordCheckInOpened(): Promise<void> {
    if (!this.loaded) await this.loadState();
    this.state.lastCheckInOpenedAt = new Date().toISOString();
    await this.saveState();
  }

  async recordCheckInCompleted(): Promise<void> {
    if (!this.loaded) await this.loadState();

    const now = Date.now();
    this.state.lastCompletedCheckIn = new Date(now).toISOString();
    this.state.activeSecondsInWindow = 0;
    this.domainSeconds = {};
    this.state.dominantDomain = null;
    this.state.checkInsCompletedCount += 1;

    const cooldownMs = this.state.devMode ? 5 * 1000 : 30 * 60 * 1000;
    this.state.checkInCooldownUntil = new Date(now + cooldownMs).toISOString();
    const intervalSec = this.state.devMode ? this.state.devIntervalSeconds || 10 : 50 * 60;
    this.state.nextTriggerAt = now + intervalSec * 1000;

    await this.saveState();
  }

  async resetTimer(seconds?: number): Promise<SchedulerState> {
    if (!this.loaded) await this.loadState();
    const intervalSec = seconds ?? this.state.devIntervalSeconds ?? 10;
    this.state.devIntervalSeconds = Math.max(5, intervalSec);
    this.state.customIntervalSeconds = this.state.devIntervalSeconds;
    this.state.checkInCooldownUntil = null;
    this.state.activeSecondsInWindow = 0;
    this.state.nextTriggerAt = Date.now() + this.state.devIntervalSeconds * 1000;
    await this.saveState();
    return { ...this.state };
  }

  async updateConfig(updates: {
    devMode?: boolean;
    devIntervalSeconds?: number;
    customIntervalSeconds?: number;
    checkInsPaused?: boolean;
    sleepScheduleEnabled?: boolean;
    sleepStart?: string;
    sleepEnd?: string;
    afterFocusReflection?: boolean;
    resetCooldown?: boolean;
  }): Promise<SchedulerState> {
    if (!this.loaded) await this.loadState();
    if (typeof updates.devMode === "boolean") this.state.devMode = updates.devMode;
    if (typeof updates.checkInsPaused === "boolean") this.state.checkInsPaused = updates.checkInsPaused;
    if (typeof updates.sleepScheduleEnabled === "boolean") this.state.sleepScheduleEnabled = updates.sleepScheduleEnabled;
    if (typeof (updates as any).quietHoursEnabled === "boolean") this.state.sleepScheduleEnabled = (updates as any).quietHoursEnabled;
    if (typeof updates.sleepStart === "string") this.state.sleepStart = updates.sleepStart;
    if (typeof (updates as any).quietHoursStart === "string") this.state.sleepStart = (updates as any).quietHoursStart;
    if (typeof updates.sleepEnd === "string") this.state.sleepEnd = updates.sleepEnd;
    if (typeof (updates as any).quietHoursEnd === "string") this.state.sleepEnd = (updates as any).quietHoursEnd;
    if (typeof updates.afterFocusReflection === "boolean") this.state.afterFocusReflection = updates.afterFocusReflection;

    const newInterval = updates.customIntervalSeconds ?? updates.devIntervalSeconds;
    if (typeof newInterval === "number") {
      this.state.devIntervalSeconds = Math.max(5, newInterval);
      this.state.customIntervalSeconds = this.state.devIntervalSeconds;
      this.state.checkInCooldownUntil = null;
      this.state.activeSecondsInWindow = 0;
      this.state.nextTriggerAt = Date.now() + this.state.devIntervalSeconds * 1000;
    } else if (updates.resetCooldown) {
      this.state.checkInCooldownUntil = null;
      this.state.nextTriggerAt = Date.now() + (this.state.devIntervalSeconds || 10) * 1000;
    }

    await this.saveState();
    return { ...this.state };
  }
}

export const checkInScheduler = new CheckInScheduler();
