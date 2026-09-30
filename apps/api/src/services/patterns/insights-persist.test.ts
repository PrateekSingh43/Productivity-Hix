import { describe, expect, it, afterEach } from "vitest";
import type { InsightOutput } from "@repo/types";
import { setTestDb, resetTestDb } from "../../lib/prisma";
import { persistInsightsForWindow } from "./service";

process.env.NODE_ENV = "test";
process.env.ALLOW_DEV_AUTH = "true";

afterEach(resetTestDb);

const WINDOW = { start: "2026-09-01T00:00:00.000Z", end: "2026-09-15T00:00:00.000Z" };

function insight(claim: string, status: InsightOutput["status"] = "DETECTED"): InsightOutput {
  return {
    inputs: [{ patternId: "p-1", role: "primary" }],
    personalElements: [{ kind: "reflection", recordId: "r-1" }],
    claim,
    claimLevel: "co-occurrence",
    alternatives: [],
    doesNotEstablish: ["Whether one observation caused another."],
    evidenceRefs: [],
    status,
    window: WINDOW,
    reliability: null,
  };
}

describe("persistInsightsForWindow (Phase 6)", () => {
  it("persists DETECTED insights once, dedups reruns, skips non-DETECTED", async () => {
    const store: any[] = [];
    setTestDb({
      insight: {
        findFirst: async ({ where }: any) =>
          store.find((r) => r.userId === where.userId && r.contentHash === where.contentHash) ?? null,
        create: async ({ data }: any) => {
          const row = { id: `in-${store.length}`, ...data };
          store.push(row);
          return row;
        },
      },
    } as any);

    const first = await persistInsightsForWindow("u-1", WINDOW, [
      insight("Late starts co-occur with low focus."),
      insight("Afternoons show more switching."),
      insight("Not enough evidence.", "NO_INSIGHT"),
    ]);
    expect(first).toBe(2);
    expect(store).toHaveLength(2);
    expect(store[0].patternIds).toEqual(["p-1"]);

    const second = await persistInsightsForWindow("u-1", WINDOW, [
      insight("Late starts co-occur with low focus."),
      insight("Afternoons show more switching."),
    ]);
    expect(second).toBe(0);
    expect(store).toHaveLength(2);
  });

  it("returns 0 when the client has no Insight model", async () => {
    setTestDb({} as any);
    expect(await persistInsightsForWindow("u-1", WINDOW, [insight("x")])).toBe(0);
  });
});
