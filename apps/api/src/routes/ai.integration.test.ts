import { describe, it, expect, afterEach, beforeAll } from "vitest";
import request from "supertest";
import { AIRuntime, AIError, type AIProvider, type GenerateRequest } from "@repo/ai";
import { createApp } from "../app";
import { setAIRuntimeForTest } from "../services/ai/runtime";

// Ensure test environment
process.env.NODE_ENV = "test";
process.env.ALLOW_DEV_AUTH = "true";

const DEV_USER_HEADER = { "x-user-id": "00000000-0000-0000-0000-000000000001" };

class FakeProvider implements AIProvider {
  readonly name = "gemini" as const;
  readonly model = "fake-model";

  async generate(request: GenerateRequest) {
    const last = request.messages.at(-1)?.content ?? "";
    if (last === "fail") {
      throw new AIError("synthetic provider failure", "provider", 502, "gemini");
    }
    if (last === "fail-auth") {
      throw new AIError("AI provider authentication failed", "auth", 401, "gemini");
    }
    if (last === "leak-secret") {
      throw new AIError("error with gsk_supersecret12345678", "provider", 502, "gemini");
    }
    return {
      text: `echo:${last}`,
      finishReason: "stop" as const,
      provider: this.name,
      model: this.model,
      usage: { inputTokens: 1, outputTokens: 1 },
    };
  }

  async *generateStream(request: GenerateRequest) {
    const last = request.messages.at(-1)?.content ?? "";
    if (last === "fail-stream") {
      yield { text: "partial", done: false };
      throw new AIError("mid-stream failure", "provider", 502, "gemini");
    }
    yield { text: `echo:${last}`, done: false };
    yield { text: "", done: true };
  }

  async generateWithTools(request: GenerateRequest) {
    const result = await this.generate(request);
    return { ...result, toolCalls: [] };
  }
}

function appWithAI() {
  setAIRuntimeForTest(new AIRuntime(new FakeProvider()));
  return createApp();
}

function appWithoutAI() {
  setAIRuntimeForTest(null);
  return createApp();
}

describe("AI HTTP integration", () => {
  afterEach(() => {
    setAIRuntimeForTest(undefined);
  });

  // ── GET /api/ai/status ───────────────────────────────────────────

  describe("GET /api/ai/status", () => {
    it("returns status when authenticated", async () => {
      const res = await request(appWithAI())
        .get("/api/ai/status")
        .set(DEV_USER_HEADER);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("configured");
      expect(res.body).toHaveProperty("ready");
    });

    it("returns 401 when unauthenticated", async () => {
      const res = await request(appWithAI())
        .get("/api/ai/status");

      expect(res.status).toBe(401);
    });
  });

  // ── POST /api/ai/generate ────────────────────────────────────────

  describe("POST /api/ai/generate", () => {
    it("generates with valid prompt", async () => {
      const res = await request(appWithAI())
        .post("/api/ai/generate")
        .set(DEV_USER_HEADER)
        .send({ prompt: "hello" });

      expect(res.status).toBe(200);
      expect(res.body.text).toBe("echo:hello");
      expect(res.body.provider).toBe("gemini");
      expect(res.body.model).toBe("fake-model");
      expect(res.body.finishReason).toBe("stop");
    });

    it("returns 400 for empty body", async () => {
      const res = await request(appWithAI())
        .post("/api/ai/generate")
        .set(DEV_USER_HEADER)
        .send({});

      expect(res.status).toBe(400);
    });

    it("returns 401 when unauthenticated", async () => {
      const res = await request(appWithAI())
        .post("/api/ai/generate")
        .send({ prompt: "hello" });

      expect(res.status).toBe(401);
    });

    it("returns 503 when AI is not configured", async () => {
      const res = await request(appWithoutAI())
        .post("/api/ai/generate")
        .set(DEV_USER_HEADER)
        .send({ prompt: "hello" });

      expect(res.status).toBe(503);
      expect(res.body.code).toBe("config");
    });

    it("maps provider failure to appropriate error", async () => {
      const res = await request(appWithAI())
        .post("/api/ai/generate")
        .set(DEV_USER_HEADER)
        .send({ prompt: "fail" });

      expect(res.status).toBe(502);
      expect(res.body.code).toBe("provider");
      expect(res.body.error).toBe("synthetic provider failure");
    });

    it("maps auth provider errors", async () => {
      const res = await request(appWithAI())
        .post("/api/ai/generate")
        .set(DEV_USER_HEADER)
        .send({ prompt: "fail-auth" });

      expect(res.status).toBe(401);
      expect(res.body.code).toBe("auth");
    });

    it("does not leak secrets in error responses", async () => {
      const res = await request(appWithAI())
        .post("/api/ai/generate")
        .set(DEV_USER_HEADER)
        .send({ prompt: "leak-secret" });

      const body = JSON.stringify(res.body);
      // The error message comes through as-is since it's already an AIError,
      // but the key pattern should not be present after sanitization
      expect(body).not.toContain("gsk_supersecret12345678");
    });

    it("rejects malformed messages array", async () => {
      const res = await request(appWithAI())
        .post("/api/ai/generate")
        .set(DEV_USER_HEADER)
        .send({ messages: [{ role: "invalid", content: "hi" }] });

      expect(res.status).toBe(400);
    });
  });

  // ── POST /api/ai/generate/stream ─────────────────────────────────

  describe("POST /api/ai/generate/stream", () => {
    it("streams SSE chunks for valid request", async () => {
      const res = await request(appWithAI())
        .post("/api/ai/generate/stream")
        .set(DEV_USER_HEADER)
        .send({ prompt: "hello" });

      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toContain("text/event-stream");

      // Parse SSE data lines
      const lines = res.text.split("\n").filter((l: string) => l.startsWith("data: "));
      expect(lines.length).toBeGreaterThanOrEqual(2);

      const firstChunk = JSON.parse(lines[0].replace("data: ", ""));
      expect(firstChunk.text).toBe("echo:hello");
    });

    it("returns error event on mid-stream provider failure", async () => {
      const res = await request(appWithAI())
        .post("/api/ai/generate/stream")
        .set(DEV_USER_HEADER)
        .send({ prompt: "fail-stream" });

      expect(res.status).toBe(200);
      const lines = res.text.split("\n").filter((l: string) => l.startsWith("data: "));
      const lastData = JSON.parse(lines[lines.length - 1].replace("data: ", ""));
      expect(lastData.error).toBeDefined();
      expect(lastData.done).toBe(true);
    });

    it("returns 401 when unauthenticated", async () => {
      const res = await request(appWithAI())
        .post("/api/ai/generate/stream")
        .send({ prompt: "hello" });

      expect(res.status).toBe(401);
    });

    it("returns 400 for malformed body", async () => {
      const res = await request(appWithAI())
        .post("/api/ai/generate/stream")
        .set(DEV_USER_HEADER)
        .send({});

      expect(res.status).toBe(400);
    });
  });
});
