import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  aggregateActivitySegments,
  computeTimelineSummary,
  normalizeAppName,
  cleanWindowTitle,
  categorizeActivity,
  type RawActivityInput,
} from "./segments";

test("normalizeAppName handles extensions and aliases correctly", () => {
  assert.equal(normalizeAppName("Code.exe"), "Visual Studio Code");
  assert.equal(normalizeAppName("brave.exe"), "Brave Browser");
  assert.equal(normalizeAppName("chrome.exe"), "Google Chrome");
  assert.equal(normalizeAppName("msedge.exe"), "Microsoft Edge");
  assert.equal(normalizeAppName("Antigravity IDE.exe"), "Antigravity IDE");
  assert.equal(
    normalizeAppName("powershell.exe", { windowTitle: "ProductiveHix - Antigravity IDE - globals.css" }),
    "Antigravity IDE",
  );
  assert.equal(
    normalizeAppName("powershell.exe", { windowTitle: "ProductiveHix - Brave" }),
    "Brave Browser",
  );
  assert.equal(normalizeAppName("powershell.exe", { windowTitle: "Administrator: Windows PowerShell" }), "Terminal");
});

test("cleanWindowTitle strips app branding and query parameters", () => {
  assert.equal(
    cleanWindowTitle("timeline.tsx — Visual Studio Code", "Visual Studio Code"),
    "timeline.tsx",
  );
  assert.equal(
    cleanWindowTitle("Design Productivity Tracker - Brave", "Brave Browser"),
    "Design Productivity Tracker",
  );
  assert.equal(
    cleanWindowTitle("https://chatgpt.com/c/6a98f68e?test=1&utm_source=test", "Brave Browser"),
    "chatgpt.com/c/6a98f68e",
  );
});

test("categorizeActivity accurately classifies focused, browser, break, and communication", () => {
  assert.equal(categorizeActivity("Visual Studio Code", "index.ts", false, false), "focused");
  assert.equal(categorizeActivity("Antigravity IDE", "plan.md", false, false), "focused");
  assert.equal(categorizeActivity("Brave Browser", "GitHub", false, true), "browser");
  assert.equal(categorizeActivity("Away from Keyboard", "AFK", true, false), "break");
  assert.equal(categorizeActivity("Slack", "general", false, false), "communication");
});

test("consolidates continuous activity into 1 human-scale segment with context history", () => {
  const baseTime = new Date("2026-09-05T09:00:00.000Z").getTime();
  const rawEvents: RawActivityInput[] = [
    {
      externalId: "ev-1",
      timestamp: new Date(baseTime).toISOString(),
      duration: 300, // 5 min
      watcher: "active_window",
      data: { application: "Code.exe", windowTitle: "dashboard.tsx - Visual Studio Code" },
    },
    {
      externalId: "ev-2",
      timestamp: new Date(baseTime + 300_000).toISOString(),
      duration: 600, // 10 min
      watcher: "active_window",
      data: { application: "Code.exe", windowTitle: "client.ts - Visual Studio Code" },
    },
    {
      externalId: "ev-3",
      timestamp: new Date(baseTime + 900_000).toISOString(),
      duration: 900, // 15 min
      watcher: "active_window",
      data: { application: "Code.exe", windowTitle: "page.tsx - Visual Studio Code" },
    },
  ];

  const segments = aggregateActivitySegments(rawEvents);
  assert.equal(segments.length, 1, "Should consolidate 3 consecutive events into 1 continuous segment");

  const seg = segments[0]!;
  assert.equal(seg.application, "Visual Studio Code");
  assert.equal(seg.category, "focused");
  assert.equal(seg.durationMs, 1_800_000); // 30 min total
  assert.equal(seg.rawEventCount, 3);
  assert.deepEqual(seg.contexts, ["dashboard.tsx", "client.ts", "page.tsx"]);
});

test("preserves distinct app-to-app switches (VS Code -> Chrome -> VS Code)", () => {
  const baseTime = new Date("2026-09-05T09:00:00.000Z").getTime();
  const rawEvents: RawActivityInput[] = [
    {
      externalId: "ev-1",
      timestamp: new Date(baseTime).toISOString(),
      duration: 600,
      watcher: "active_window",
      data: { application: "Code.exe", windowTitle: "app.ts" },
    },
    {
      externalId: "ev-2",
      timestamp: new Date(baseTime + 600_000).toISOString(),
      duration: 300,
      watcher: "active_window",
      data: { application: "chrome.exe", windowTitle: "React Docs - Google Chrome" },
    },
    {
      externalId: "ev-3",
      timestamp: new Date(baseTime + 900_000).toISOString(),
      duration: 600,
      watcher: "active_window",
      data: { application: "Code.exe", windowTitle: "app.ts" },
    },
  ];

  const segments = aggregateActivitySegments(rawEvents);
  assert.equal(segments.length, 3, "Should preserve 3 distinct segments");
  assert.equal(segments[0]!.application, "Visual Studio Code");
  assert.equal(segments[1]!.application, "Google Chrome");
  assert.equal(segments[2]!.application, "Visual Studio Code");
});

