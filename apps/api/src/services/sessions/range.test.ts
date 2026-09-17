import { afterEach, describe, expect, it } from "vitest";
import { resetTestDb, setTestDb } from "../../lib/prisma";
import { listSessions } from "./service";

afterEach(resetTestDb);

describe("session analytical range reads", () => {
  it("does not truncate a requested window at the interactive list limit", async () => {
    const rows = Array.from({ length: 60 }, (_, i) => ({
      id: `session-${i}`, userId: "user-1", taskId: "task-1",
      startedAt: new Date("2026-09-01T10:00:00Z"),
      endedAt: new Date("2026-09-01T11:00:00Z"),
      durationSeconds: 3600, source: "manual",
    }));
    setTestDb({ workSession: { findMany: async ({ take }: { take?: number }) => rows.slice(0, take) } });
    const result = await listSessions("user-1", {
      from: new Date("2026-09-01"), to: new Date("2026-09-15"),
    });
    expect(result).toHaveLength(60);
    expect(await listSessions("user-1")).toHaveLength(50);
  });
});
