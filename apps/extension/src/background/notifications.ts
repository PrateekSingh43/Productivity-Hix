export const CHECKIN_NOTIFICATION_PREFIX = "productivehix-checkin-";
export const LEGACY_NOTIFICATION_ID = "productivehix-hourly-reflection";

// 1x1 transparent PNG data URL fallback guaranteed to never fail in any environment
const FALLBACK_ICON_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

function getNotificationIconUrl(): string {
  try {
    if (typeof chrome !== "undefined" && chrome.runtime?.getURL) {
      return chrome.runtime.getURL("icon-128.png");
    }
  } catch {}
  return "icon-128.png";
}

export async function showNativeCheckInNotification(options: {
  activeMinutes?: number;
  dominantContext?: string;
  isAwayReview?: boolean;
  awayTimeStr?: string;
  isFocusReview?: boolean;
  customTitle?: string;
  customMessage?: string;
}): Promise<string> {
  if (typeof chrome === "undefined" || !chrome.notifications?.create) {
    return LEGACY_NOTIFICATION_ID;
  }

  let title = options.customTitle || "ProductiveHix";
  let message = options.customMessage || "";

  if (!options.customMessage) {
    if (options.isAwayReview) {
      title = "ProductiveHix — Welcome back";
      message = `You were inactive for ${options.awayTimeStr || "a while"}. What was the reason?`;
    } else {
      const activeMin = options.activeMinutes ?? 50;
      message = options.dominantContext
        ? `You've been active for ~${activeMin}m (mainly in ${options.dominantContext}). Quick check-in?`
        : `You've been active for ~${activeMin}m. Time for a quick reflection?`;
    }
  }

  const iconUrl = getNotificationIconUrl();
  
  // Unique notification ID per trigger (away / focus / periodic)
  const tag = options.isAwayReview ? "away-" : options.isFocusReview ? "focus-" : "";
  const notificationId = `${CHECKIN_NOTIFICATION_PREFIX}${tag}${Date.now()}`;

  return new Promise((resolve) => {
    const notificationOptions: chrome.notifications.NotificationOptions<true> = {
      type: "basic",
      iconUrl,
      title,
      message,
      buttons: [{ title: "Reflect" }, { title: "Later" }],
      priority: 2,
      requireInteraction: true,
    };

    chrome.notifications.create(notificationId, notificationOptions, (createdId) => {
      if (chrome.runtime?.lastError) {
        console.warn("[NOTIFICATION] Creation with buttons/iconUrl failed:", chrome.runtime.lastError.message);
        // Fallback with base64 Data URL and no buttons to guarantee delivery on all OSes
        const fallbackOptions: chrome.notifications.NotificationOptions<true> = {
          type: "basic",
          iconUrl: FALLBACK_ICON_DATA_URL,
          title,
          message,
          priority: 2,
          requireInteraction: true,
        };
        chrome.notifications.create(notificationId, fallbackOptions, (fallbackId) => {
          if (chrome.runtime?.lastError) {
            console.error("[NOTIFICATION] Fallback creation failed:", chrome.runtime.lastError.message);
          } else {
            console.log("[NOTIFICATION] Created fallback notification:", fallbackId || notificationId);
          }
          resolve(fallbackId || notificationId);
        });
        return;
      }
      console.log("[NOTIFICATION] Created native notification:", createdId || notificationId);
      resolve(createdId || notificationId);
    });
  });
}

export const showCheckInNotification = showNativeCheckInNotification;

export async function showFocusStartedNotification(options: {
  taskTitle?: string;
  targetMinutes?: number;
}): Promise<string> {
  const title = "ProductiveHix — Focus Mode Active";
  const message = options.taskTitle
    ? `Started focus on "${options.taskTitle}" (${options.targetMinutes ?? 25}m target). Distraction guard active.`
    : `Focus session active (${options.targetMinutes ?? 25}m target). Distraction guard active.`;
  return showNativeCheckInNotification({
    customTitle: title,
    customMessage: message,
  });
}

