import { afterEach, describe, expect, it } from "vitest";
import { resetTestDb, setTestDb } from "../../lib/prisma";
import { getSessionsObservedActivity } from "./service";

afterEach(resetTestDb);

/**
 * Pins the compact observation contract (mission Phase 4):
 * per-session windows attribute normalized telemetry by interval midpoint;
 * AFK is excluded; output is apps + seconds only — no productivity labels,
 * no coverage percentages.
 */

function activity(
  id: string,
  timestamp: string,
  duration: number,
  application: string,
  watcher = "window",
) {
  return {
    id,
    externalId: id,
    timestamp: new Date(timestamp),
    duration,
    source: "desktop",
    watcher,
    data: { application, windowTitle: `${application} window` },
  };
}

describe("getSessionsObservedActivity", () => {
  it("attributes telemetry to the containing session windows", async () => {
    setTestDb({
      workSession: {
        findMany: async () => [
          {
            id: "s-1",
            startedAt: new Date("2026-09-30T08:00:00.000Z"),
            endedAt: new Date("2026-09-30T09:00:00.000Z"),
            durationSeconds: 3600,
          },
          {
            id: "s-2",
            startedAt: new Date("2026-09-30T10:00:00.000Z"),
            endedAt: new Date("2026-09-30T10:30:00.000Z"),
            durationSeconds: 1800,
          },
        ],
      },
      normalizedActivity: {
        findMany: async () => [
          activity("a-1", "2026-09-30T08:10:00.000Z", 1800, "Code.exe"),
          activity("a-2", "2026-09-30T10:05:00.000Z", 600, "chrome.exe"),
          activity("a-3", "2026-09-30T12:00:00.000Z", 600, "Code.exe"),
        ],
      },
    });

    const out = await getSessionsObservedActivity("user-1", ["s-1", "s-2", "s-9"]);
    expect(Object.keys(out).sort()).toEqual(["s-1", "s-2"]);
    expect(out["s-1"]!.observedSeconds).toBeGreaterThanOrEqual(1500);
    expect(out["s-1"]!.apps.length).toBeGreaterThanOrEqual(1);
    expect(out["s-2"]!.observedSeconds).toBeGreaterThanOrEqual(300);
    // No productivity judgments anywhere in the payload.
    expect(JSON.stringify(out)).not.toMatch(/productive|focused|score|percent/i);
  });

  it("returns zeroed summaries when no telemetry exists", async () => {
    setTestDb({
      workSession: {
        findMany: async () => [
          {
            id: "s-1",
            startedAt: new Date("2026-09-30T08:00:00.000Z"),
            endedAt: new Date("2026-09-30T09:00:00.000Z"),
            durationSeconds: 3600,
          },
        ],
      },
      normalizedActivity: { findMany: async () => [] },
    });
    const out = await getSessionsObservedActivity("user-1", ["s-1"]);
    expect(out).toEqual({ "s-1": { apps: [], observedSeconds: 0 } });
  });

  it("returns empty for empty or unknown ids", async () => {
    setTestDb({
      workSession: { findMany: async () => [] },
      normalizedActivity: { findMany: async () => [] },
    });
    expect(await getSessionsObservedActivity("user-1", [])).toEqual({});
    expect(await getSessionsObservedActivity("user-1", ["nope"])).toEqual({});
  });
});
