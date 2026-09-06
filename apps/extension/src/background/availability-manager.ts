export type SystemState = "AVAILABLE" | "UNAVAILABLE";

export type AvailabilitySubscriber = (state: SystemState, timestamp: number) => void;

export class AvailabilityManager {
  private currentState: SystemState = "AVAILABLE";
  private subscribers: AvailabilitySubscriber[] = [];

  constructor() {
    this.init();
  }

  private init() {
    // Listen to OS-level idle/locked state changes from Chrome
    if (typeof chrome !== "undefined" && chrome.idle) {
      chrome.idle.onStateChanged.addListener((state: chrome.idle.IdleState) => {
        const now = Date.now();
        // 'locked' typically means screen lock, sleep, hibernate, or shutdown
        // 'idle' means the computer is on but no user input has occurred.
        if (state === "locked") {
          this.transitionTo("UNAVAILABLE", now);
        } else if (state === "active" || state === "idle") {
          this.transitionTo("AVAILABLE", now);
        }
      });
      
      // Check initial state
      chrome.idle.queryState(60, (state) => {
        if (state === "locked") {
          this.transitionTo("UNAVAILABLE", Date.now());
        }
      });
    }
  }

  public subscribe(fn: AvailabilitySubscriber) {
    this.subscribers.push(fn);
  }

  public getCurrentState(): SystemState {
    return this.currentState;
  }

  /**
   * Externally report a time jump (e.g., from heartbeat missing) to force unavailability retrospectively
   * Not strictly required if chrome.idle handles it, but good as a fallback for the desktop agent.
   */
  public reportTimeJump(timeJumpMs: number, now: number) {
    // If a massive time jump occurred (e.g., > 2 minutes without JS execution), the OS likely suspended.
    if (timeJumpMs > 120_000) {
      // It's tricky to inject past events, but for real-time systems, 
      // we can just ensure we are currently AVAILABLE since we are running now.
      // But the gap itself should be ignored by the ActivityEngine.
      // We will handle time jumps natively inside the ActivityEngine's update loop.
    }
  }

  private transitionTo(newState: SystemState, timestamp: number) {
    if (this.currentState === newState) return;
    console.log(`[AvailabilityManager] System transitioned to ${newState} at ${new Date(timestamp).toISOString()}`);
    this.currentState = newState;
    for (const sub of this.subscribers) {
      sub(newState, timestamp);
    }
  }
}

export const availabilityManager = new AvailabilityManager();
