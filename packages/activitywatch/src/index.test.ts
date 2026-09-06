import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ActivityWatchLocalClient,
  discoverBuckets,
  findAfkBucket,
  findWindowBucket,
  isAfkEvent,
  isWindowEvent,
} from "./index";

test("findWindowBucket correctly matches currentwindow bucket", () => {
  const buckets = {
    "aw-watcher-window_laptop": {
      id: "aw-watcher-window_laptop",
      created: "2026-09-04T00:00:00Z",
      name: null,
      type: "currentwindow",
      client: "aw-watcher-window",
      hostname: "laptop",
      data: {},
      last_updated: "2026-09-04T00:00:00Z",
    },
  };
  const windowBucket = findWindowBucket(buckets);
  assert.ok(windowBucket);
  assert.equal(windowBucket.id, "aw-watcher-window_laptop");
});

test("findAfkBucket correctly matches afkstatus bucket", () => {
  const buckets = {
    "aw-watcher-afk_laptop": {
      id: "aw-watcher-afk_laptop",
      created: "2026-09-04T00:00:00Z",
      name: null,
      type: "afkstatus",
      client: "aw-watcher-afk",
      hostname: "laptop",
      data: {},
      last_updated: "2026-09-04T00:00:00Z",
    },
  };
  const afkBucket = findAfkBucket(buckets);
  assert.ok(afkBucket);
  assert.equal(afkBucket.id, "aw-watcher-afk_laptop");
});

test("isWindowEvent and isAfkEvent guard typed data", () => {
  const winEvent = {
    timestamp: "2026-09-04T12:00:00Z",
    duration: 10,
    data: { app: "Code.exe", title: "file.ts" },
  };
  assert.ok(isWindowEvent(winEvent));
  assert.equal(isAfkEvent(winEvent), false);

  const afkEvent = {
    timestamp: "2026-09-04T12:00:00Z",
    duration: 180,
    data: { status: "afk" },
  };
  assert.ok(isAfkEvent(afkEvent));
  assert.equal(isWindowEvent(afkEvent), false);
});

test("ActivityWatchLocalClient connects to running instance", async () => {
  const client = new ActivityWatchLocalClient();
  const isHealthy = await client.isHealthy();
  // If ActivityWatch is running locally, test live info and bucket discovery
  if (isHealthy) {
    const info = await client.getInfo();
    assert.ok(info.version);
    const discovered = await discoverBuckets(client);
    assert.ok(discovered.windowBucket);
  }
});
