import { test } from "node:test";
import assert from "node:assert/strict";
import { FocusGuardManager } from "./background/focus-guard";

// Mock Chrome API for node:test environment
const memoryStorage: Record<string, unknown> = {};
const mockTabs: Array<{ id: number; windowId: number; url?: string; pendingUrl?: string; lastAccessed?: number; pinned?: boolean }> = [];
const updatedTabs: Array<{ tabId: number; updateProps: { url?: string } }> = [];
const removedTabIds: number[] = [];

(globalThis as any).chrome = {
  storage: {
    local: {
      get: async (key: string) => ({ [key]: memoryStorage[key] }),
      set: async (items: Record<string, unknown>) => {
        Object.assign(memoryStorage, items);
      },
      remove: async (key: string) => {
        delete memoryStorage[key];
      },
    },
  },
  action: {
    setBadgeText: async () => {},
    setBadgeBackgroundColor: async () => {},
  },
  alarms: {
    clear: async () => true,
    create: () => {},
  },
  notifications: {
    create: (_id: string, _opts: any, cb: (id: string) => void) => {
      cb?.("notif-id");
    },
    clear: async () => true,
    onClicked: { addListener: () => {} },
    onButtonClicked: { addListener: () => {} },
  },
  runtime: {
    getURL: (path: string) => `chrome-extension://test-ext-id/${path}`,
    sendMessage: async () => {},
  },
  tabs: {
    query: async (queryInfo: any) => {
      if (queryInfo.windowId !== undefined) {
        return mockTabs.filter((t) => t.windowId === queryInfo.windowId);
      }
      return mockTabs;
    },
    get: async (tabId: number) => {
      return mockTabs.find((t) => t.id === tabId) || null;
    },
    update: async (tabId: number, props: any) => {
      updatedTabs.push({ tabId, updateProps: props });
      const found = mockTabs.find((t) => t.id === tabId);
      if (found && props.url) {
        found.url = props.url;
      }
      return found;
    },
    remove: async (tabId: number) => {
      removedTabIds.push(tabId);
      const index = mockTabs.findIndex((t) => t.id === tabId);
      if (index !== -1) mockTabs.splice(index, 1);
    },
    onCreated: { addListener: () => {} },
    onUpdated: { addListener: () => {} },
    onActivated: { addListener: () => {} },
    onRemoved: { addListener: () => {} },
  },
};

test("FocusGuardManager initializes default config and updates settings correctly", async () => {
  const manager = new FocusGuardManager();
  const initialConfig = manager.getConfig();
  assert.equal(initialConfig.enabled, true);
  assert.equal(initialConfig.limit, 3);

  await manager.updateConfig({ limit: 4, enabled: true });
  const updatedConfig = manager.getConfig();
  assert.equal(updatedConfig.limit, 4);

  const storedSettings = memoryStorage["productivehix_settings"] as any;
  assert.equal(storedSettings?.focusGuardLimit, 4);
  assert.equal(storedSettings?.focusGuardEnabled, true);
});

test("FocusGuardManager does not enforce tab limit when no session is active or session is paused", async () => {
  const manager = new FocusGuardManager();
  await manager.updateConfig({ limit: 3, enabled: true });

  mockTabs.length = 0;
  updatedTabs.length = 0;

  // Add 4 tabs
  mockTabs.push(
    { id: 1, windowId: 1, url: "https://example.com/1" },
    { id: 2, windowId: 1, url: "https://example.com/2" },
    { id: 3, windowId: 1, url: "https://example.com/3" },
    { id: 4, windowId: 1, url: "https://example.com/4" },
  );

  // Trigger checkTabLimit without active session
  await (manager as any).checkTabLimit(mockTabs[3]);
  assert.equal(updatedTabs.length, 0, "Should not intercept tabs when no active session");

  // Set paused session
  manager.setSession({
    id: "sess-1",
    userId: "u-1",
    startedAt: new Date().toISOString(),
    isPaused: true,
  } as any);

  await (manager as any).checkTabLimit(mockTabs[3]);
  assert.equal(updatedTabs.length, 0, "Should not intercept tabs when session is paused");
});

