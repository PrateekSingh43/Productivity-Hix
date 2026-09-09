import { activityEngine, type ActivityState } from "./activity-engine";
import { showCheckInNotification } from "./notifications";

const SCHEDULER_STORAGE_KEY = "productivehix_scheduler_state"; // For reading user settings
const STORAGE_KEY = "productivehix_inactivity_engine_state";

interface EngineState {
  lastActiveMs: number;
}

export class InactivityEngine {
  private state: EngineState = { lastActiveMs: Date.now() };
  private config: any = {};
  private loaded = false;
  private isTriggering = false;
  private previousActivityState: ActivityState = "ACTIVE";

  constructor() {
    this.init();
  }

  private async init() {
    await this.loadState();
    
    activityEngine.subscribe((state, dtMs, now) => {
      this.handleTick(state, now);
    });
  }

  private async loadState() {
    const data = await chrome.storage.local.get([STORAGE_KEY, SCHEDULER_STORAGE_KEY]);
    if (data[STORAGE_KEY]) {
      this.state = { ...this.state, ...data[STORAGE_KEY] };
    }
    
    if (data[SCHEDULER_STORAGE_KEY]) {
      this.config = data[SCHEDULER_STORAGE_KEY];
    } else {
      this.config = { devMode: true, sleepScheduleEnabled: true, sleepStart: "23:00", sleepEnd: "07:00" };
    }
    this.loaded = true;
  }

  private async saveState() {
    await chrome.storage.local.set({ [STORAGE_KEY]: this.state });
  }

  public async reloadConfig() {
    const data = await chrome.storage.local.get(SCHEDULER_STORAGE_KEY);
    if (data[SCHEDULER_STORAGE_KEY]) {
      this.config = { ...this.config, ...data[SCHEDULER_STORAGE_KEY] };
    }
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

  public async handleWakeupGap(gapMs: number, now: number) {
    if (!this.loaded) await this.loadState();
    const thresholdMs = this.config.devMode ? 15000 : 15 * 60 * 1000;
    if (gapMs >= thresholdMs) {
      console.log(`[InactivityEngine] Wake-up gap detected: ${gapMs}ms. Triggering away review.`);
      await this.triggerAwayReviewNotification(gapMs);
    }
    this.state.lastActiveMs = now;
    this.previousActivityState = "ACTIVE";
    await this.saveState();
  }

  private async handleTick(activityState: ActivityState, now: number) {
    if (!this.loaded) return;

    if (activityState === "ACTIVE") {
      // Transition from IDLE to ACTIVE
      if (this.previousActivityState === "IDLE") {
        const gapMs = now - this.state.lastActiveMs;
        const thresholdMs = this.config.devMode ? 15000 : 15 * 60 * 1000;
        
        if (gapMs >= thresholdMs) {
          console.log(`[InactivityEngine] Away review triggered for gap: ${gapMs}ms`);
          await this.triggerAwayReviewNotification(gapMs);
        }
      }
      
      this.state.lastActiveMs = now;
      if (now % 30000 < 1000) {
        void this.saveState();
      }
    }

    this.previousActivityState = activityState;
  }

  private async triggerAwayReviewNotification(gapMs: number) {
    if (this.isTriggering) return;
    this.isTriggering = true;
    try {
      const gapTotalMinutes = Math.max(1, Math.round(gapMs / (1000 * 60)));
      let timeStr: string;
      if (gapTotalMinutes >= 60) {
        const hours = (gapTotalMinutes / 60).toFixed(1).replace(/\.0$/, "");
        timeStr = `${hours} hour${hours === "1" ? "" : "s"}`;
      } else {
        timeStr = `${gapTotalMinutes} minute${gapTotalMinutes === 1 ? "" : "s"}`;
      }

      await showCheckInNotification({
        isAwayReview: true,
        awayTimeStr: timeStr,
      });
      
    } finally {
      this.isTriggering = false;
    }
  }
}

export const inactivityEngine = new InactivityEngine();
