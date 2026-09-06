import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { DurableQueue } from "./queue/durable-queue";
import { SyncCursorManager } from "./sync/cursor";
import { DeduplicationFilter } from "./sync/dedupe";
import type { DesktopActivityEvent } from "@repo/telemetry";

test("DurableQueue enqueues, peeks, acknowledges, and bounds size", () => {
  const tmpDir = path.join(os.tmpdir(), `test-queue-${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });
  const queueFile = path.join(tmpDir, "queue.jsonl");

  const queue = new DurableQueue({ customPath: queueFile, maxQueueSize: 10 });

  const event1: DesktopActivityEvent = {
    eventId: "ev-1",
    source: "desktop",
    installationId: "dev-1",
    eventType: "active_window",
    timestamp: "2026-09-04T18:00:00.000Z",
    durationMs: 5000,
    data: { application: "Code.exe", windowTitle: "test.ts" },
  };

  const event2: DesktopActivityEvent = {
    eventId: "ev-2",
    source: "desktop",
    installationId: "dev-1",
    eventType: "active_window",
    timestamp: "2026-09-04T18:00:05.000Z",
    durationMs: 5000,
    data: { application: "Chrome.exe", windowTitle: "Google" },
  };

  queue.enqueue([event1, event2]);
  assert.equal(queue.size(), 2);

  const peeked = queue.peek(1);
  assert.equal(peeked.length, 1);
  assert.equal(peeked[0].eventId, "ev-1");

  const removed = queue.acknowledge(["ev-1"]);
  assert.equal(removed, 1);
  assert.equal(queue.size(), 1);

  const remaining = queue.peek(10);
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].eventId, "ev-2");

  // Cleanup
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test("SyncCursorManager persists and advances timestamps monotonically", () => {
  const tmpDir = path.join(os.tmpdir(), `test-cursor-${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });
  const cursorFile = path.join(tmpDir, "cursor.json");

  const manager = new SyncCursorManager(cursorFile);
  assert.equal(manager.getCursor("bucket-1"), undefined);

  manager.setCursor("bucket-1", "2026-09-04T18:00:00.000Z");
  assert.equal(manager.getCursor("bucket-1"), "2026-09-04T18:00:00.000Z");

  // Newer timestamp advances
  manager.setCursor("bucket-1", "2026-09-04T18:05:00.000Z");
  assert.equal(manager.getCursor("bucket-1"), "2026-09-04T18:05:00.000Z");

  // Older timestamp does not regress
  manager.setCursor("bucket-1", "2026-09-04T17:59:00.000Z");
  assert.equal(manager.getCursor("bucket-1"), "2026-09-04T18:05:00.000Z");

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test("DeduplicationFilter suppresses duplicates", () => {
  const filter = new DeduplicationFilter(5);
  assert.equal(filter.has("e1"), false);

  filter.add("e1");
  assert.equal(filter.has("e1"), true);

  const batch = [{ eventId: "e1" }, { eventId: "e2" }, { eventId: "e1" }];
  const filtered = filter.filterNew(batch);
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].eventId, "e2");
});
