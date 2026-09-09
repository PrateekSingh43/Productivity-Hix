import { availabilityManager, type SystemState } from "./availability-manager";

export type ActivityState = "ACTIVE" | "IDLE";

export type ActivityTickSubscriber = (
  state: ActivityState,
  dtMs: number,
  now: number
) => void;

/**
 * ActivityEngine acts as the central authority on whether the user is performing
 * meaningful work (ACTIVE) or not (IDLE). It merges overlapping signals from the
 * browser (content scripts) and the desktop agent to prevent double-counting.
 */
export class ActivityEngine {
  private lastActivityMs: number = Date.now();
  private lastTickMs: number = Date.now();
  private subscribers: ActivityTickSubscriber[] = [];
  private tickInterval: ReturnType<typeof setInterval> | null = null;
  
  // How long after the last signal do we consider the user IDLE?
  private readonly IDLE_THRESHOLD_MS = 60 * 1000; // 1 minute of no signals = IDLE
  
  constructor() {
    this.startTicker();
  }

  public subscribe(fn: ActivityTickSubscriber) {
    this.subscribers.push(fn);
  }

  /**
   * Called by background orchestrator when a signal is received
   * from the browser (mouse/keyboard/scroll) or a context switch (tab change)
   */
  public registerBrowserActivity(timestampMs: number = Date.now()) {
    if (timestampMs > this.lastActivityMs) {
      this.lastActivityMs = timestampMs;
    }
  }

  /**
   * Called by background orchestrator when the desktop agent reports the user is active
   */
  public registerDesktopActivity(timestampMs: number = Date.now()) {
    if (timestampMs > this.lastActivityMs) {
      this.lastActivityMs = timestampMs;
    }
  }

  private startTicker() {
    if (this.tickInterval) return;
    this.lastTickMs = Date.now();
    
    // Evaluate state every 1 second
    this.tickInterval = setInterval(() => {
      const now = Date.now();
      const dtMs = now - this.lastTickMs;
      this.lastTickMs = now;

      // 1. Time Jump Detection (Fallback for Sleep/Hibernate)
      // If the JS event loop was paused for more than 10 seconds, the OS was suspended or severely blocked.
      if (dtMs > 10000) {
        console.log(`[ActivityEngine] Detected massive time jump of ${dtMs}ms. OS slept or resumed.`);
        import("./inactivity-engine").then(({ inactivityEngine }) => {
          void inactivityEngine.handleWakeupGap(dtMs, now);
        }).catch(() => {});
        import("./reflection-engine").then(({ reflectionEngine }) => {
          void reflectionEngine.handleWakeupGap(dtMs, now);
        }).catch(() => {});
        return; 
      }

      // 2. System Availability Check
      if (availabilityManager.getCurrentState() === "UNAVAILABLE") {
        // If the system is explicitly locked/unavailable, the clock is paused.
        return;
      }

      // 3. Determine User Activity State
      const timeSinceLastActivity = now - this.lastActivityMs;
      const state: ActivityState = timeSinceLastActivity < this.IDLE_THRESHOLD_MS ? "ACTIVE" : "IDLE";

      // 4. Dispatch Tick
      for (const sub of this.subscribers) {
        sub(state, dtMs, now);
      }
    }, 1000);
  }
}

export const activityEngine = new ActivityEngine();
