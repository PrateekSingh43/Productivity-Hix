import { describe, it, expect } from "vitest";
import {
  DEFAULT_SESSION_FILTERS,
  resolveSessionFilters,
  sessionFiltersDifferFromDefaults,
  type SessionFilterInput,
} from "./session-filters";

const BASE: SessionFilterInput = {
  ...DEFAULT_SESSION_FILTERS,
  timezone: "UTC",
  boundary: "00:00",
  now: new Date("2026-10-04T12:00:00.000Z"),
};

describe("resolveSessionFilters", () => {
  it("defaults scope 30 productive days with limit 200", () => {
    const out = resolveSessionFilters(BASE);
    expect(out.limit).toBe(200);
    expect(out.from).toBe("2026-09-05T00:00:00.000Z");
    expect(out.to).toBe("2026-10-05T00:00:00.000Z");
    expect(out.taskId).toBeUndefined();
    expect(out.linked).toBeUndefined();
    expect(out.search).toBeUndefined();
  });

  it("all preset is unbounded with limit 500", () => {
    const out = resolveSessionFilters({ ...BASE, rangePreset: "all" });
    expect(out.limit).toBe(500);
    expect(out.from).toBeUndefined();
    expect(out.to).toBeUndefined();
  });

  it("custom preset carries the canonical custom window", () => {
    const out = resolveSessionFilters({
      ...BASE,
      rangePreset: "custom",
      customFrom: "2026-09-18",
      customTo: "2026-10-02",
    });
    expect(out.from).toBe("2026-09-18T00:00:00.000Z");
    expect(out.to).toBe("2026-10-03T00:00:00.000Z");
  });

  it("passes structural filters and search through", () => {
    const out = resolveSessionFilters({
      ...BASE,
      selectedTaskId: "task-9",
      linkedFilter: "independent",
      searchQuery: "  review  ",
    });
    expect(out.taskId).toBe("task-9");
    expect(out.linked).toBe("independent");
    expect(out.search).toBe("review");
  });
});

describe("sessionFiltersDifferFromDefaults", () => {
  it("is false on plain load", () => {
    expect(sessionFiltersDifferFromDefaults(BASE)).toBe(false);
  });

  it("is true when any control moves", () => {
    expect(
      sessionFiltersDifferFromDefaults({ ...BASE, rangePreset: "7d" }),
    ).toBe(true);
    expect(
      sessionFiltersDifferFromDefaults({ ...BASE, linkedFilter: "linked" }),
    ).toBe(true);
    expect(
      sessionFiltersDifferFromDefaults({ ...BASE, customFrom: "2026-09-18" }),
    ).toBe(true);
  });
});