export async function showFocusEndedNotification(options: {
  taskTitle?: string;
  durationMinutes?: number;
}): Promise<string> {
  const title = "ProductiveHix — Focus Session Complete";
  const message = options.taskTitle
    ? `You just wrapped up your focus session on "${options.taskTitle}". Time for a quick reflection?`
    : `You just wrapped up your focus session. Time for a quick reflection?`;
  return showNativeCheckInNotification({
    customTitle: title,
    customMessage: message,
    isFocusReview: true,
  });
}

export async function showFocusTargetNotification(options: {
  sessionId: string;
  taskTitle: string;
  targetMinutes: number;
}): Promise<string> {
  const notificationId = `focus-target-${options.sessionId}`;
  const iconUrl = getNotificationIconUrl();

  return new Promise((resolve) => {
    const notificationOptions: chrome.notifications.NotificationOptions<true> = {
      type: "basic",
      iconUrl,
      title: "Focus Target Reached!",
      message: `Completed planned ${options.targetMinutes}m on "${options.taskTitle}". Continue in flow or wrap up & reflect.`,
      buttons: [{ title: "Wrap Up & Reflect" }, { title: "Continue in Flow" }],
      priority: 2,
      requireInteraction: true,
    };

    chrome.notifications.create(notificationId, notificationOptions, (createdId) => {
      if (chrome.runtime?.lastError) {
        console.warn("[NOTIFICATION] Target creation with buttons failed, trying fallback:", chrome.runtime.lastError.message);
        const fallbackOptions: chrome.notifications.NotificationOptions<true> = {
          type: "basic",
          iconUrl: FALLBACK_ICON_DATA_URL,
          title: "Focus Target Reached!",
          message: `Completed planned ${options.targetMinutes}m on "${options.taskTitle}". Continue in flow or wrap up & reflect.`,
          priority: 2,
          requireInteraction: true,
        };
        chrome.notifications.create(notificationId, fallbackOptions, (fallbackId) => {
          resolve(fallbackId || notificationId);
        });
        return;
      }
      resolve(createdId || notificationId);
    });
  });
}

async function handleFocusTargetAction(notificationId: string) {
  try {
    if (typeof chrome !== "undefined" && chrome.notifications?.clear) {
      chrome.notifications.clear(notificationId);
    }
  } catch {}

  await chrome.storage.local.set({
    openToTab: "focus",
  });

  try {
    if (typeof chrome !== "undefined" && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({
        type: "NAVIGATE_POPUP",
        tab: "focus",
      }).catch(() => {});
    }
  } catch {}

  try {
    if (typeof chrome !== "undefined" && chrome.windows?.getAll) {
      const windows = await chrome.windows.getAll({ windowTypes: ["normal"] });
      const targetWindow = windows.find((w) => w.focused) || windows[0];
      if (targetWindow?.id) {
        await chrome.windows.update(targetWindow.id, { focused: true, drawAttention: true });
        if (typeof chrome.action?.openPopup === "function") {
          await chrome.action.openPopup({ windowId: targetWindow.id });
        }
      }
    }
  } catch {}
}

