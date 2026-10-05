// apps/web/src/features/tasks/lib/task-reschedule.test.ts
import { describe, it, expect } from "vitest";
import { resolveRescheduleDate } from "./task-reschedule";

describe("resolveRescheduleDate", () => {
  it("today returns today", () => {
    expect(resolveRescheduleDate("today", "2026-10-04")).toBe("2026-10-04");
  });
  it("tomorrow and next-week shift correctly", () => {
    expect(resolveRescheduleDate("tomorrow", "2026-10-04")).toBe("2026-10-05");
    expect(resolveRescheduleDate("next-week", "2026-10-04")).toBe("2026-10-11");
  });
  it("backlog returns null, custom passes through", () => {
    expect(resolveRescheduleDate("backlog", "2026-10-04")).toBeNull();
    expect(resolveRescheduleDate({ custom: "2026-10-20" }, "2026-10-04")).toBe("2026-10-20");
  });
});