test("absorbs transient incidental interruptions (<= 15s) flanked by the same activity", () => {
  const baseTime = new Date("2026-09-05T09:00:00.000Z").getTime();
  const rawEvents: RawActivityInput[] = [
    {
      externalId: "ev-1",
      timestamp: new Date(baseTime).toISOString(),
      duration: 600, // 10 min
      watcher: "active_window",
      data: { application: "Code.exe", windowTitle: "app.ts" },
    },
    {
      externalId: "ev-2",
      timestamp: new Date(baseTime + 600_000).toISOString(),
      duration: 8, // 8 second alt-tab blip
      watcher: "active_window",
      data: { application: "explorer.exe", windowTitle: "Downloads" },
    },
    {
      externalId: "ev-3",
      timestamp: new Date(baseTime + 608_000).toISOString(),
      duration: 600, // 10 min
      watcher: "active_window",
      data: { application: "Code.exe", windowTitle: "app.ts" },
    },
  ];

  const segments = aggregateActivitySegments(rawEvents, { transientThresholdMs: 15_000 });
  assert.equal(segments.length, 1, "Should absorb 8s explorer blip into continuous VS Code session");
  assert.equal(segments[0]!.application, "Visual Studio Code");
  assert.equal(segments[0]!.rawEventCount, 3);
});

test("AFK break precedence: separates work and does NOT absorb meaningful breaks", () => {
  const baseTime = new Date("2026-09-05T09:00:00.000Z").getTime();
  const rawEvents: RawActivityInput[] = [
    {
      externalId: "ev-1",
      timestamp: new Date(baseTime).toISOString(),
      duration: 1800, // 30 min VS Code
      watcher: "active_window",
      data: { application: "Code.exe", windowTitle: "main.ts" },
    },
    {
      externalId: "ev-afk",
      timestamp: new Date(baseTime + 1800_000).toISOString(),
      duration: 900, // 15 min AFK
      watcher: "afk",
      data: { status: "afk" },
    },
    {
      externalId: "ev-2",
      timestamp: new Date(baseTime + 2700_000).toISOString(),
      duration: 1800, // 30 min VS Code
      watcher: "active_window",
      data: { application: "Code.exe", windowTitle: "main.ts" },
    },
  ];

  const segments = aggregateActivitySegments(rawEvents, { minBreakMs: 60_000 });
  assert.equal(segments.length, 3, "AFK break must remain distinct");
  assert.equal(segments[0]!.application, "Visual Studio Code");
  assert.equal(segments[1]!.category, "break");
  assert.equal(segments[1]!.application, "Away from Keyboard");
  assert.equal(segments[1]!.durationMs, 900_000);
  assert.equal(segments[2]!.application, "Visual Studio Code");
});

test("overlapping intervals clip properly and summary duration maintains invariant", () => {
  const baseTime = new Date("2026-09-05T10:00:00.000Z").getTime();
  // Event A: 10:00 to 10:20 (1200s)
  // Event B: 10:15 to 10:35 (1200s) -> Overlaps by 5 min
  const rawEvents: RawActivityInput[] = [
    {
      externalId: "ev-a",
      timestamp: new Date(baseTime).toISOString(),
      duration: 1200,
      watcher: "active_window",
      data: { application: "Code.exe", windowTitle: "code" },
    },
    {
      externalId: "ev-b",
      timestamp: new Date(baseTime + 900_000).toISOString(),
      duration: 1200,
      watcher: "active_window",
      data: { application: "brave.exe", windowTitle: "Brave" },
    },
  ];

  const segments = aggregateActivitySegments(rawEvents);
  assert.equal(segments.length, 2);

  // First event should be clipped to 10:15 (15 min = 900_000 ms)
  assert.equal(segments[0]!.durationMs, 900_000);
  assert.equal(segments[1]!.durationMs, 1_200_000);

  const summary = computeTimelineSummary(segments);
  assert.equal(summary.totalTrackedMs, 2_100_000); // exactly 10:00 to 10:35 (35 min)
  assert.equal(
    summary.focusedMs + summary.browserMs + summary.breakMs + summary.communicationMs + summary.generalMs,
    summary.totalTrackedMs,
    "Summary categories must sum exactly to totalTrackedMs",
  );
});

