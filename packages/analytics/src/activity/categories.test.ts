import { strict as assert } from "node:assert";
import { test } from "node:test";
import { isCodingActivity, isIdleActivity } from "./categories";
import type { NormalizedActivityEvent } from "@repo/types";

const mockEvent = (
  watcher: NormalizedActivityEvent["watcher"] = "window",
  data: any = {},
): NormalizedActivityEvent => ({
  externalId: "test-ev-1",
  bucketId: "test-bucket",
  source: watcher === "web" ? "browser" : "desktop",
  watcher,
  timestamp: "2026-01-01T10:00:00.000Z",
  duration: 60,
  data,
});

test("isIdleActivity: handles null, undefined, and non-object data gracefully", () => {
  assert.equal(isIdleActivity(mockEvent("window", null)), false);
  assert.equal(isIdleActivity(mockEvent("window", undefined)), false);
  assert.equal(isIdleActivity(mockEvent("window", "string-data" as any)), false);
  assert.equal(isIdleActivity(mockEvent("window", {})), false);
  assert.equal(isIdleActivity(undefined), false);
  assert.equal(isIdleActivity(null), false);
});

test("isCodingActivity: handles null, undefined, and non-object data gracefully", () => {
  assert.equal(isCodingActivity(mockEvent("window", null)), false);
  assert.equal(isCodingActivity(mockEvent("window", undefined)), false);
  assert.equal(isCodingActivity(mockEvent("window", "string-data" as any)), false);
  assert.equal(isCodingActivity(mockEvent("window", {})), false);
  assert.equal(isCodingActivity(undefined), false);
  assert.equal(isCodingActivity(null), false);
});

test("isIdleActivity: case handling and legitimate matches", () => {
  assert.equal(isIdleActivity(mockEvent("afk", { status: "unknown" })), true, "watcher === afk must be idle");
  assert.equal(isIdleActivity(mockEvent("window", { state: "AFK" })), true);
  assert.equal(isIdleActivity(mockEvent("window", { state: "afk" })), true);
  assert.equal(isIdleActivity(mockEvent("window", { status: "Idle" })), true);
  assert.equal(isIdleActivity(mockEvent("window", { status: "IDLE" })), true);
  assert.equal(isIdleActivity(mockEvent("window", { app: "Away from Keyboard" })), true);
  assert.equal(isIdleActivity(mockEvent("window", { app: "away from keyboard" })), true);
});

test("isIdleActivity: false-positive protection (takeaway, castaway, runaway)", () => {
  assert.equal(isIdleActivity(mockEvent("window", { title: "Order takeaway dinner" })), false);
  assert.equal(isIdleActivity(mockEvent("window", { title: "Castaway island movie" })), false);
  assert.equal(isIdleActivity(mockEvent("window", { title: "Runaway train scenario" })), false);
});

test("isCodingActivity: case handling and legitimate matches", () => {
  assert.equal(isCodingActivity(mockEvent("window", { app: "CODE" })), true);
  assert.equal(isCodingActivity(mockEvent("window", { app: "Code" })), true);
  assert.equal(isCodingActivity(mockEvent("window", { app: "code" })), true);
  assert.equal(isCodingActivity(mockEvent("window", { app: "Visual Studio Code" })), true);
  assert.equal(isCodingActivity(mockEvent("window", { app: "cursor" })), true);
  assert.equal(isCodingActivity(mockEvent("window", { app: "terminal" })), true);
  assert.equal(isCodingActivity(mockEvent("window", { app: "shell" })), true);
  assert.equal(isCodingActivity(mockEvent("window", { app: "git" })), true);
  assert.equal(isCodingActivity(mockEvent("window", { app: "jetbrains" })), true);
  assert.equal(isCodingActivity(mockEvent("window", { app: "vim" })), true);
  assert.equal(isCodingActivity(mockEvent("window", { app: "neovim" })), true);
});

test("isCodingActivity: false-positive protection (digital, legitimate, agitator, barcode, zipcode, unicode)", () => {
  assert.equal(isCodingActivity(mockEvent("window", { title: "Digital photography exhibition" })), false);
  assert.equal(isCodingActivity(mockEvent("window", { title: "A legitimate inquiry email" })), false);
  assert.equal(isCodingActivity(mockEvent("window", { title: "Agitator in the chemical tank" })), false);
  assert.equal(isCodingActivity(mockEvent("window", { title: "Barcode scanner for inventory" })), false);
  assert.equal(isCodingActivity(mockEvent("window", { title: "Find zipcode lookup tool" })), false);
  assert.equal(isCodingActivity(mockEvent("window", { title: "Unicode character table" })), false);
});
