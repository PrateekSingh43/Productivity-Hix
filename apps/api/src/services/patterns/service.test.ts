import { afterEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "../../app";

process.env.NODE_ENV = "test";
process.env.ALLOW_DEV_AUTH = "true";
import { resetTestDb, setTestDb } from "../../lib/prisma";
import { activityInRange } from "../activity/service";
import { listCheckIns } from "../check-ins/service";
import { assembleEvidence, overlaps, timelineFromBlocks } from "./evidence";
import { resolveWindow, runInsightPipeline, runPatternPipeline } from "./service";

const userId = "user-patterns";
const window = resolveWindow("2026-09-01", "2026-09-15");
const row = (date: string, seconds: number, id: string, owner = userId) => ({
  id, userId: owner, externalId: id, bucketId: "desktop", source: "desktop", watcher: "active_window",
  timestamp: new Date(`${date}T10:00:00Z`), duration: seconds, data: { application: "Code", windowTitle: "project" },
});
const session = (event: ReturnType<typeof row>) => ({
  id: `session-${event.id}`, userId: event.userId, taskId: "task-1", source: "manual",
  startedAt: event.timestamp, endedAt: new Date(event.timestamp.getTime() + event.duration * 1000),
  durationSeconds: event.duration, isPaused: false,
});
const report = (id: string, date: string, energy: string | null) => ({
  id, userId, workSessionId: null, taskId: "task-1", windowStart: new Date(`${date}T10:00:00Z`),
  windowEnd: new Date(`${date}T11:00:00Z`), activityAssessment: null, alignment: null, reasons: [], state: null,
  energy, focus: null, note: null, questionVersion: "v1", source: "extension_hourly", deeperAnswers: null,
  intent: null, progress: null, blocker: null, productive: null, outcome: null, createdAt: new Date(`${date}T11:00:00Z`),
});

type HistoryQuery = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<Array<{
  min_time: Date | null; max_time: Date | null; distinct_days: bigint;
}> | undefined>;

function fixture(options: {
  currentSeconds?: number; history?: boolean; count?: number; connected?: boolean; reflections?: boolean; reverse?: boolean;
  timezone?: string; queryRaw?: HistoryQuery; taskId?: string;
} = {}) {
  const current = Array.from({ length: options.count ?? 3 }, (_, index) => row(`2026-09-0${index + 1}`, options.currentSeconds ?? 3600, `current-${index}`));
  const historical = options.history === false ? [] : [20, 21, 22].map((day) => row(`2026-08-${day}`, 1800, `history-${day}`));
  const events = [...current, ...historical, row("2026-09-01", 7200, "other-user", "other-user")];
  const sessions = events.map((event) => ({ ...session(event), taskId: options.taskId ?? "task-1" }));
  const reports = options.reflections ? [report("reflection-high", "2026-09-01", "high"), report("reflection-low", "2026-09-02", "low")] : [];
  if (options.reverse) { events.reverse(); sessions.reverse(); reports.reverse(); }
  const calls: Array<{ kind: string; args: unknown }> = [];
  const db = {
    ...(options.queryRaw ? { $queryRaw: options.queryRaw } : {}),
    userPreference: { findUnique: async () => ({ timezone: options.timezone ?? "UTC", dayBoundary: "00:00" }) },
    normalizedActivity: {
      findMany: async (args: { where: { userId: string; timestamp?: { lt?: Date } }; select?: { timestamp: boolean } }) => {
        calls.push({ kind: "activity", args });
        const before = args.where.timestamp?.lt;
        return events.filter((event) => event.userId === args.where.userId && (!before || event.timestamp < before));
      },
      count: async (args: { where: { userId: string } }) => events.filter((event) => event.userId === args.where.userId).length,
    },
    workSession: { findMany: async (args: { where: { userId: string }; take?: number }) => {
      calls.push({ kind: "sessions", args });
      return sessions.filter((item) => item.userId === args.where.userId).slice(0, args.take);
    } },
    checkIn: { findMany: async (args: { take?: number }) => { calls.push({ kind: "checkIns", args }); return reports.slice(0, args.take); } },
    task: { findMany: async () => [{ id: options.taskId ?? "task-1", completedAt: null, plannedStart: new Date("2026-09-01T09:00:00Z") }] },
    dailyGoal: { findMany: async () => [{ id: "goal-1", outcome: "ACHIEVED", plan: { date: "2026-09-01" } }] },
    desktopDevice: { count: async () => options.connected === false ? 0 : 1 },
    browserInstallation: { count: async () => 0 },
    patternAnalysisRun: { findFirst: async () => null },
    patternFinding: { findMany: async () => [] },
  };
  setTestDb(db);
  return { events, sessions, reports, calls, db };
}

async function diagnosticsFor(bounded = window, owner = userId) {
  const patterns = await runPatternPipeline(owner, bounded);
  const insights = await runInsightPipeline(owner, bounded);
  expect(insights.diagnostics).toEqual(patterns.diagnostics);
  return patterns.diagnostics;
}

afterEach(resetTestDb);

describe("Patterns and Insights orchestration contracts", () => {
  it("promotes a real same-task change from detector measurements and qualified history", async () => {
    const data = fixture();
    const result = await runPatternPipeline(userId, window);
    expect(result.state).toBe("ok");
    expect(result.patterns).toHaveLength(1);
    const pattern = result.patterns[0]!;
    expect(pattern.sample.qualifyingEpisodes).toBe(3);
    expect(pattern.baseline.baselineValue).toBe(1800);
    expect(pattern.baseline.currentValue).toBe(3600);
    expect(pattern.reliability.tier).toBe("PROVISIONAL");
    expect(pattern.reliability.calibrationStatus).toBe("UNVALIDATED_PROTOTYPE");
    expect(pattern.evidenceRefs?.every((ref) => ref.sessionIds.every((id) => data.sessions.some((item) => item.id === id)))).toBe(true);
    expect(JSON.stringify(result)).not.toContain("other-user");
    expect(result.diagnostics.perDetector).toHaveLength(4);
    expect(result.diagnostics.perDetector.find((item) => item.identity === "schedule_variance")?.reason).toContain("snapshots");
  });

  it("marks D4 schedule_variance NOT_AVAILABLE instead of a silent empty-input finding", async () => {
    fixture();
    const result = await runPatternPipeline(userId, window);
    const d4 = result.diagnostics.perDetector.find((item) => item.identity === "schedule_variance")!;
    expect(d4.availability).toBe("NOT_AVAILABLE");
    expect(d4.reason).toContain("not available yet");
    // Available detectors stay explicitly available.
    for (const item of result.diagnostics.perDetector) {
      if (item.identity !== "schedule_variance") expect(item.availability).toBe("AVAILABLE");
    }
  });

  it("returns insufficient evidence for sparse history without zero-filled findings", async () => {
    fixture({ count: 1, history: false });
    const result = await runPatternPipeline(userId, window);
    expect(result.state).toBe("insufficient-evidence");
    expect(result.patterns).toEqual([]);
    expect(result.diagnostics.perDetector.find((item) => item.identity === "extended_continuous_activity")?.eligibleOccasions).toBe(1);
  });

  it("distinguishes missing baseline from a qualified no-finding evaluation", async () => {
    fixture({ history: false });
    expect((await runPatternPipeline(userId, window)).state).toBe("insufficient-evidence");
    fixture({ currentSeconds: 1800 });
    const result = await runPatternPipeline(userId, window);
    expect(result.state).toBe("no-findings");
    expect(result.patterns).toEqual([]);
  });

  it("returns no observations for a connected collector and an empty requested window", async () => {
    fixture({ count: 0 });
    expect((await runPatternPipeline(userId, window)).state).toBe("no-observations");
  });

  it("returns not-connected only without registered collectors or telemetry history", async () => {
    fixture({ count: 0, history: false, connected: false });
    expect((await runPatternPipeline(userId, window)).state).toBe("not-connected");
  });

  it("does not turn a session declaration into observations", async () => {
    const data = fixture({ history: false });
    data.events.splice(0, data.events.length);
    const result = await runPatternPipeline(userId, window);
    expect(result.state).toBe("no-observations");
    expect(result.patterns).toEqual([]);
  });

  it("is deterministic across shuffled insertion and repeated evaluation", async () => {
    fixture({ reflections: true });
    const patterns = await runPatternPipeline(userId, window);
    const insights = await runInsightPipeline(userId, window);
    fixture({ reflections: true, reverse: true });
    expect(await runPatternPipeline(userId, window)).toEqual(patterns);
    expect(await runInsightPipeline(userId, window)).toEqual(insights);
  });

  it("maps NO_INSIGHT to no-findings when patterns lack personal evidence", async () => {
    fixture();
    const result = await runInsightPipeline(userId, window);
    expect(result.state).toBe("no-findings");
    expect(result.insights).toEqual([]);
  });

  it("composes reflections without removing contradictory reports or interpreting task completion as an outcome", async () => {
    fixture({ reflections: true });
    const result = await runInsightPipeline(userId, window);
    expect(result.state).toBe("ok");
    expect(result.insights).toHaveLength(1);
    expect(result.insights[0]?.personalElements).toEqual([
      { kind: "reflection", recordId: "reflection-high" }, { kind: "reflection", recordId: "reflection-low" },
    ]);
    expect(result.insights[0]?.alternatives.join(" ")).toContain("Reflections differ");
    expect(result.insights[0]?.doesNotEstablish.join(" ")).toContain("Task completion");
  });

  it("does not emit fabricated confidence or percentage fields", async () => {
    fixture({ reflections: true });
    const values = [await runPatternPipeline(userId, window), await runInsightPipeline(userId, window)];
    function check(value: unknown) {
      if (!value || typeof value !== "object") return;
      for (const [key, child] of Object.entries(value)) {
        expect(key).not.toMatch(/confidence|percentage|score/i);
        if (typeof child === "number") expect(Number.isFinite(child)).toBe(true);
        check(child);
      }
    }
    values.forEach(check);
  });

  it("treats unobserved spans as unknown and refuses a poorly covered run", async () => {
    const data = fixture();
    data.events.filter((event) => event.externalId.startsWith("current")).forEach((event) => { event.duration = 300; });
    const result = await runPatternPipeline(userId, window);
    expect(result.state).toBe("insufficient-evidence");
    const timeline = assembleEvidence(userId, { start: "2026-09-01T10:00:00Z", end: "2026-09-01T11:00:00Z" }, [], [], []);
    expect(timeline.blocks[0]?.coverage).toBe("UNKNOWN");
    expect(timeline.coverageSummary.unknownSeconds).toBe(3600);
  });

  it("keeps real AFK intervals separate and not-afk watcher rows are not breaks", () => {
    const bounded = { start: "2026-09-01T10:00:00Z", end: "2026-09-01T11:00:00Z" };
    const events = [
      { externalId: "window", bucketId: "b", source: "desktop" as const, watcher: "window" as const,
        timestamp: bounded.start, duration: 3600, data: { app: "Code" } },
      { externalId: "afk", bucketId: "b", source: "desktop" as const, watcher: "afk" as const,
        timestamp: bounded.start, duration: 1800, data: { status: "not-afk" } },
      { externalId: "idle", bucketId: "b", source: "desktop" as const, watcher: "afk" as const,
        timestamp: "2026-09-01T10:30:00Z", duration: 1800, data: { status: "afk" } },
    ];
    const result = assembleEvidence(userId, bounded, events, [], []);
    expect(result.blocks.map((block) => block.observation?.isAfk)).toEqual([false, true]);
    expect(result.blocks.reduce((sum, block) => sum + block.durationSeconds, 0)).toBe(3600);
  });

  it("clips carry-in and carry-out activity with exclusive end boundaries", async () => {
    const data = fixture({ count: 0, history: false });
    data.events.push(row("2026-09-01", 7200, "carry"));
    const events = await activityInRange(userId, new Date("2026-09-01T10:30:00Z"), new Date("2026-09-01T11:00:00Z"));
    expect(events).toHaveLength(1);
    expect(events[0]?.timestamp).toBe("2026-09-01T10:30:00.000Z");
    expect(events[0]?.duration).toBe(1800);
    expect(await activityInRange(userId, new Date("2026-09-01T12:00:00Z"), new Date("2026-09-01T13:00:00Z"))).toEqual([]);
  });

  it("rejects nonfinite Prisma durations before clipping them into valid-looking observations", async () => {
    const data = fixture({ count: 0, history: false });
    data.events.push(row("2026-09-01", Infinity, "invalid-duration"));
    const bounded = { start: "2026-09-01T10:00:00Z", end: "2026-09-01T11:00:00Z" };
    expect(await activityInRange(userId, new Date(bounded.start), new Date(bounded.end))).toEqual([]);
    const malformed = { externalId: "bad", bucketId: "b", source: "desktop" as const, watcher: "window" as const,
      timestamp: bounded.start, duration: Infinity, data: { app: "Code" } };
    const timeline = assembleEvidence(userId, bounded, [malformed, { ...malformed, timestamp: "invalid", duration: 60 }], [], []);
    expect(timeline.coverageSummary.unknownSeconds).toBe(3600);
    expect(timeline.coverageSummary.observedSeconds).toBe(0);
  });

  it("preserves overlapping events whose external IDs are only unique within their source buckets", () => {
    const bounded = { start: "2026-09-01T10:00:00Z", end: "2026-09-01T11:00:00Z" };
    const event = { externalId: "1", bucketId: "window", source: "desktop" as const, watcher: "window" as const,
      timestamp: bounded.start, duration: 3600, data: { app: "Code" } };
    const events = [event, { ...event, bucketId: "afk", watcher: "afk" as const, duration: 1800, data: { status: "afk" } }];
    const timeline = assembleEvidence(userId, bounded, events, [], []);
    expect(timeline.blocks.map((block) => block.observation?.isAfk)).toEqual([true, false]);
    expect(timeline.blocks[0]?.provenance).toHaveLength(2);
    expect(timeline.coverageSummary.observedSeconds).toBe(3600);
    expect(assembleEvidence(userId, bounded, [...events].reverse(), [], [])).toEqual(timeline);
  });

  it("conserves coverage when many source rows share interval boundaries", () => {
    const bounded = { start: "2026-09-01T10:00:00Z", end: "2026-09-01T11:00:00Z" };
    const events = Array.from({ length: 20000 }, (_, index) => ({
      externalId: String(index), bucketId: "window", source: "desktop" as const, watcher: "window" as const,
      timestamp: bounded.start, duration: 3600, data: { app: "Code" },
    }));
    const timeline = assembleEvidence(userId, bounded, events, [], []);
    expect(timeline.blocks).toHaveLength(1);
    expect(timeline.blocks[0]?.provenance).toHaveLength(events.length);
    expect(timeline.coverageSummary.observedSeconds).toBe(3600);
    expect(timeline.coverageSummary.coverageRatio).toBe(1);
  });

  it("validates evidence windows and excludes malformed or inverted intervals", () => {
    const bounded = { start: "2026-09-01T10:00:00Z", end: "2026-09-01T11:00:00Z" };
    expect(() => assembleEvidence(userId, { ...bounded, end: "invalid" }, [], [], [])).toThrow("Invalid evidence window");
    expect(() => timelineFromBlocks({ start: bounded.start, end: bounded.start }, [])).toThrow("Invalid evidence window");
    expect(overlaps("invalid", bounded.end, bounded)).toBe(false);
    expect(overlaps("2026-09-01T10:40:00Z", "2026-09-01T10:20:00Z", bounded)).toBe(false);
    const block = assembleEvidence(userId, bounded, [], [], []).blocks[0]!;
    expect(timelineFromBlocks(bounded, [{ ...block, startTime: "invalid" }]).blocks).toEqual([]);
  });

  it("does not truncate analytical check-ins while preserving the default list limit", async () => {
    const data = fixture();
    data.reports.push(...Array.from({ length: 60 }, (_, i) => report(`report-${i}`, "2026-09-01", null)));
    expect(await listCheckIns(userId, { from: new Date(window.start), to: new Date(window.end) })).toHaveLength(60);
    expect(await listCheckIns(userId)).toHaveLength(50);
  });

  it("rejects overlapping declarations rather than counting the same observed run twice", async () => {
    const data = fixture();
    data.sessions.push(...data.sessions.filter((item) => item.id.startsWith("session-current")).map((item) => ({ ...item, id: `duplicate-${item.id}` })));
    expect((await runPatternPipeline(userId, window)).state).toBe("insufficient-evidence");
  });

  it("registers authenticated routes without requiring DuckDB", async () => {
    fixture({ count: 0, history: false });
    const app = createApp();
    const header = { "x-user-id": "00000000-0000-0000-0000-000000000001" };
    // /api/patterns reads persisted worker output: no run yet -> NO_RUN.
    // /api/insights still computes synchronously -> no-observations.
    const expected: Record<string, string> = { "/api/patterns": "NO_RUN", "/api/insights": "no-observations" };
    for (const path of ["/api/patterns", "/api/insights"]) {
      expect((await request(app).get(path)).status).toBe(401);
      const response = await request(app).get(`${path}?from=2026-09-01&to=2026-09-15`).set(header);
      expect(response.status).toBe(200);
      expect(response.body.state).toBe(expected[path]);
      expect((await request(app).get(`${path}?from=bad`).set(header)).status).toBe(400);
    }
  });

  it("defaults to the exact last fourteen days and validates bounded half-open windows", () => {
    const now = new Date("2026-09-15T12:00:00Z");
    expect(resolveWindow(undefined, undefined, now)).toEqual({ start: "2026-09-01T12:00:00.000Z", end: now.toISOString() });
    expect(() => resolveWindow("2026-09-15", "2026-09-01")).toThrow();
    expect(() => resolveWindow("2026-02-30", "2026-03-03")).toThrow();
    expect(() => resolveWindow(["2026-09-01"], "2026-09-15")).toThrow();
    expect(() => resolveWindow("2025-01-01", "2026-09-15")).toThrow();
  });

  it("counts every distinct recorded day across fourteen consecutive days of events", async () => {
    const data = fixture({ count: 0, history: false });
    for (let day = 4; day <= 17; day++) {
      data.events.push(row(`2026-09-${String(day).padStart(2, "0")}`, 3600, `spread-${day}`));
      data.sessions.push(session(data.events.at(-1)!));
    }
    const result = await runPatternPipeline(userId, window);
    expect(result.diagnostics.recordingHistory).toEqual({
      firstObservationAt: "2026-09-04T10:00:00.000Z",
      lastObservationAt: "2026-09-17T10:00:00.000Z",
      recordedDays: 14,
      connected: true,
    });
  });

  it("treats days inside the recorded span without events as absent rather than elapsed", async () => {
    const data = fixture({ count: 0, history: false });
    data.events.push(row("2026-09-04", 3600, "gap-first"));
    data.events.push(row("2026-09-16", 3600, "gap-last"));
    const result = await runPatternPipeline(userId, window);
    expect(result.diagnostics.recordingHistory).toEqual({
      firstObservationAt: "2026-09-04T10:00:00.000Z",
      lastObservationAt: "2026-09-16T10:00:00.000Z",
      recordedDays: 2,
      connected: true,
    });
  });

  it("collapses duplicated timestamps on the same calendar day into one recorded day", async () => {
    const data = fixture({ count: 0, history: false });
    data.events.push(row("2026-09-05", 3600, "duplicate-a"));
    data.events.push(row("2026-09-05", 1800, "duplicate-b"));
    data.events.push(row("2026-09-06", 900, "duplicate-c"));
    const result = await runPatternPipeline(userId, window);
    expect(result.diagnostics.recordingHistory?.recordedDays).toBe(2);
  });

  it("keeps another user's telemetry out of this user's recording history", async () => {
    const data = fixture({ count: 0, history: false });
    const result = await runPatternPipeline("other-user", window);
    expect(result.diagnostics.recordingHistory).toEqual({
      firstObservationAt: "2026-09-01T10:00:00.000Z",
      lastObservationAt: "2026-09-01T10:00:00.000Z",
      recordedDays: 1,
      connected: true,
    });
    expect(data.calls.filter((call) => call.kind === "activity").every((call) =>
      (call.args as { where: { userId: string } }).where.userId === "other-user")).toBe(true);
  });

  it("reports an empty history with null bounds for a user without any telemetry", async () => {
    fixture({ count: 0, history: false, connected: false });
    const result = await runPatternPipeline(userId, window);
    expect(result.diagnostics.recordingHistory).toEqual({
      firstObservationAt: null, lastObservationAt: null, recordedDays: 0, connected: false,
    });
    expect(result.state).toBe("not-connected");
  });

  it("counts a single observation as exactly one recorded day", async () => {
    const data = fixture({ count: 0, history: false });
    data.events.push(row("2026-09-07", 3600, "single"));
    const result = await runPatternPipeline(userId, window);
    expect(result.diagnostics.recordingHistory).toEqual({
      firstObservationAt: "2026-09-07T10:00:00.000Z",
      lastObservationAt: "2026-09-07T10:00:00.000Z",
      recordedDays: 1,
      connected: true,
    });
  });

  it("ignores telemetry recorded entirely outside the requested and baseline windows", async () => {
    const data = fixture({ count: 0, history: false, connected: false });
    data.events.push(row("2026-06-15", 3600, "outside"));
    const result = await runPatternPipeline(userId, window);
    expect(result.diagnostics.recordingHistory).toEqual({
      firstObservationAt: "2026-06-15T10:00:00.000Z",
      lastObservationAt: "2026-06-15T10:00:00.000Z",
      recordedDays: 1,
      connected: false,
    });
    expect(result.state).toBe("no-observations");
    expect(result.patterns).toEqual([]);
  });

  it("counts a day whose only event lands after local midnight via timezone conversion", async () => {
    const data = fixture({ count: 0, history: false, timezone: "Asia/Kolkata" });
    data.events.push(row("2026-09-05", 3600, "kolkata-night", userId));
    data.events[data.events.length - 1]!.timestamp = new Date("2026-09-05T20:30:00Z");
    const result = await runPatternPipeline(userId, window);
    expect(result.diagnostics.recordingHistory?.recordedDays).toBe(1);
    expect(result.diagnostics.recordingHistory?.firstObservationAt).toBe("2026-09-05T20:30:00.000Z");
  });

  it("reads recording history through a raw aggregate with the user and timezone parameters", async () => {
    const queryRaw = vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => Promise.resolve([{
      min_time: new Date("2026-08-20T08:00:00Z"),
      max_time: new Date("2026-09-10T09:00:00Z"),
      distinct_days: 9n,
    }])) as unknown as ReturnType<typeof vi.fn>;
    fixture({ queryRaw: queryRaw as unknown as HistoryQuery });
    const result = await runPatternPipeline(userId, window);
    expect(queryRaw).toHaveBeenCalledTimes(1);
    expect((queryRaw.mock.calls[0] as unknown[])[1]).toEqual("UTC");
    expect((queryRaw.mock.calls[0] as unknown[])[2]).toEqual(userId);
    const query = ((queryRaw.mock.calls[0] as unknown[])[0] as TemplateStringsArray).join("");
    expect(query).toContain("normalized_activity");
    expect(query).toContain("user_id");
    expect(query).toContain("AT TIME ZONE 'UTC' AT TIME ZONE");
    expect(result.diagnostics.recordingHistory).toEqual({
      firstObservationAt: "2026-08-20T08:00:00.000Z",
      lastObservationAt: "2026-09-10T09:00:00.000Z",
      recordedDays: 9,
      connected: true,
    });
  });

  it("falls back to findMany timestamps when the raw aggregate returns no rows", async () => {
    const data = fixture({ queryRaw: async () => [] });
    await runPatternPipeline(userId, window);
    const findManyCalls = data.calls.filter((call) => call.kind === "activity");
    expect(findManyCalls.length).toBeGreaterThan(1);
    expect(findManyCalls.at(-1)?.args).toEqual({
      where: { userId }, select: { timestamp: true },
    });
  });

  it("propagates a raw aggregate rejection instead of masking it as a fallback", async () => {
    fixture({ queryRaw: async () => { throw new Error("aggregate exploded"); } });
    await expect(runPatternPipeline(userId, window)).rejects.toThrow("aggregate exploded");
  });

  it("never exposes internal task identifiers in diagnostic reasons", async () => {
    fixture({ taskId: "0f0a1b2c-1111-4222-8333-abcdefabcdef" });
    const result = await runPatternPipeline(userId, window);
    for (const detector of result.diagnostics.perDetector) {
      expect(detector.reason).toBeDefined();
      expect(detector.reason).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    }
  });

  it("requests earlier comparable work when occasions are sparse but well covered", async () => {
    fixture({ count: 1 });
    const result = await runPatternPipeline(userId, window);
    expect(result.diagnostics.perDetector.find((item) => item.identity === "extended_continuous_activity")?.reason)
      .not.toContain("coverage");
    expect(result.diagnostics.perDetector.find((item) => item.identity === "extended_continuous_activity")?.reason)
      .toContain("More earlier comparable work");
  });

  it("attributes an insufficient evaluation to missing telemetry coverage when sessions span unobserved time", async () => {
    const data = fixture();
    data.events.forEach((event) => {
      if (event.externalId.startsWith("current")) { event.duration = 300; }
    });
    const result = await runPatternPipeline(userId, window);
    expect(result.diagnostics.perDetector.find((item) => item.identity === "extended_continuous_activity")?.reason)
      .toContain("coverage");
  });

  it("explains the absence of task-linked diagnostics when no closed sessions exist", async () => {
    fixture({ count: 0, history: false });
    const result = await runPatternPipeline(userId, window);
    expect(result.diagnostics.perDetector.find((item) => item.identity === "extended_continuous_activity")?.reason)
      .toContain("No closed task-linked sessions");
  });
});
