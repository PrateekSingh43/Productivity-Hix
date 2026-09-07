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

  private async handleTick(activityState: ActivityState, now: number) {
    if (!this.loaded) return;

    if (activityState === "ACTIVE") {
      // Transition from IDLE to ACTIVE
      if (this.previousActivityState === "IDLE") {
        const gapMs = now - this.state.lastActiveMs;
        
        // Threshold: 1 hour in prod, 15s in dev mode
        const thresholdMs = this.config.devMode ? 15000 : 60 * 60 * 1000;
        
        if (gapMs >= thresholdMs) {
          // Determine if they were asleep.
          // If the gap started or ended in their sleep schedule, we assume they were sleeping.
          // Or if the gap is very long (e.g., > 4 hours) we might assume sleep, 
          // but for now we'll check if either the start of the gap or the end of the gap
          // fell within the sleep schedule.
          const asleepAtStart = this.isWithinSleepSchedule(this.state.lastActiveMs);
          const asleepAtEnd = this.isWithinSleepSchedule(now);
          const massiveGap = gapMs > 8 * 60 * 60 * 1000; // > 8 hours

          if (asleepAtStart || asleepAtEnd || massiveGap) {
            console.log(`[InactivityEngine] Huge gap (${gapMs}ms) detected, but fell within sleep constraints. Silently resuming.`);
          } else {
            console.log(`[InactivityEngine] Away review triggered for gap: ${gapMs}ms`);
            await this.triggerAwayReviewNotification(gapMs);
          }
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
      const gapHours = (gapMs / (1000 * 60 * 60)).toFixed(1);
      const gapMinutes = Math.round(gapMs / (1000 * 60));
      
      const timeStr = this.config.devMode ? `${gapMinutes} minutes` : `${gapHours} hours`;

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
