import { test } from "node:test";
import assert from "node:assert/strict";
import { TabTracker } from "./background/tabs";

// Mock minimal chrome storage for test environment
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

test("TabTracker generates event on tab switch with sanitized url and installationId", async () => {
  const tracker = new TabTracker();
  tracker.setInstallationId("browser-ext-unit-test");

  // Activate tab 1 (GitHub)
  await tracker.handleTabActivated({
    id: 1,
    url: "https://github.com/ActivityWatch/aw-server?token=xyz#readme",
    title: "ActivityWatch GitHub",
    audible: false,
    incognito: false,
  } as chrome.tabs.Tab);

  // Advance time by 2 seconds
  await new Promise((r) => setTimeout(r, 1100));

  // Activate tab 2 (ChatGPT)
  const event = await tracker.handleTabActivated({
    id: 2,
    url: "https://chatgpt.com/c/12345?query=test#bottom",
    title: "ChatGPT Session",
    audible: false,
    incognito: false,
  } as chrome.tabs.Tab);

  assert.ok(event, "An event should be emitted for tab 1 on tab switch");
  assert.equal(event.source, "browser");
  assert.equal(event.installationId, "browser-ext-unit-test");
  assert.equal(event.data.domain, "github.com");
  assert.equal(event.data.sanitizedUrl, "https://github.com/ActivityWatch/aw-server");
  assert.equal(event.data.pageTitle, "ActivityWatch GitHub");
  assert.ok(event.durationMs >= 1000, `Duration should be >= 1000ms, got ${event.durationMs}`);
});

test("TabTracker handles window focus changes (switching to/from another app)", async () => {
  const tracker = new TabTracker();
  tracker.setInstallationId("browser-ext-unit-test");

  // Activate tab in browser
  await tracker.handleTabActivated({
    id: 10,
    url: "https://docs.anthropic.com/en/docs/welcome?ref=banner",
    title: "Anthropic Docs",
    audible: false,
    incognito: false,
  } as chrome.tabs.Tab);

  await new Promise((r) => setTimeout(r, 1100));

  // User switches to desktop app (VS Code / Antigravity IDE)
  const blurEvent = await tracker.handleWindowFocusChanged(-1); // WINDOW_ID_NONE

  assert.ok(blurEvent, "An event should be emitted when browser window loses focus");
  assert.equal(blurEvent.source, "browser");
  assert.equal(blurEvent.installationId, "browser-ext-unit-test");
  assert.equal(blurEvent.data.domain, "docs.anthropic.com");
  assert.equal(blurEvent.data.sanitizedUrl, "https://docs.anthropic.com/en/docs/welcome");
  assert.ok(blurEvent.durationMs >= 1000);
});
