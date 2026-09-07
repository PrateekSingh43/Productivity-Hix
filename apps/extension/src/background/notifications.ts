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
}): Promise<string> {
  if (typeof chrome === "undefined" || !chrome.notifications?.create) {
    return LEGACY_NOTIFICATION_ID;
  }

  let title = "ProductiveHix";
  let message = "";

  if (options.isAwayReview) {
    title = "ProductiveHix — Welcome back";
    message = `You were inactive for ${options.awayTimeStr || "a while"}. What was the reason?`;
  } else {
    const activeMin = options.activeMinutes ?? 50;
    message = options.dominantContext
      ? `You've been active for ~${activeMin}m (mainly in ${options.dominantContext}). Quick check-in?`
      : `You've been active for ~${activeMin}m. Time for a quick reflection?`;
  }

  const iconUrl = getNotificationIconUrl();
  
  // Unique notification ID per trigger (append "away" if it's an away review)
  const notificationId = `${CHECKIN_NOTIFICATION_PREFIX}${options.isAwayReview ? "away-" : ""}${Date.now()}`;

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

async function handleReflectAction(notificationId: string) {
  try {
    if (typeof chrome !== "undefined" && chrome.notifications?.clear) {
      chrome.notifications.clear(notificationId);
    }
  } catch {
    // Ignore
  }

  const isAway = notificationId.includes("-away-");
  const tab = isAway ? "inactivity" : "reflect";

  // Set destination in storage for popup to pick up
  await chrome.storage.local.set({ openToTab: tab });

  try {
    // Bring normal browser window to focus first so openPopup succeeds
    if (typeof chrome !== "undefined" && chrome.windows?.getAll) {
      const windows = await chrome.windows.getAll({ windowTypes: ["normal"] });
      const targetWindow = windows.find((w) => w.focused) || windows[0];
      if (targetWindow?.id) {
        await chrome.windows.update(targetWindow.id, { focused: true });
      }
    }
  } catch {
    // Window focus optional
  }

  // Try opening extension popup
  try {
    if (typeof chrome !== "undefined" && typeof chrome.action?.openPopup === "function") {
      await chrome.action.openPopup();
      return;
    }
  } catch (err) {
    console.warn("[NOTIFICATION CLICK] chrome.action.openPopup failed, falling back to tab:", err);
  }

  // Fallback: Open popup in a small floating window if action.openPopup rejected
  try {
    if (typeof chrome !== "undefined" && chrome.windows?.create && chrome.runtime?.getURL) {
      await chrome.windows.create({ 
        url: chrome.runtime.getURL(`popup.html?tab=${tab}`),
        type: "popup",
        width: 380,
        height: 600,
        focused: true
      });
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
    if (notificationId.startsWith(CHECKIN_NOTIFICATION_PREFIX) || notificationId === LEGACY_NOTIFICATION_ID) {
      handleReflectAction(notificationId);
    }
  });
}


