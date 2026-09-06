import { getSettings } from "../storage/settings";

export type DesktopStatus = {
  connected: boolean;
  paired: boolean;
  version?: string;
  activityWatchRunning: boolean;
};

export async function checkActivityWatchRunning(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1200);
    const res = await fetch("http://127.0.0.1:5600/api/0/info", {
      signal: controller.signal,
    }).catch(() => null);
    clearTimeout(timeoutId);
    return res?.ok === true;
  } catch {
    return false;
  }
}

export async function getDesktopStatus(): Promise<DesktopStatus> {
  const activityWatchRunning = await checkActivityWatchRunning();

  // 1. Try Chrome Native Messaging first
  const nativeResult = await new Promise<{ connected: boolean; paired: boolean; version?: string }>((resolve) => {
    try {
      chrome.runtime.sendNativeMessage("com.productivehix.desktop", { type: "status" }, (value) => {
        if (chrome.runtime.lastError || !value || typeof value !== "object") {
          resolve({ connected: false, paired: false });
          return;
        }
        const response = value as { connected?: boolean; paired?: boolean; version?: string };
        resolve({ connected: response.connected === true, paired: response.paired === true, version: response.version });
      });
    } catch {
      resolve({ connected: false, paired: false });
    }
  });

  if (nativeResult.connected && nativeResult.paired) {
    return { ...nativeResult, activityWatchRunning };
  }

  // 2. Fallback: Check Desktop Agent via local API
  try {
    const settings = await getSettings();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (settings.deviceToken) headers["x-device-token"] = settings.deviceToken;
    else if (settings.userId) headers["x-user-id"] = settings.userId;

    const res = await fetch(`${settings.apiUrl.replace(/\/$/, "")}/api/activity/sync`, { headers });
    if (res.ok) {
      const data = (await res.json()) as { devices?: Array<{ lastActiveAt?: string }> };
      if (data.devices && data.devices.length > 0) {
        return { connected: true, paired: true, version: "0.2.0", activityWatchRunning };
      }
    }
  } catch {
    // API offline
  }

  return { connected: false, paired: false, activityWatchRunning };
}