test("FocusGuardManager intercepts 4th tab when active focus session is running", async () => {
  const manager = new FocusGuardManager();
  await manager.updateConfig({ limit: 3, enabled: true });

  mockTabs.length = 0;
  updatedTabs.length = 0;

  manager.setSession({
    id: "sess-active",
    userId: "u-1",
    startedAt: new Date().toISOString(),
    isPaused: false,
    taskTitle: "Deep Work Task",
  } as any);

  mockTabs.push(
    { id: 10, windowId: 1, url: "https://docs.github.com" },
    { id: 11, windowId: 1, url: "https://stackoverflow.com" },
    { id: 12, windowId: 1, url: "https://linear.app" },
    { id: 13, windowId: 1, url: "chrome://newtab/" },
  );

  await (manager as any).checkTabLimit(mockTabs[3]);
  assert.equal(updatedTabs.length, 1, "Should intercept the 4th tab");
  assert.equal(updatedTabs[0]?.tabId, 13);
  assert.ok(
    updatedTabs[0]?.updateProps.url?.includes("focus-guard.html"),
    "Should redirect to focus-guard.html",
  );
  assert.ok(
    updatedTabs[0]?.updateProps.url?.includes("Deep%20Work%20Task"),
    "Should include task title in query string",
  );
  assert.ok(
    updatedTabs[0]?.updateProps.url?.includes("limit=3"),
    "Should include limit=3 in query string",
  );
  manager.setSession(null);
});

test("FocusGuardManager exempts authentication URLs and devtools from tab intervention", async () => {
  const manager = new FocusGuardManager();
  await manager.updateConfig({ limit: 3, enabled: true });

  mockTabs.length = 0;
  updatedTabs.length = 0;

  manager.setSession({
    id: "sess-active",
    userId: "u-1",
    startedAt: new Date().toISOString(),
    isPaused: false,
  } as any);

  mockTabs.push(
    { id: 20, windowId: 1, url: "https://example.com" },
    { id: 21, windowId: 1, url: "https://example.org" },
    { id: 22, windowId: 1, url: "https://example.net" },
    { id: 23, windowId: 1, url: "https://accounts.google.com/signin/oauth" },
  );

  await (manager as any).checkTabLimit(mockTabs[3]);
  assert.equal(updatedTabs.length, 0, "Exempt auth URL should not be blocked");
  manager.setSession(null);
});

test("handleSwap removes oldest inactive tab and allows target URL", async () => {
  const manager = new FocusGuardManager();
  mockTabs.length = 0;
  updatedTabs.length = 0;
  removedTabIds.length = 0;

  mockTabs.push(
    { id: 31, windowId: 1, url: "https://tab1.com", lastAccessed: 1000 },
    { id: 32, windowId: 1, url: "https://tab2.com", lastAccessed: 500 }, // Oldest!
    { id: 33, windowId: 1, url: "https://tab3.com", lastAccessed: 2000 },
    { id: 34, windowId: 1, url: "chrome-extension://test-ext-id/focus-guard.html", lastAccessed: 3000 },
  );

  const success = await manager.handleSwap(34, "https://destination.com");
  assert.equal(success, true);
  assert.ok(removedTabIds.includes(32), "Oldest tab (id: 32) should be closed");

  const swapUpdate = updatedTabs.find((u) => u.tabId === 34);
  assert.equal(swapUpdate?.updateProps.url, "https://destination.com");
});

