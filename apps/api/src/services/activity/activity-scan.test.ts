import { describe, expect, it, vi, afterEach } from "vitest";
import { activityInRange } from "./service";
import { setTestDb, resetTestDb } from "../../lib/prisma";

const DEV_USER = "cuid_dev_user_001";

afterEach(() => {
  resetTestDb();
});

describe("Timeline Part A: Database Query Range Filtering in activityInRange", () => {
  it("Scenario 10: activityInRange constrains PostgreSQL query with safe lower bound and lt: to", async () => {
    let capturedWhere: any = null;

    const from = new Date("2026-09-23T10:00:00.000Z");
    const to = new Date("2026-09-23T11:00:00.000Z");
    const maxLookbackMs = 24 * 60 * 60 * 1000;
    const expectedLowerBound = new Date(from.getTime() - maxLookbackMs);

    const mockDb: any = {
      normalizedActivity: {
        findMany: vi.fn().mockImplementation(({ where }) => {
          capturedWhere = where;
          return Promise.resolve([
            {
              id: "act_1",
              externalId: "ext_1",
              bucketId: "b_1",
              source: "desktop",
              watcher: "active_window",
              timestamp: new Date("2026-09-23T10:00:00.000Z"),
              duration: 120, // 2 minutes
              data: { application: "Code", windowTitle: "file.ts" },
            },
          ]);
        }),
      },
    };

    setTestDb(mockDb);

    const result = await activityInRange(DEV_USER, from, to);

    expect(capturedWhere).toEqual({
      userId: DEV_USER,
      timestamp: { gte: expectedLowerBound, lt: to },
      duration: { gt: 0 },
    });

    expect(result).toHaveLength(1);
    expect(result[0].externalId).toBe("ext_1");
    expect(result[0].duration).toBe(120);
  });

  it("Scenario 11: JavaScript clipping correctly retrieves and clamps events starting before from", async () => {
    const from = new Date("2026-09-23T10:00:00.000Z");
    const to = new Date("2026-09-23T11:00:00.000Z"); // 1 hour window

    const mockDb: any = {
      normalizedActivity: {
        findMany: vi.fn().mockResolvedValue([
          // Event 1: starts at 09:55, duration 15 mins (ends at 10:10) -> starts before 'from', extends 10 mins into range
          {
            id: "act_cross_start",
            externalId: "ext_cross_start",
            bucketId: "b_1",
            source: "desktop",
            watcher: "active_window",
            timestamp: new Date("2026-09-23T09:55:00.000Z"),
            duration: 15 * 60, // 15 minutes = 900s
            data: {},
          },
          // Event 2: starts at 10:50, duration 20 mins (ends at 11:10) -> extends 10 mins beyond 'to'
          {
            id: "act_cross_end",
            externalId: "ext_cross_end",
            bucketId: "b_1",
            source: "desktop",
            watcher: "active_window",
            timestamp: new Date("2026-09-23T10:50:00.000Z"),
            duration: 20 * 60, // 20 minutes = 1200s
            data: {},
          },
          // Event 3: starts at 10:15, duration 15 mins (ends at 10:30) -> fully inside
          {
            id: "act_inside",
            externalId: "ext_inside",
            bucketId: "b_1",
            source: "desktop",
            watcher: "active_window",
            timestamp: new Date("2026-09-23T10:15:00.000Z"),
            duration: 15 * 60, // 15 minutes = 900s
            data: {},
          },
          // Event 4: strictly before 'from' (09:00 to 09:30) -> must be completely dropped
          {
            id: "act_outside_before",
            externalId: "ext_outside_before",
            bucketId: "b_1",
            source: "desktop",
            watcher: "active_window",
            timestamp: new Date("2026-09-23T09:00:00.000Z"),
            duration: 30 * 60,
            data: {},
          },
        ]),
      },
    };

    setTestDb(mockDb);

    const result = await activityInRange(DEV_USER, from, to);

    // 3 events overlap [from, to), event 4 is excluded
    expect(result).toHaveLength(3);

    // Event 1: clamped from 09:55 to 10:00 start, ending at 10:10 (duration 10 minutes = 600s)
    const clampedCrossStart = result.find((r) => r.externalId === "ext_cross_start");
    expect(clampedCrossStart).toBeDefined();
    expect(new Date(clampedCrossStart!.timestamp).toISOString()).toBe("2026-09-23T10:00:00.000Z");
    expect(clampedCrossStart!.duration).toBe(10 * 60);

    // Event 2: clamped from 10:50 to 11:00 (10 minutes = 600s instead of 1200s)
    const clampedCrossEnd = result.find((r) => r.externalId === "ext_cross_end");
    expect(clampedCrossEnd).toBeDefined();
    expect(clampedCrossEnd!.duration).toBe(10 * 60);
    expect(new Date(clampedCrossEnd!.timestamp).toISOString()).toBe("2026-09-23T10:50:00.000Z");

    // Event 3: preserved exact duration (15 minutes = 900s)
    const insideEvent = result.find((r) => r.externalId === "ext_inside");
    expect(insideEvent).toBeDefined();
    expect(insideEvent!.duration).toBe(15 * 60);
  });
});