async function handleReflectAction(notificationId: string) {
  try {
    if (typeof chrome !== "undefined" && chrome.notifications?.clear) {
      chrome.notifications.clear(notificationId);
    }
  } catch {
    // Ignore
  }

  const isAway = notificationId.includes("-away-");
  const targetMode = isAway ? "inactivity" : "hourly";

  // Set destination in storage for popup to pick up
  await chrome.storage.local.set({
    openToTab: "reflect",
    reflectMode: targetMode,
  });

  // Broadcast to popup in real-time if it is already open
  try {
    if (typeof chrome !== "undefined" && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({
        type: "NAVIGATE_POPUP",
        tab: "reflect",
        mode: targetMode,
      }).catch(() => {});
    }
  } catch {
    // Ignore
  }

  // Bring normal browser window to focus
  let targetWindowId: number | undefined;
  try {
    if (typeof chrome !== "undefined" && chrome.windows?.getAll) {
      const windows = await chrome.windows.getAll({ windowTypes: ["normal"] });
      const targetWindow = windows.find((w) => w.focused) || windows[0];
      if (targetWindow?.id) {
        targetWindowId = targetWindow.id;
        await chrome.windows.update(targetWindow.id, { focused: true, drawAttention: true });
      }
    }
  } catch {
    // Window focus optional
  }

  // 1. Primary Action: Try opening the main extension popup directly
  try {
    if (typeof chrome !== "undefined" && typeof chrome.action?.openPopup === "function") {
      if (targetWindowId) {
        try {
          await chrome.action.openPopup({ windowId: targetWindowId });
          return;
        } catch {
          // If windowId option rejected, try without options
        }
      }
      await chrome.action.openPopup();
      return;
    }
  } catch {
    // Expected in Chrome service workers when user did not click directly on extension toolbar
  }

  // 2. Fallback: Only if extension popup cannot be opened directly, open in-page overlay
  try {
    if (typeof chrome !== "undefined" && chrome.tabs?.query) {
      const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      const activeTab = tabs[0] || (targetWindowId ? (await chrome.tabs.query({ active: true, windowId: targetWindowId }))[0] : null);
      if (activeTab?.id && activeTab.url && !activeTab.url.startsWith("chrome://")) {
        const modalUrl = chrome.runtime.getURL(`popup.html?standalone=true&inModal=true&tab=reflect&mode=${targetMode}`);
        await chrome.tabs.sendMessage(activeTab.id, {
          type: "SHOW_REFLECTION_MODAL",
          mode: targetMode,
          url: modalUrl,
        });
        return;
      }
    }
  } catch (err) {
    console.warn("[NOTIFICATION] In-page modal trigger skipped:", err);
  }

  // Visual prompt on the extension icon indicating reflection is ready
  try {
    if (typeof chrome !== "undefined" && chrome.action?.setBadgeText) {
      await chrome.action.setBadgeText({ text: "!" });
      await chrome.action.setBadgeBackgroundColor({ color: "#3b82f6" });
    }
  } catch {
    // Ignore
  }
}

async function handleLaterAction(notificationId: string) {
  try {
    if (typeof chrome !== "undefined" && chrome.notifications?.clear) {
      chrome.notifications.clear(notificationId);
    }
  } catch {
    // Ignore
  }

  // Snooze reminder
  try {
    const { checkInScheduler } = await import("./scheduler");
    const state = checkInScheduler.getState();
    const snoozeSec = state.devMode ? 60 : 15 * 60;
    await checkInScheduler.resetTimer(snoozeSec);
  } catch {
    if (typeof chrome !== "undefined" && typeof chrome.alarms?.create === "function") {
      chrome.alarms.create("checkin-reminder", { delayInMinutes: 15 });
    }
  }
}

// Notification button click handler
if (typeof chrome !== "undefined" && chrome.notifications?.onButtonClicked) {
  chrome.notifications.onButtonClicked.addListener((notificationId, buttonIndex) => {
    if (notificationId.startsWith("focus-target-")) {
      if (buttonIndex === 0) {
        void handleFocusTargetAction(notificationId);
      } else {
        try {
          if (typeof chrome !== "undefined" && chrome.notifications?.clear) {
            chrome.notifications.clear(notificationId);
          }
        } catch {}
      }
      return;
    }

    if (notificationId.startsWith(CHECKIN_NOTIFICATION_PREFIX) || notificationId === LEGACY_NOTIFICATION_ID) {
      if (buttonIndex === 0) {
        handleReflectAction(notificationId);
      } else if (buttonIndex === 1) {
        handleLaterAction(notificationId);
      }
    }
  });
}

// Notification body click handler
if (typeof chrome !== "undefined" && chrome.notifications?.onClicked) {
  chrome.notifications.onClicked.addListener((notificationId) => {
    if (notificationId.startsWith("focus-target-")) {
      void handleFocusTargetAction(notificationId);
      return;
    }

    if (notificationId.startsWith(CHECKIN_NOTIFICATION_PREFIX) || notificationId === LEGACY_NOTIFICATION_ID) {
      handleReflectAction(notificationId);
    }
  });
}