test("handleAllowTab registers tab as allowed and updates URL", async () => {
  const manager = new FocusGuardManager();
  mockTabs.length = 0;
  updatedTabs.length = 0;

  mockTabs.push({ id: 41, windowId: 1, url: "chrome-extension://test-ext-id/focus-guard.html" });

  const success = await manager.handleAllowTab(41, "https://allowed-destination.com");
  assert.equal(success, true);

  const allowUpdate = updatedTabs.find((u) => u.tabId === 41);
  assert.equal(allowUpdate?.updateProps.url, "https://allowed-destination.com");

  // Subsequent checkTabLimit on the allowed tab should not re-intercept
  manager.setSession({
    id: "sess-active",
    userId: "u-1",
    startedAt: new Date().toISOString(),
    isPaused: false,
  } as any);

  await (manager as any).checkTabLimit(mockTabs[0]);
  // Should not add another update for tab 41
  assert.equal(updatedTabs.filter((u) => u.tabId === 41 && u.updateProps.url?.includes("focus-guard.html")).length, 0);
  manager.setSession(null);
});

test("FocusGuardManager does not intercept the first 3 tabs and automatically allows them into the working set", async () => {
  const manager = new FocusGuardManager();
  await manager.updateConfig({ limit: 3, enabled: true });

  mockTabs.length = 0;
  updatedTabs.length = 0;

  manager.setSession({
    id: "sess-first-three",
    userId: "u-1",
    startedAt: new Date().toISOString(),
    isPaused: false,
    taskTitle: "Research Task",
  } as any);

  // Tab 1 opens
  mockTabs.push({ id: 51, windowId: 1, url: "https://google.com" });
  await (manager as any).checkTabLimit(mockTabs[0]);
  assert.equal(updatedTabs.length, 0, "Tab 1 (1 of 3) must NOT be intercepted");

  // Tab 2 opens
  mockTabs.push({ id: 52, windowId: 1, url: "https://wikipedia.org" });
  await (manager as any).checkTabLimit(mockTabs[1]);
  assert.equal(updatedTabs.length, 0, "Tab 2 (2 of 3) must NOT be intercepted");

  // Tab 3 opens
  mockTabs.push({ id: 53, windowId: 1, url: "https://github.com" });
  await (manager as any).checkTabLimit(mockTabs[2]);
  assert.equal(updatedTabs.length, 0, "Tab 3 (3 of 3) must NOT be intercepted");

  // Navigating or reloading any of the first 3 tabs must NEVER be intercepted
  await (manager as any).checkTabLimit(mockTabs[0]);
  await (manager as any).checkTabLimit(mockTabs[1]);
  await (manager as any).checkTabLimit(mockTabs[2]);
  assert.equal(updatedTabs.length, 0, "Switching or updating within first 3 tabs must NOT be intercepted");

  // Tab 4 opens (exceeds limit 3) -> ONLY Tab 4 is intercepted!
  mockTabs.push({ id: 54, windowId: 1, url: "https://reddit.com" });
  await (manager as any).checkTabLimit(mockTabs[3]);
  assert.equal(updatedTabs.length, 1, "Only Tab 4 (the excess tab) should be intercepted");
  assert.equal(updatedTabs[0]?.tabId, 54);
  assert.ok(updatedTabs[0]?.updateProps.url?.includes("focus-guard.html"));

  manager.setSession(null);
});

test("handleRemoteSessionEnded notifies on a genuinely remote session end", async () => {
  const manager = new FocusGuardManager();
  manager.setSession({
    id: "sess-remote",
    userId: "u-1",
    startedAt: new Date().toISOString(),
    isPaused: false,
    taskTitle: "Remote Task",
    durationSeconds: 3600,
  } as any);

  const created: string[] = [];
  const chromeApi = (globalThis as any).chrome;
  const originalCreate = chromeApi.notifications.create;
  chromeApi.notifications.create = (id: string, _opts: any, cb: (id: string) => void) => {
    created.push(id);
    cb?.(id);
  };
  try {
    const notified = manager.handleRemoteSessionEnded({ session: { id: "sess-remote" } } as any);
    assert.equal(notified, true, "Remote session end must dispatch the focus-ended notification");
    assert.equal(created.length, 1, "Exactly one notification must be created");
    assert.equal(manager.getCurrentSession(), null, "Session state must be cleared");
  } finally {
    chromeApi.notifications.create = originalCreate;
  }
});

