import { normalizeBrowserIdleEvent, type BrowserActivityEvent } from "@repo/telemetry";
import type { CheckInCreateInput } from "@repo/validation";
import type { CheckIn } from "@repo/types";
import { apiClient } from "../api/client";
import { getSettings, updateSettings, ensureDevAuth } from "../storage/settings";
import { getDesktopStatus } from "./desktop";
import { ExtensionQueue } from "./queue";
import { ExtensionSyncManager } from "./sync";
import { TabTracker } from "./tabs";
import { checkInScheduler } from "./scheduler";
import { checkInQueue } from "./checkin-queue";


const queue = new ExtensionQueue();
const tracker = new TabTracker();
const syncManager = new ExtensionSyncManager(queue);

let flushTimeout: ReturnType<typeof setTimeout> | null = null;
let schedulerTicker: ReturnType<typeof setInterval> | null = null;

function triggerDebouncedFlush(delayMs = 1500) {
  if (flushTimeout) clearTimeout(flushTimeout);
  flushTimeout = setTimeout(() => {
    void syncManager.flushQueue();
    void checkInQueue.flush();
  }, delayMs);
}

function startSchedulerTicker() {
  if (schedulerTicker) return;
  schedulerTicker = setInterval(async () => {
    try {
      const state = checkInScheduler.getState();
      if (state.checkInsPaused) return;
      
      // We purposefully DO NOT trigger the notification here anymore.
      // We only evaluate eligibility passively. The actual notification
      // will be triggered by `notifyUserStoppedWorking()` when the user 
      // naturally stops working (e.g. idle or focus loss).
    } catch (err) {
      console.warn("[SCHEDULER TICKER] Error checking eligibility:", err);
    }
  }, 1000);
}

async function recordTabEvent(eventPromise: Promise<BrowserActivityEvent | null>) {
  const settings = await getSettings();
  if (settings.trackingPaused) return;
  const event = await eventPromise;
  if (event) {
    await queue.enqueue([event]);
    triggerDebouncedFlush();

    // Record meaningful activity for check-in scheduler
    if (event.data && "domain" in event.data && typeof event.data.domain === "string") {
      void checkInScheduler.recordActivity(event.data.domain, event.durationMs);
    }
  }
}

async function initialize() {
  const settings = await getSettings();
  tracker.setInstallationId(settings.installationId);

  // Initialize scheduler state
  await checkInScheduler.loadState();
  startSchedulerTicker();

  // Bootstrap real dev authentication device token if not present
  if (!settings.deviceToken) {
    void ensureDevAuth().then((auth) => {
      if (auth) console.log("[INIT] Extension authenticated with device token.");
    });
  }

  await tracker.loadPersistedState();

  if (!settings.trackingPaused) {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (tab?.url && !tab.url.startsWith("chrome://")) {
      await recordTabEvent(tracker.handleTabActivated(tab));
    }
  }

  // Flush any pending offline check-ins
  void checkInQueue.flush();
}

chrome.runtime.onInstalled.addListener(() => void initialize());
chrome.runtime.onStartup.addListener(() => void initialize());
void initialize();

// Active tab switch
chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (!tab?.url || tab.url.startsWith("chrome://")) return;
    await recordTabEvent(tracker.handleTabActivated(tab));
  } catch {
    // Tabs can disappear between activation and lookup.
  }
});

// Tab URL or title change
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (!tab.url || tab.url.startsWith("chrome://")) return;
  await recordTabEvent(tracker.handleTabUpdated(tabId, changeInfo, tab));
});

// Window focus changed
chrome.windows.onFocusChanged.addListener(async (windowId) => {
  await recordTabEvent(tracker.handleWindowFocusChanged(windowId));
  
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    // User clicked away from the browser (transition to STOPPED)
    console.log("[MAIN] User switched away from browser, checking eligibility...");
    await checkInScheduler.notifyUserStoppedWorking();
  }
});

// Idle state changed
chrome.idle.onStateChanged.addListener(async (state) => {
  const settings = await getSettings();
  if (settings.trackingPaused) return;
  const idleEvent = normalizeBrowserIdleEvent(settings.installationId, state === "active" ? "active" : "idle");
  await queue.enqueue([idleEvent]);
  triggerDebouncedFlush();

  if (state !== "active") {
    // User went idle or locked screen (transition to STOPPED)
    console.log("[MAIN] User went idle, checking eligibility...");
    await checkInScheduler.notifyUserStoppedWorking();
  }
});

