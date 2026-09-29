import { describe, it, expect, afterEach, vi } from "vitest";
import {
  getRedisEndpointCandidates,
  isQuotaError,
} from "./redis";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getRedisEndpointCandidates", () => {
  it("skips cloud candidates when REDIS_FORCE_LOCAL=true", () => {
    vi.stubEnv("REDIS_URL", "rediss://default:token@cloud.upstash.io:6379");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://x.upstash.io");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "token");
    vi.stubEnv("REDIS_LOCAL_URL", "redis://127.0.0.1:6379");
    vi.stubEnv("REDIS_FORCE_LOCAL", "true");
    const names = getRedisEndpointCandidates().map((c) => c.name);
    expect(names.some((n) => n.startsWith("cloud"))).toBe(false);
    expect(names.length).toBeGreaterThan(0);
  });

  it("keeps cloud-first ordering by default", () => {
    vi.stubEnv("REDIS_URL", "rediss://default:token@cloud.upstash.io:6379");
    vi.stubEnv("REDIS_LOCAL_URL", "redis://127.0.0.1:6379");
    vi.stubEnv("REDIS_FORCE_LOCAL", "false");
    const names = getRedisEndpointCandidates().map((c) => c.name);
    expect(names[0]).toBe("cloud (REDIS_URL)");
    expect(names[names.length - 1]).toContain("local");
  });
});

describe("isQuotaError", () => {
  it("detects Upstash quota exhaustion", () => {
    expect(
      isQuotaError(
        new Error("ERR max requests limit exceeded. Limit: 500000, Usage: 500002")
      )
    ).toBe(true);
  });

  it("rejects ordinary errors", () => {
    expect(isQuotaError(new Error("Connection is closed"))).toBe(false);
    expect(isQuotaError(new Error("invalid payload"))).toBe(false);
    expect(isQuotaError(undefined)).toBe(false);
  });
});
