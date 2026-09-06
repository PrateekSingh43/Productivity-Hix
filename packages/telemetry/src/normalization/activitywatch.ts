import type {
  DesktopActivityEvent,
  DesktopWindowEvent,
  DesktopAfkEvent,
  DesktopInputEvent,
} from "../events/desktop";

export type RawActivityWatchEvent = {
  id?: number;
  timestamp: string;
  duration: number; // in seconds
  data: Record<string, unknown>;
};

/**
 * Generate a deterministic event ID for idempotent ingestion.
 * Derived from installationId, bucket, timestamp, and optional raw ID.
 */
export function generateActivityWatchEventId(
  installationId: string,
  bucketId: string,
  rawEvent: RawActivityWatchEvent,
): string {
  const rawIdPart = rawEvent.id !== undefined ? `:${rawEvent.id}` : "";
  const key = `${installationId}:${bucketId}:${rawEvent.timestamp}${rawIdPart}`;
  // Simple deterministic non-cryptographic hash for collision-resistant stable eventId
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  const hex = (hash >>> 0).toString(16).padStart(8, "0");
  const timeStr = Date.parse(rawEvent.timestamp).toString(16).padStart(12, "0");
  return `aw-${hex}-${timeStr}${rawEvent.id !== undefined ? `-${rawEvent.id}` : ""}`;
}

export function normalizeActivityWatchWindowEvent(
  installationId: string,
  bucketId: string,
  rawEvent: RawActivityWatchEvent,
): DesktopWindowEvent {
  const app = typeof rawEvent.data.app === "string" ? rawEvent.data.app : "Unknown";
  const title = typeof rawEvent.data.title === "string" ? rawEvent.data.title : "";
  const durationMs = Math.max(0, Math.round((rawEvent.duration || 0) * 1000));

  return {
    eventId: generateActivityWatchEventId(installationId, bucketId, rawEvent),
    source: "desktop",
    installationId,
    eventType: "active_window",
    timestamp: new Date(rawEvent.timestamp).toISOString(),
    durationMs,
    data: {
      application: app,
      windowTitle: title,
    },
    provenance: {
      collector: "activitywatch",
      collectorName: "aw-watcher-window",
      bucketId,
    },
  };
}

export function normalizeActivityWatchAfkEvent(
  installationId: string,
  bucketId: string,
  rawEvent: RawActivityWatchEvent,
): DesktopAfkEvent {
  const status = rawEvent.data.status === "afk" ? "afk" : "active";
  const durationMs = Math.max(0, Math.round((rawEvent.duration || 0) * 1000));

  return {
    eventId: generateActivityWatchEventId(installationId, bucketId, rawEvent),
    source: "desktop",
    installationId,
    eventType: "afk",
    timestamp: new Date(rawEvent.timestamp).toISOString(),
    durationMs,
    data: {
      state: status,
    },
    provenance: {
      collector: "activitywatch",
      collectorName: "aw-watcher-afk",
      bucketId,
    },
  };
}

export function normalizeActivityWatchInputEvent(
  installationId: string,
  bucketId: string,
  rawEvent: RawActivityWatchEvent,
): DesktopInputEvent {
  const durationMs = Math.max(0, Math.round((rawEvent.duration || 0) * 1000));
  const presses = typeof rawEvent.data.presses === "number" ? rawEvent.data.presses : undefined;
  const clicks = typeof rawEvent.data.clicks === "number" ? rawEvent.data.clicks : undefined;
  const movement = typeof rawEvent.data.movement === "number" ? rawEvent.data.movement : undefined;

  return {
    eventId: generateActivityWatchEventId(installationId, bucketId, rawEvent),
    source: "desktop",
    installationId,
    eventType: "input",
    timestamp: new Date(rawEvent.timestamp).toISOString(),
    durationMs,
    data: {
      keyPresses: presses,
      mouseClicks: clicks,
      mouseMovement: movement,
    },
    provenance: {
      collector: "activitywatch",
      collectorName: "aw-watcher-input",
      bucketId,
    },
  };
}
