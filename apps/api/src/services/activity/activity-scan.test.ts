import { describe, expect, it, vi, afterEach } from "vitest";
import { activityInRange } from "./service";
import { setTestDb, resetTestDb } from "../../lib/prisma";

const DEV_USER = "cuid_dev_user_001";

afterEach(() => {
  resetTestDb();
});

describe("Timeline Part A: Database Query Range Filtering in activityInRange", () => {
  it("Scenario 10: activityInRange constrains PostgreSQL query with timestamp >= from and timestamp < to", async () => {
    let capturedWhere: any = null;

    const from = new Date("2026-09-23T00:00:00.000Z");
    const to = new Date("2026-09-24T00:00:00.000Z");

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
      timestamp: { gte: from, lt: to },
      duration: { gt: 0 },
    });

    expect(result).toHaveLength(1);
    expect(result[0].externalId).toBe("ext_1");
    expect(result[0].duration).toBe(120);
  });

  it("Scenario 11: JavaScript clipping correctly clamps events crossing the interval boundary", async () => {
    const from = new Date("2026-09-23T10:00:00.000Z");
    const to = new Date("2026-09-23T11:00:00.000Z"); // 1 hour window

    const mockDb: any = {
      normalizedActivity: {
        findMany: vi.fn().mockResolvedValue([
          // Event 1: starts at 10:50, duration 20 mins (ends at 11:10) -> extends 10 mins beyond 'to'
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
          // Event 2: starts at 10:15, duration 15 mins (ends at 10:30) -> fully inside
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
        ]),
      },
    };

    setTestDb(mockDb);

    const result = await activityInRange(DEV_USER, from, to);

    expect(result).toHaveLength(2);

    // Event 1: clamped from 10:50 to 11:00 (10 minutes = 600s instead of 1200s)
    const clampedCrossEnd = result.find((r) => r.externalId === "ext_cross_end");
    expect(clampedCrossEnd).toBeDefined();
    expect(clampedCrossEnd!.duration).toBe(10 * 60);
    expect(new Date(clampedCrossEnd!.timestamp).toISOString()).toBe("2026-09-23T10:50:00.000Z");

    // Event 2: preserved exact duration (15 minutes = 900s)
    const insideEvent = result.find((r) => r.externalId === "ext_inside");
    expect(insideEvent).toBeDefined();
    expect(insideEvent!.duration).toBe(15 * 60);
  });
});