test("handleRemoteSessionEnded suppresses the broadcast echo of a locally-ended session", async () => {
  const manager = new FocusGuardManager();
  manager.setSession({
    id: "sess-local",
    userId: "u-1",
    startedAt: new Date().toISOString(),
    isPaused: false,
    taskTitle: "Local Task",
    durationSeconds: 3600,
  } as any);

  // Popup announces its intent BEFORE the finishSession API call resolves,
  // so the server broadcast echo arriving later must not notify.
  manager.suppressEndedNotificationFor("sess-local");

  const created: string[] = [];
  const chromeApi = (globalThis as any).chrome;
  const originalCreate = chromeApi.notifications.create;
  chromeApi.notifications.create = (id: string, _opts: any, cb: (id: string) => void) => {
    created.push(id);
    cb?.(id);
  };
  try {
    const notified = manager.handleRemoteSessionEnded({ session: { id: "sess-local" } } as any);
    assert.equal(notified, false, "Locally-initiated end already on the Reflect tab must NOT notify");
    assert.equal(created.length, 0, "No notification must be created for the echo");
    assert.equal(manager.getCurrentSession(), null, "Session state must still be cleared");
  } finally {
    chromeApi.notifications.create = originalCreate;
  }
});

test("handleRemoteSessionEnded still notifies for a different session and for discards never", async () => {
  const manager = new FocusGuardManager();
  manager.setSession({
    id: "sess-a",
    userId: "u-1",
    startedAt: new Date().toISOString(),
    isPaused: false,
  } as any);
  manager.suppressEndedNotificationFor("sess-other");

  assert.equal(
    manager.handleRemoteSessionEnded({ session: { id: "sess-a" } } as any),
    true,
    "Suppression must be scoped to the exact session id",
  );

  manager.setSession({ id: "sess-b", userId: "u-1", startedAt: new Date().toISOString() } as any);
  assert.equal(
    manager.handleRemoteSessionEnded({ sessionId: "sess-b", discarded: true } as any),
    false,
    "Discarded sessions must never notify",
  );
  manager.setSession(null);
});

test("FocusGuardManager seeds existing working tabs on session audit without hijacking", async () => {
  const manager = new FocusGuardManager();
  await manager.updateConfig({ limit: 3, enabled: true });

  mockTabs.length = 0;
  updatedTabs.length = 0;

  // User already has 4 tabs open before starting focus
  mockTabs.push(
    { id: 61, windowId: 1, url: "https://work.com" },
    { id: 62, windowId: 1, url: "https://docs.com" },
    { id: 63, windowId: 1, url: "https://music.com" },
    { id: 64, windowId: 1, url: "https://chat.com" },
  );

  // User starts focus session
  manager.setSession({
    id: "sess-audit",
    userId: "u-1",
    startedAt: new Date().toISOString(),
    isPaused: false,
    taskTitle: "Exam Prep",
  } as any);

  // auditExistingTabs seeds the first 3 tabs
  await manager.auditExistingTabs();

  // None of the existing tabs should have been hijacked/updated with focus-guard.html!
  assert.equal(updatedTabs.length, 0, "auditExistingTabs must NEVER forcibly hijack existing open tabs");

  // The first 3 tabs (61, 62, 63) are now in the allowed working set and are immune
  await (manager as any).checkTabLimit(mockTabs[0]);
  await (manager as any).checkTabLimit(mockTabs[1]);
  await (manager as any).checkTabLimit(mockTabs[2]);
  assert.equal(updatedTabs.length, 0, "Pre-existing working tabs 1-3 must not be intercepted");

  manager.setSession(null);
});

