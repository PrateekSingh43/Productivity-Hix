import { strict as assert } from "node:assert";
import { test } from "node:test";
import { retentionScore, summarizeActivity } from "./index";
import type { NormalizedActivityEvent } from "@repo/types";

const event = (
  watcher: NormalizedActivityEvent["watcher"],
  duration: number,
  data: Record<string, unknown> = {},
): NormalizedActivityEvent => ({
  externalId: `${watcher}-${duration}`,
  bucketId: watcher,
  source: watcher === "web" ? "browser" : "desktop",
  watcher,
  timestamp: "2026-01-01T08:00:00.000Z",
  duration,
  data,
});

test("summarizes active, idle, browser, and coding time", () => {
  const summary = summarizeActivity([
    event("window", 120, { app: "Code" }),
    event("web", 80, { title: "Docs" }),
    event("afk", 30, { status: "afk" }),
  ]);
  assert.deepEqual(summary, {
    activeTime: 200,
    idleTime: 30,
    codingTime: 120,
    browserTime: 80,
    applicationTime: 120,
    sessions: 1,
  });
});

test("calculates bounded retention", () => {
  assert.equal(retentionScore(0.8, 0.4), 0.5);
  assert.equal(retentionScore(0, 0.2), 1);
});
