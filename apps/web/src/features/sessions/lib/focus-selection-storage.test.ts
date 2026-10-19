import { afterEach, describe, it, expect, vi } from "vitest";
import {
  readStoredFocusTaskId,
  writeStoredFocusTaskId,
  validateStoredFocusTaskId,
} from "./focus-selection-storage";

const STORAGE_KEY = "phix.sessions.selected-focus-task-id";

function installFakeStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  const storage = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
  };
  Object.defineProperty(globalThis, "sessionStorage", {
    value: storage,
    configurable: true,
    writable: true,
  });
  return { data, storage };
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, "sessionStorage");
  vi.restoreAllMocks();
});

describe("focus selection storage", () => {
  it("round-trips a selected task id and clears it with null", () => {
    const { data } = installFakeStorage();
    writeStoredFocusTaskId("task-42");
    expect(data.get(STORAGE_KEY)).toBe("task-42");
    expect(readStoredFocusTaskId()).toBe("task-42");

    writeStoredFocusTaskId(null);
    expect(data.has(STORAGE_KEY)).toBe(false);
    expect(readStoredFocusTaskId()).toBeNull();
  });

  it("returns null when sessionStorage is unavailable (SSR / blocked storage)", () => {
    expect(readStoredFocusTaskId()).toBeNull();
    expect(() => writeStoredFocusTaskId("task-1")).not.toThrow();
  });

  it("returns null when reading throws", () => {
    Object.defineProperty(globalThis, "sessionStorage", {
      value: {
        getItem: () => {
          throw new Error("blocked");
        },
        setItem: () => {},
        removeItem: () => {},
      },
      configurable: true,
      writable: true,
    });
    expect(readStoredFocusTaskId()).toBeNull();
  });
});

describe("validateStoredFocusTaskId", () => {
  it("accepts a stored id still present in available task data", () => {
    expect(validateStoredFocusTaskId("task-7", new Set(["task-7", "task-9"]))).toBe("task-7");
  });

  it("rejects a stored id no longer present in available task data", () => {
    expect(validateStoredFocusTaskId("task-deleted", new Set(["task-7"]))).toBeNull();
  });

  it("treats a missing stored id as no selection", () => {
    expect(validateStoredFocusTaskId(null, new Set(["task-7"]))).toBeNull();
  });
});