// MV3 Alarms for queue flushing, long-session heartbeat, and hourly reflection evaluation
chrome.alarms.create("productivehix-sync", { periodInMinutes: 1 });
chrome.alarms.create("productivehix-heartbeat", { periodInMinutes: 0.5 });
chrome.alarms.create("productivehix-checkin-eval", { periodInMinutes: 1 });

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "productivehix-sync") {
    void syncManager.flushQueue();
    void checkInQueue.flush();
  } else if (alarm.name === "productivehix-heartbeat") {
    void recordTabEvent(tracker.handlePeriodicHeartbeat());
  } else if (alarm.name === "productivehix-checkin-eval" || alarm.name === "productivehix-checkin-timer") {
    // Passively evaluate eligibility. If eligible, it arms the system
    // to pop the notification at the next natural stopping point.
    checkInScheduler.evaluateEligibility();
  }
});

async function statusResponse() {
  const settings = await getSettings();
  const [desktop, apiReachable, queueSize, pendingCheckIns] = await Promise.all([
    getDesktopStatus(),
    apiClient.isReachable(),
    syncManager.getQueueSize(),
    checkInQueue.count(),
  ]);

  const schedulerState = checkInScheduler.getState();
  const eligibility = checkInScheduler.evaluateEligibility();
  const remainingSecondsUntilTrigger = checkInScheduler.getRemainingSeconds();

  return {
    installationId: settings.installationId,
    authenticated: Boolean(settings.deviceToken),
    deviceToken: settings.deviceToken ? `${settings.deviceToken.slice(0, 16)}...` : undefined,
    trackingPaused: settings.trackingPaused,
    eventsCreated: settings.eventsCreated,
    eventsQueued: queueSize,
    eventsUploaded: settings.eventsUploaded,
    lastEvent: settings.lastEvent,
    lastUpload: settings.lastUpload,
    queueSize,
    apiReachable,
    desktop,
    currentActivity: settings.trackingPaused ? null : tracker.getCurrentActivity(),
    scheduler: {
      ...schedulerState,
      eligibility,
      pendingCheckIns,
      remainingSecondsUntilTrigger,
    },
  };
}

async function handleSubmitCheckIn(payload: CheckInCreateInput): Promise<{
  success: boolean;
  queuedOffline: boolean;
  checkIn?: CheckIn;
  error?: string;
}> {
  const isOnline = await apiClient.isReachable();

  if (isOnline) {
    try {
      const result = await apiClient.request<CheckIn>("/api/check-ins", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      if (result?.id) {
        await checkInScheduler.recordCheckInCompleted();
        return { success: true, queuedOffline: false, checkIn: result };
      }
    } catch (err) {
      console.warn("[SUBMIT CHECKIN] Online submit failed, falling back to durable queue:", err);
    }
  }

  // Fall back to offline resilient queue
  await checkInQueue.enqueue(payload);
  await checkInScheduler.recordCheckInCompleted();
  return { success: true, queuedOffline: true };
}

chrome.runtime.onMessage.addListener(
  (message: any, _sender, sendResponse) => {
    if (message.type === "get-status") {
      void statusResponse().then(sendResponse);
      return true;
    }
    if (message.type === "set-tracking" && typeof message.trackingPaused === "boolean") {
      void updateSettings({ trackingPaused: message.trackingPaused })
        .then(() => statusResponse())
        .then(sendResponse);
      return true;
    }
    if (message.type === "trigger-sync") {
      void syncManager.flushQueue().then(() => statusResponse()).then(sendResponse);
      return true;
    }
    if (message.type === "trigger-auth") {
      void ensureDevAuth().then(() => statusResponse()).then(sendResponse);
      return true;
    }
    if (message.type === "trigger-checkin-notification") {
      void checkInScheduler.triggerNotificationIfEligible(true).then((sent) => {
        sendResponse({ sent, state: checkInScheduler.getState() });
      });
      return true;
    }
    if (message.type === "reset-scheduler-timer") {
      void checkInScheduler.resetTimer(message.seconds).then((state) => {
        sendResponse({ success: true, state });
      });
      return true;
    }
    if (message.type === "update-scheduler-config") {
      void checkInScheduler.updateConfig(message.config).then((state) => {
        sendResponse({ success: true, state });
      });
      return true;
    }
    if (message.type === "submit-checkin" && message.payload) {
      void handleSubmitCheckIn(message.payload).then(sendResponse);
      return true;
    }
    return false;
  },
);
