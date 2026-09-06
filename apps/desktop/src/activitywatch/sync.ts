import { ActivityWatchLocalClient, discoverBuckets } from "@repo/activitywatch";
import {
  normalizeActivityWatchWindowEvent,
  normalizeActivityWatchAfkEvent,
  normalizeActivityWatchInputEvent,
  type DesktopActivityEvent,
} from "@repo/telemetry";
import { SyncCursorManager } from "../sync/cursor";
import { DeduplicationFilter } from "../sync/dedupe";

export type AnyActivityEvent = DesktopActivityEvent;

export class ActivityWatchSyncEngine {
  private readonly client: ActivityWatchLocalClient;
  private readonly cursorManager: SyncCursorManager;
  private readonly dedupeFilter: DeduplicationFilter;
  private isConnected = false;

  constructor(options?: { port?: number; baseUrl?: string }) {
    this.client = new ActivityWatchLocalClient(options);
    this.cursorManager = new SyncCursorManager();
    this.dedupeFilter = new DeduplicationFilter(10000);
  }

  async isHealthy(): Promise<boolean> {
    try {
      this.isConnected = await this.client.isHealthy();
      return this.isConnected;
    } catch {
      this.isConnected = false;
      return false;
    }
  }

  async getDiscoveredBuckets() {
    return discoverBuckets(this.client);
  }

  async sync(installationId: string): Promise<DesktopActivityEvent[]> {
    const healthy = await this.isHealthy();
    if (!healthy) return [];

    const discovered = await discoverBuckets(this.client);
    const eventsToEnqueue: DesktopActivityEvent[] = [];

    // 1. Sync Window Events (aw-watcher-window)
    if (discovered.windowBucket) {
      const bucketId = discovered.windowBucket.id;
      const cursor = this.cursorManager.getCursor(bucketId);
      try {
        const rawEvents = await this.client.getEvents<{ app?: string; title?: string }>(
          bucketId,
          cursor ? { start: cursor, limit: 150 } : { limit: 150 },
        );

        let latestTimestamp = cursor;
        for (const raw of rawEvents) {
          const norm = normalizeActivityWatchWindowEvent(installationId, bucketId, {
            id: raw.id,
            timestamp: raw.timestamp,
            duration: raw.duration,
            data: { app: raw.data?.app ?? "", title: raw.data?.title ?? "" },
          });

          if (!this.dedupeFilter.has(norm.eventId)) {
            this.dedupeFilter.add(norm.eventId);
            eventsToEnqueue.push(norm);
          }

          if (!latestTimestamp || new Date(raw.timestamp) > new Date(latestTimestamp)) {
            latestTimestamp = raw.timestamp;
          }
        }

        if (latestTimestamp && latestTimestamp !== cursor) {
          this.cursorManager.setCursor(bucketId, latestTimestamp);
        }
      } catch (err) {
        console.warn(`ActivityWatch window sync warning:`, err instanceof Error ? err.message : err);
      }
    }

    // 2. Sync AFK Events (aw-watcher-afk)
    if (discovered.afkBucket) {
      const bucketId = discovered.afkBucket.id;
      const cursor = this.cursorManager.getCursor(bucketId);
      try {
        const rawEvents = await this.client.getEvents<{ status?: string }>(
          bucketId,
          cursor ? { start: cursor, limit: 100 } : { limit: 100 },
        );

        let latestTimestamp = cursor;
        for (const raw of rawEvents) {
          const norm = normalizeActivityWatchAfkEvent(installationId, bucketId, {
            id: raw.id,
            timestamp: raw.timestamp,
            duration: raw.duration,
            data: { status: raw.data?.status ?? "not-afk" },
          });

          if (!this.dedupeFilter.has(norm.eventId)) {
            this.dedupeFilter.add(norm.eventId);
            eventsToEnqueue.push(norm);
          }

          if (!latestTimestamp || new Date(raw.timestamp) > new Date(latestTimestamp)) {
            latestTimestamp = raw.timestamp;
          }
        }

        if (latestTimestamp && latestTimestamp !== cursor) {
          this.cursorManager.setCursor(bucketId, latestTimestamp);
        }
      } catch (err) {
        console.warn(`ActivityWatch AFK sync warning:`, err instanceof Error ? err.message : err);
      }
    }

    // 3. Sync Input Events (aw-watcher-input) if present
    if (discovered.inputBucket) {
      const bucketId = discovered.inputBucket.id;
      const cursor = this.cursorManager.getCursor(bucketId);
      try {
        const rawEvents = await this.client.getEvents<{ presses?: number; clicks?: number; movement?: number }>(
          bucketId,
          cursor ? { start: cursor, limit: 100 } : { limit: 100 },
        );

        let latestTimestamp = cursor;
        for (const raw of rawEvents) {
          const norm = normalizeActivityWatchInputEvent(installationId, bucketId, {
            id: raw.id,
            timestamp: raw.timestamp,
            duration: raw.duration,
            data: {
              presses: raw.data?.presses,
              clicks: raw.data?.clicks,
              movement: raw.data?.movement,
            },
          });

          if (!this.dedupeFilter.has(norm.eventId)) {
            this.dedupeFilter.add(norm.eventId);
            eventsToEnqueue.push(norm);
          }

          if (!latestTimestamp || new Date(raw.timestamp) > new Date(latestTimestamp)) {
            latestTimestamp = raw.timestamp;
          }
        }

        if (latestTimestamp && latestTimestamp !== cursor) {
          this.cursorManager.setCursor(bucketId, latestTimestamp);
        }
      } catch (err) {
        console.warn(`ActivityWatch input sync warning:`, err instanceof Error ? err.message : err);
      }
    }

    // Note: Browser telemetry is NOT synced here. The Browser Extension owns browser telemetry exclusively.
    return eventsToEnqueue;
  }
}