test("AFK break strictly inside an ongoing active window splits the window into non-overlapping segments", () => {
  const baseTime = new Date("2026-09-12T20:31:00.000Z").getTime();
  // Window: 20:31 to 20:48 (17m = 1020s)
  // AFK Break: 20:32 to 20:37 (5m = 300s) -> strictly INSIDE window
  const rawEvents: RawActivityInput[] = [
    {
      externalId: "ev-brave",
      timestamp: new Date(baseTime).toISOString(),
      duration: 1020,
      watcher: "active_window",
      data: { application: "brave.exe", windowTitle: "ProductiveHix" },
    },
    {
      externalId: "ev-afk",
      timestamp: new Date(baseTime + 60_000).toISOString(),
      duration: 300,
      watcher: "afk",
      data: { status: "afk" },
    },
  ];

  const segments = aggregateActivitySegments(rawEvents);
  assert.equal(segments.length, 3, "Must split into before-break, AFK break, and after-break segments");

  // Segment 1: Brave Browser before break (20:31 to 20:32 = 60s)
  assert.equal(segments[0]!.application, "Brave Browser");
  assert.equal(segments[0]!.category, "browser");
  assert.equal(segments[0]!.durationSeconds, 60);

  // Segment 2: Away from Keyboard (20:32 to 20:37 = 300s)
  assert.equal(segments[1]!.application, "Away from Keyboard");
  assert.equal(segments[1]!.category, "break");
  assert.equal(segments[1]!.durationSeconds, 300);

  // Segment 3: Brave Browser after break (20:37 to 20:48 = 660s)
  assert.equal(segments[2]!.application, "Brave Browser");
  assert.equal(segments[2]!.category, "browser");
  assert.equal(segments[2]!.durationSeconds, 660);

  // Invariant verification: Total duration must exactly equal elapsed wall-clock time
  const summary = computeTimelineSummary(segments);
  assert.equal(summary.totalTrackedMs, 1020_000);
  assert.equal(summary.browserMs, 720_000); // 60s + 660s = 720s
  assert.equal(summary.breakMs, 300_000);   // 300s
  assert.equal(
    summary.browserMs + summary.breakMs,
    summary.totalTrackedMs,
    "Categories must sum exactly to totalTrackedMs without any double counting or overlap",
  );
});

test("extended overnight AFK (> maxBreakMs, e.g. 10h) is excluded from work breaks and summary.breakMs", () => {
  // 12:02 AM to 10:17 AM (10h 15m = 36,949s)
  const baseTime = new Date("2026-09-12T18:32:00.000Z").getTime();
  const rawEvents: RawActivityInput[] = [
    {
      externalId: "ev-overnight-afk",
      timestamp: new Date(baseTime).toISOString(),
      duration: 36949, // 10h 15m
      watcher: "afk",
      data: { status: "afk" },
    },
  ];

  const segments = aggregateActivitySegments(rawEvents);
  assert.equal(segments.length, 0, "Overnight sleep / machine hibernation must NOT be treated as a work break segment");

  const summary = computeTimelineSummary(segments);
  assert.equal(summary.breakMs, 0, "breakMs must be 0 for overnight absence");
  assert.equal(summary.totalTrackedMs, 0, "totalTrackedMs must be 0 for overnight absence");
});

test("AFK during configured sleep window (02:00 to 08:30) is excluded from work breaks", () => {
  // 03:00 AM to 04:30 AM IST (1.5h = 5400s) -> within maxBreakMs (2h), but strictly during sleepWindow
  // 03:00 AM IST = 21:30 UTC previous day
  const baseTime = new Date("2026-09-12T21:30:00.000Z").getTime();
  const rawEvents: RawActivityInput[] = [
    {
      externalId: "ev-sleep-afk",
      timestamp: new Date(baseTime).toISOString(),
      duration: 5400, // 90 min
      watcher: "afk",
      data: { status: "afk" },
    },
  ];

  const segments = aggregateActivitySegments(rawEvents, {
    sleepWindow: { start: "02:00", end: "08:30", timezone: "Asia/Kolkata" },
  });
  assert.equal(segments.length, 0, "Inactivity during quiet/sleep hours must not generate work break segments");

  const summary = computeTimelineSummary(segments);
  assert.equal(summary.breakMs, 0);
});

test("daytime active work break (e.g. 15m coffee break) is correctly recognized and summarized", () => {
  // 02:00 PM to 02:15 PM IST (15m = 900s)
  const baseTime = new Date("2026-09-13T08:30:00.000Z").getTime();
  const rawEvents: RawActivityInput[] = [
    {
      externalId: "ev-coffee-break",
      timestamp: new Date(baseTime).toISOString(),
      duration: 900, // 15 min
      watcher: "afk",
      data: { status: "afk" },
    },
  ];

  const segments = aggregateActivitySegments(rawEvents, {
    minBreakMs: 60_000,
    sleepWindow: { start: "02:00", end: "08:30", timezone: "Asia/Kolkata" },
  });
  assert.equal(segments.length, 1);
  assert.equal(segments[0]!.category, "break");
  assert.equal(segments[0]!.durationSeconds, 900);

  const summary = computeTimelineSummary(segments);
  assert.equal(summary.breakMs, 900_000);
});

