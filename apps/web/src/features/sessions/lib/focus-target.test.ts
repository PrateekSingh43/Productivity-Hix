import { describe, it, expect } from "vitest";
import { resolveFocusPayload, type FocusTarget } from "./focus-target";

describe("resolveFocusPayload", () => {
  it("no task + custom topic yields an independent payload (taskId null)", () => {
    const target: FocusTarget = { kind: "independent", topic: "  Understand system design Ch. 1 " };
    expect(resolveFocusPayload(target, 45)).toEqual({
      taskId: null,
      notes: "Understand system design Ch. 1",
      targetDurationMinutes: 45,
    });
  });

  it("explicit task target links the session to that task id", () => {
    const target: FocusTarget = { kind: "task", taskId: "task-123" };
    expect(resolveFocusPayload(target, 60, "Deep work")).toEqual({
      taskId: "task-123",
      notes: "Deep work",
      targetDurationMinutes: 60,
    });
  });

  it("never invents a target: omitted duration stays null", () => {
    const target: FocusTarget = { kind: "independent", topic: "Reading" };
    expect(resolveFocusPayload(target, null)).toEqual({
      taskId: null,
      notes: "Reading",
      targetDurationMinutes: null,
    });
  });

  it("never invents notes: empty topic stays null", () => {
    const target: FocusTarget = { kind: "independent", topic: "   " };
    expect(resolveFocusPayload(target, 25).notes).toBeNull();
  });

  it("task target without notes stays null (no 'Focus on X' synthesis)", () => {
    const target: FocusTarget = { kind: "task", taskId: "task-9" };
    expect(resolveFocusPayload(target, 30)).toEqual({
      taskId: "task-9",
      notes: null,
      targetDurationMinutes: 30,
    });
  });
});
