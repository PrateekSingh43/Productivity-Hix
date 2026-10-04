// apps/web/src/features/sessions/lib/session-filters.test.ts
import { describe, it, expect } from "vitest";
import { resolveSessionFilters } from "./session-filters";

describe("resolveSessionFilters", () => {
  it("today preset sets from to start of day with limit 200", () => {
    const now = new Date("2026-10-04T15:00:00");
    const out = resolveSessionFilters("today", "all", "", now);
    expect(out.limit).toBe(200);
    expect(new Date(out.from as string).getHours()).toBe(0);
  });
  it("all preset uses limit 500 and no from", () => {
    const out = resolveSessionFilters("all", "all", "", new Date("2026-10-04T15:00:00"));
    expect(out.limit).toBe(500);
    expect(out.from).toBeUndefined();
  });
  it("passes taskId and search through", () => {
    const out = resolveSessionFilters("30d", "task-9", "review", new Date("2026-10-04T15:00:00"));
    expect(out.taskId).toBe("task-9");
    expect(out.search).toBe("review");
  });
});
