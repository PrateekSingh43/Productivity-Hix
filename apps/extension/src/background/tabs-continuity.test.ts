import { test } from "node:test";
import assert from "node:assert/strict";
import { TabTracker, MAX_BROWSER_CONTINUITY_GAP_MS } from "./tabs";

// Mock minimal chrome environment for test isolation
const memoryStorage: Record<string, unknown> = {};
(globalThis as any).chrome = {
  storage: {
    local: {
      get: async (key: string) => ({ [key]: memoryStorage[key] }),
      set: async (items: Record<string, unknown>) => {
        Object.assign(memoryStorage, items);
      },
    },
  },
  windows: {
    WINDOW_ID_NONE: -1,
  },
  tabs: {
    query: async () => [],
  },
};

test("Defensive browser continuity: overnight suspension (> 5 min gap) does not produce multi-hour single event", async () => {
  const tracker = new TabTracker();
  tracker.setInstallationId("test-installation");

  // Simulate an active tab that was persisted 8 hours ago before sleep
  const eightHoursAgo = Date.now() - 8 * 60 * 60 * 1000;
  memoryStorage["productivehix_tab_state"] = {
    tabId: 1,
    url: "https://github.com/ActivityWatch/aw-server",
    title: "ActivityWatch GitHub",
    activeStartTime: eightHoursAgo,
    windowFocused: true,
  };

  // Next morning, user switches or activates a new tab
  const event = await tracker.handleTabActivated({
    id: 2,
    url: "https://docs.anthropic.com/en/docs/welcome",
    title: "Anthropic Docs",
    audible: false,
    incognito: false,
  } as chrome.tabs.Tab);

  // Because the gap was 8 hours (> MAX_BROWSER_CONTINUITY_GAP_MS),
  // the stale activeStartTime was reset to now, preventing a huge 8-hour event.
  // Either no event is emitted (duration < 1000ms) or if emitted, durationMs is strictly < MAX_BROWSER_CONTINUITY_GAP_MS.
  if (event) {
    assert.ok(
      event.durationMs < MAX_BROWSER_CONTINUITY_GAP_MS,
      `Duration should be bounded defensively, got ${event.durationMs}ms`
    );
  } else {
    // Expected: sub-second noise is dropped, zero 8-hour event emitted!
    assert.strictEqual(event, null);
  }
});

test("Normal tab switch within continuity gap preserves exact duration", async () => {
  const tracker = new TabTracker();
  tracker.setInstallationId("test-installation");

  // Initial activation
  await tracker.handleTabActivated({
    id: 10,
    url: "https://github.com/ProductiveHix",
    title: "ProductiveHix Repo",
    audible: false,
    incognito: false,
  } as chrome.tabs.Tab);

  // Wait 1.1s
  await new Promise((r) => setTimeout(r, 1100));

  // Switch to another tab
  const event = await tracker.handleTabActivated({
    id: 11,
    url: "https://linear.app",
    title: "Linear",
    audible: false,
    incognito: false,
  } as chrome.tabs.Tab);

  assert.ok(event, "Event should be emitted for 1.1s tab duration");
  assert.strictEqual(event.data.domain, "github.com");
  assert.ok(event.durationMs >= 1000 && event.durationMs < 5000);
});
