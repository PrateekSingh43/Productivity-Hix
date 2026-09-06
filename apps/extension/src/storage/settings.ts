export type ExtensionSettings = {
  apiUrl: string;
  installationId: string;
  deviceToken?: string;
  userId?: string;
  trackingPaused: boolean;
  eventsCreated: number;
  eventsUploaded: number;
  lastEvent?: {
    domain: string;
    pageTitle: string;
    timestamp: string;
    eventId: string;
    durationMs?: number;
  } | null;
  lastUpload?: {
    timestamp: string;
    count: number;
    status: number;
  } | null;
};

const SETTINGS_KEY = "productivehix_settings";

export async function getSettings(): Promise<ExtensionSettings> {
  const stored = await chrome.storage.local.get(SETTINGS_KEY);
  const current = stored[SETTINGS_KEY] as Partial<ExtensionSettings> | undefined;

  let installationId = current?.installationId;
  if (!installationId || !installationId.startsWith("browser-ext-")) {
    installationId = `browser-ext-${crypto.randomUUID()}`;
  }

  const settings: ExtensionSettings = {
    apiUrl: current?.apiUrl ?? "http://localhost:4000",
    installationId,
    deviceToken: current?.deviceToken,
    userId: current?.userId ?? "00000000-0000-0000-0000-000000000001",
    trackingPaused: current?.trackingPaused ?? false,
    eventsCreated: current?.eventsCreated ?? 0,
    eventsUploaded: current?.eventsUploaded ?? 0,
    lastEvent: current?.lastEvent ?? null,
    lastUpload: current?.lastUpload ?? null,
  };

  await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
  return settings;
}

export async function updateSettings(patch: Partial<ExtensionSettings>): Promise<ExtensionSettings> {
  const current = await getSettings();
  const settings: ExtensionSettings = { ...current, ...patch };
  await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
  return settings;
}

export async function recordEventCreated(event: {
  domain: string;
  pageTitle: string;
  timestamp: string;
  eventId: string;
  durationMs?: number;
}) {
  const settings = await getSettings();
  await updateSettings({
    eventsCreated: settings.eventsCreated + 1,
    lastEvent: event,
  });
}

export async function recordUploadCompleted(count: number, status: number) {
  const settings = await getSettings();
  await updateSettings({
    eventsUploaded: settings.eventsUploaded + count,
    lastUpload: {
      timestamp: new Date().toISOString(),
      count,
      status,
    },
  });
}

/**
 * Deterministic DEV authentication path.
 * Exchanges the extension's unique installationId for a real, cryptographically-hashed
 * device token (phix_dt_...) created in the API database.
 */
export async function ensureDevAuth(): Promise<{ deviceToken: string; userId: string } | null> {
  const settings = await getSettings();
  if (settings.deviceToken) {
    return { deviceToken: settings.deviceToken, userId: settings.userId || "00000000-0000-0000-0000-000000000001" };
  }

  try {
    const url = `${settings.apiUrl.replace(/\/$/, "")}/api/auth/extension/dev-token`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        installationId: settings.installationId,
        clientName: "ProductiveHix Browser Extension",
        browser: "chromium",
      }),
    });

    if (!response.ok) {
      console.warn(`[DEV AUTH] Request failed (${response.status})`);
      return null;
    }

    const data = (await response.json()) as { deviceToken: string; userId: string; installationId: string };
    console.log(`[DEV AUTH] Successfully acquired device token: ${data.deviceToken.slice(0, 12)}...`);
    await updateSettings({
      deviceToken: data.deviceToken,
      userId: data.userId,
    });
    return { deviceToken: data.deviceToken, userId: data.userId };
  } catch (err) {
    console.warn(`[DEV AUTH] Failed to connect to API:`, err);
    return null;
  }
}
