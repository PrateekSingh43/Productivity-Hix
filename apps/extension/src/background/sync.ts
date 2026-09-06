import type { TelemetryBatch } from "@repo/telemetry";
import type { ExtensionQueue } from "./queue";
import { getSettings, ensureDevAuth, recordUploadCompleted } from "../storage/settings";

export class ExtensionSyncManager {
  private isSyncing = false;

  constructor(private readonly queue: ExtensionQueue) {}

  getQueueSize() {
    return this.queue.size();
  }

  async flushQueue(): Promise<number> {
    if (this.isSyncing) return 0;
    this.isSyncing = true;

    try {
      let settings = await getSettings();
      if (settings.trackingPaused) return 0;

      // Ensure dev authentication token exists
      if (!settings.deviceToken) {
        const auth = await ensureDevAuth();
        if (auth) {
          settings = await getSettings();
        }
      }

      if (!settings.deviceToken && !settings.userId) {
        console.warn("[EXTENSION SYNC] Aborted: Extension is unauthenticated.");
        return 0;
      }

      const pending = await this.queue.peek(50);
      if (pending.length === 0) return 0;

      const batch: TelemetryBatch = {
        installationId: settings.installationId,
        source: "browser",
        sentAt: new Date().toISOString(),
        events: pending,
      };

      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (settings.deviceToken) {
        headers["x-device-token"] = settings.deviceToken;
        headers.Authorization = `Bearer ${settings.deviceToken}`;
      } else if (settings.userId) {
        headers["x-user-id"] = settings.userId;
      }

      const endpoint = `${settings.apiUrl.replace(/\/$/, "")}/api/telemetry/batch`;

      // Requirement 9: Instrument the upload request in development
      console.log(
        `[EXTENSION UPLOAD REQUEST]\nendpoint: POST ${endpoint}\nevent count: ${pending.length}\nsource: browser\ninstallationId: ${settings.installationId}`
      );

      const response = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(batch),
      });

      const responseBody = response.ok ? await response.json().catch(() => null) : null;

      // Requirement 9: Log HTTP status and upload outcome
      console.log(
        `[EXTENSION UPLOAD RESPONSE]\nHTTP status: ${response.status} ${response.statusText}\nsuccess: ${response.ok}\naccepted: ${responseBody?.accepted ?? 0}\nduplicates: ${responseBody?.duplicates ?? 0}`
      );

      if (response.ok) {
        const ackIds = pending.map((e) => e.eventId);
        const acknowledged = await this.queue.acknowledge(ackIds);
        await recordUploadCompleted(acknowledged, response.status);
        await chrome.storage.local.set({ productivehix_last_sync: new Date().toISOString() });
        return acknowledged;
      } else {
        await recordUploadCompleted(0, response.status);
        if (response.status === 401) {
          console.warn("[EXTENSION SYNC] 401 Unauthorized: token may have expired or is invalid.");
        }
      }
      return 0;
    } catch (err) {
      console.warn("[EXTENSION UPLOAD ERROR] Network or server error during upload:", err);
      return 0;
    } finally {
      this.isSyncing = false;
    }
  }
}
