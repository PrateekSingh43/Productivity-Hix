// apps/web/src/features/tasks/lib/task-provenance.test.ts
import { describe, it, expect } from "vitest";
import { formatTaskProvenance } from "./task-provenance";

describe("formatTaskProvenance", () => {
  it("includes due date for completed tasks", () => {
    const tokens = formatTaskProvenance({
      createdAt: "2026-09-28T10:00:00.000Z",
      dueAt: "2026-10-02T23:59:59.000Z",
      productiveDate: "2026-10-01",
      completedAt: "2026-10-03T10:00:00.000Z",
    });
    expect(tokens.join(" ")).toContain("Due:");
    expect(tokens.join(" ")).toContain("Completed:");
  });
  it("omits missing dates without faking", () => {
    const tokens = formatTaskProvenance({
      createdAt: "2026-09-28T10:00:00.000Z",
      dueAt: null,
      productiveDate: null,
      completedAt: null,
    });
    expect(tokens.length).toBe(1);
  });
});
