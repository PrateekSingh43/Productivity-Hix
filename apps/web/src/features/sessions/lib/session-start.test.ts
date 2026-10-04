// apps/web/src/features/sessions/lib/session-start.test.ts
import { describe, it, expect } from "vitest";
import { resolveSessionStartInput } from "./session-start";

describe("resolveSessionStartInput", () => {
  it("returns taskId null in independent mode with default notes", () => {
    const out = resolveSessionStartInput(null, "", 25);
    expect(out).toEqual({ taskId: null, notes: "Deliberate focus session", durationMinutes: 25 });
  });
  it("keeps linked taskId and trims topic", () => {
    const out = resolveSessionStartInput("task-1", "  review  ", 50);
    expect(out).toEqual({ taskId: "task-1", notes: "review", durationMinutes: 50 });
  });
});
