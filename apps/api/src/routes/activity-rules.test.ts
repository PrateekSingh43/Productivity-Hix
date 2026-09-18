import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "../app";
import { setTestDb, resetTestDb } from "../lib/prisma";

const DEV_USER = "cuid_dev_user_001";

beforeEach(() => {
  vi.stubEnv("ALLOW_DEV_AUTH", "true");
});

afterEach(() => {
  resetTestDb();
  vi.unstubAllEnvs();
});

function dbWithRules(rules: unknown[] = [], overrides: unknown[] = []) {
  return {
    userActivityRule: {
      findMany: vi.fn().mockResolvedValue(rules),
      create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: "cuid_rule_001", ...data })),
      findFirst: vi.fn().mockImplementation(({ where }) => {
        const found = rules.find((r: any) => r.id === where.id);
        return Promise.resolve(found ?? (where.id === "cuid_rule_001" ? { id: "cuid_rule_001", userId: DEV_USER } : null));
      }),
      update: vi.fn().mockImplementation(({ where, data }) => Promise.resolve({ id: where.id, ...data })),
      delete: vi.fn().mockResolvedValue({ id: "cuid_rule_001" }),
    },
    userActivityOverride: {
      findMany: vi.fn().mockResolvedValue(overrides),
      create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: "cuid_override_001", ...data })),
      findFirst: vi.fn().mockImplementation(({ where }) => {
        const found = overrides.find((o: any) => o.id === where.id);
        return Promise.resolve(found ?? (where.id === "cuid_override_001" ? { id: "cuid_override_001", userId: DEV_USER } : null));
      }),
      delete: vi.fn().mockResolvedValue({ id: "cuid_override_001" }),
    },
  };
}

describe("activity rules & overrides API", () => {
  it("lists rules", async () => {
    const db = dbWithRules([{ id: "cuid_rule_001", name: "YT tutorials", priority: 10 }]);
    setTestDb(db);
    const res = await request(createApp())
      .get("/api/activity-rules/rules")
      .set("x-user-id", DEV_USER);
    expect(res.status).toBe(200);
    expect(res.body.rules).toHaveLength(1);
    expect(db.userActivityRule.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: DEV_USER } })
    );
  });

  it("creates a rule with valid input", async () => {
    const db = dbWithRules();
    setTestDb(db);
    const res = await request(createApp())
      .post("/api/activity-rules/rules")
      .set("x-user-id", DEV_USER)
      .send({
        name: "Chess is gaming",
        domainPattern: "chess\\.com",
        assignedModality: "gaming",
      });
    expect(res.status).toBe(201);
    expect(res.body.rule.assignedModality).toBe("gaming");
    expect(db.userActivityRule.create).toHaveBeenCalled();
  });

  it("rejects a rule with no matchers", async () => {
    setTestDb(dbWithRules());
    const res = await request(createApp())
      .post("/api/activity-rules/rules")
      .set("x-user-id", DEV_USER)
      .send({ name: "bad", assignedModality: "gaming" });
    expect(res.status).toBe(400);
  });

  it("updates an existing rule", async () => {
    const db = dbWithRules([{ id: "cuid_rule_001", name: "Old Name", userId: DEV_USER }]);
    setTestDb(db);
    const res = await request(createApp())
      .patch("/api/activity-rules/rules/cuid_rule_001")
      .set("x-user-id", DEV_USER)
      .send({ name: "New Name", isEnabled: false });
    expect(res.status).toBe(200);
    expect(res.body.rule.name).toBe("New Name");
  });

  it("deletes an existing rule", async () => {
    const db = dbWithRules([{ id: "cuid_rule_001", name: "Rule to delete", userId: DEV_USER }]);
    setTestDb(db);
    const res = await request(createApp())
      .delete("/api/activity-rules/rules/cuid_rule_001")
      .set("x-user-id", DEV_USER);
    expect(res.status).toBe(200);
    expect(res.body.deleted).toBe(true);
    expect(db.userActivityRule.delete).toHaveBeenCalledWith({ where: { id: "cuid_rule_001" } });
  });

  it("returns 404 when updating a foreign or non-existent rule", async () => {
    setTestDb({
      userActivityRule: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    });
    const res = await request(createApp())
      .patch("/api/activity-rules/rules/cuid_other_rule")
      .set("x-user-id", DEV_USER)
      .send({ isEnabled: false });
    expect(res.status).toBe(404);
  });

  it("lists overrides", async () => {
    const db = dbWithRules([], [{ id: "cuid_override_001", overriddenValue: "gaming" }]);
    setTestDb(db);
    const res = await request(createApp())
      .get("/api/activity-rules/overrides")
      .set("x-user-id", DEV_USER);
    expect(res.status).toBe(200);
    expect(res.body.overrides).toHaveLength(1);
    expect(db.userActivityOverride.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: DEV_USER } })
    );
  });

  it("creates an occurrence override", async () => {
    const db = dbWithRules();
    setTestDb(db);
    const res = await request(createApp())
      .post("/api/activity-rules/overrides")
      .set("x-user-id", DEV_USER)
      .send({
        targetTimeWindowStart: "2026-09-01T10:00:00.000Z",
        targetTimeWindowEnd: "2026-09-01T10:20:00.000Z",
        targetApplication: "Chrome",
        targetClaimType: "MODALITY_PRIMARY",
        overriddenValue: "gaming",
      });
    expect(res.status).toBe(201);
    expect(db.userActivityOverride.create).toHaveBeenCalled();
  });

  it("rejects an override with end before start", async () => {
    const db = dbWithRules();
    setTestDb(db);
    const res = await request(createApp())
      .post("/api/activity-rules/overrides")
      .set("x-user-id", DEV_USER)
      .send({
        targetTimeWindowStart: "2026-09-01T10:20:00.000Z",
        targetTimeWindowEnd: "2026-09-01T10:00:00.000Z",
        targetApplication: "Chrome",
        targetClaimType: "MODALITY_PRIMARY",
        overriddenValue: "gaming",
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("targetTimeWindowEnd must be after targetTimeWindowStart");
  });

  it("deletes an occurrence override", async () => {
    const db = dbWithRules([], [{ id: "cuid_override_001", userId: DEV_USER }]);
    setTestDb(db);
    const res = await request(createApp())
      .delete("/api/activity-rules/overrides/cuid_override_001")
      .set("x-user-id", DEV_USER);
    expect(res.status).toBe(200);
    expect(res.body.deleted).toBe(true);
    expect(db.userActivityOverride.delete).toHaveBeenCalledWith({ where: { id: "cuid_override_001" } });
  });
});
