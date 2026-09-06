import { test } from "node:test";
import assert from "node:assert/strict";
import {
  deduplicateEvents,
  normalizeActivityWatchWindowEvent,
  normalizeActivityWatchAfkEvent,
  normalizeBrowserTabEvent,
  normalizeBrowserIdleEvent,
  sanitizeUrl,
} from "./index";

test("sanitizeUrl strips queries, fragments, and extracts domain", () => {
  const result = sanitizeUrl("https://github.com/ActivityWatch/aw-server?token=secret123#readme");
  assert.equal(result.domain, "github.com");
  assert.equal(result.sanitizedUrl, "https://github.com/ActivityWatch/aw-server");
});

test("normalizeActivityWatchWindowEvent produces canonical event", () => {
  const raw = {
    id: 42,
    timestamp: "2026-09-04T18:00:00.000Z",
    duration: 12.5,
    data: {
      app: "Code.exe",
      title: "ProductiveHix - index.ts",
    },
  };

  const event = normalizeActivityWatchWindowEvent("device-win-1", "aw-watcher-window", raw);
  assert.equal(event.source, "desktop");
  assert.equal(event.eventType, "active_window");
  assert.equal(event.durationMs, 12500);
  assert.equal(event.data.application, "Code.exe");
  assert.equal(event.data.windowTitle, "ProductiveHix - index.ts");
  assert.ok(event.eventId.startsWith("aw-"));
  assert.equal(event.provenance?.collector, "activitywatch");
  assert.equal(event.provenance?.collectorName, "aw-watcher-window");
  assert.equal(event.provenance?.bucketId, "aw-watcher-window");
});

test("normalizeActivityWatchAfkEvent produces afk state", () => {
  const raw = {
    timestamp: "2026-09-04T18:05:00.000Z",
    duration: 180,
    data: { status: "afk" },
  };

  const event = normalizeActivityWatchAfkEvent("device-win-1", "aw-watcher-afk", raw);
  assert.equal(event.eventType, "afk");
  assert.equal(event.data.state, "afk");
  assert.equal(event.durationMs, 180000);
});

test("normalizeBrowserIdleEvent emits privacy-safe idle state", () => {
  const event = normalizeBrowserIdleEvent("browser-1", "idle", "2026-09-04T18:05:00.000Z");
  assert.equal(event.eventType, "browser_idle");
  assert.equal(event.data.idleState, "idle");
  assert.equal(event.data.sanitizedUrl, "");
});

test("deduplicateEvents removes identical eventIds", () => {
  const events = [
    {
      eventId: "e1",
      source: "desktop" as const,
      installationId: "d1",
      eventType: "active_window" as const,
      timestamp: "2026-09-04T18:00:00.000Z",
      durationMs: 1000,
      data: { application: "Code.exe", windowTitle: "Title" },
    },
    {
      eventId: "e1", // duplicate
      source: "desktop" as const,
      installationId: "d1",
      eventType: "active_window" as const,
      timestamp: "2026-09-04T18:00:00.000Z",
      durationMs: 1000,
      data: { application: "Code.exe", windowTitle: "Title" },
    },
    {
      eventId: "e2",
      source: "desktop" as const,
      installationId: "d1",
      eventType: "active_window" as const,
      timestamp: "2026-09-04T18:00:01.000Z",
      durationMs: 2000,
      data: { application: "Chrome.exe", windowTitle: "GitHub" },
    },
  ];

  const unique = deduplicateEvents(events);
  assert.equal(unique.length, 2);
  assert.equal(unique[0].eventId, "e1");
  assert.equal(unique[1].eventId, "e2");
});
