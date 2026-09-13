process.env.NODE_ENV = "test";
process.env.ALLOW_DEV_AUTH = "true";

import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { AIError, AIRuntime, type AIProvider, type GenerateRequest } from "@repo/ai";
import { createApp } from "../../app";
import { setAIRuntimeForTest } from "./runtime";

class FakeProvider implements AIProvider {
  readonly name = "gemini" as const;
  readonly model = "fake-model";

  async generate(request: GenerateRequest) {
    const last = request.messages.at(-1)?.content ?? "";
    if (last === "fail") {
      throw new AIError("synthetic provider failure", "provider", 502, "gemini");
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
    yield { text: `echo:${last}`, done: false };
    yield { text: "", done: true };
  }

  async generateWithTools(request: GenerateRequest) {
    const result = await this.generate(request);
    return { ...result, toolCalls: [] };
  }
}

async function listen(app: ReturnType<typeof createApp>): Promise<{
  port: number;
  close: () => Promise<void>;
}> {
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to bind test server");
  }
  return {
    port: address.port,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

describe("API AI generation path", () => {
  afterEach(() => {
    setAIRuntimeForTest(undefined);
  });

  it("requires authentication", async () => {
    const { port, close } = await listen(createApp());
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/ai/generate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt: "hello" }),
      });
      assert.equal(response.status, 401);
    } finally {
      await close();
    }
  });

  it("returns 503 when AI is not configured", async () => {
    setAIRuntimeForTest(null);
    const { port, close } = await listen(createApp());
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/ai/generate`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-user-id": "00000000-0000-0000-0000-000000000001",
        },
        body: JSON.stringify({ prompt: "hello" }),
      });
      assert.equal(response.status, 503);
      const body = (await response.json()) as { error?: string; code?: string };
      assert.equal(body.code, "config");
      assert.equal(body.error, "AI is not configured");
    } finally {
      await close();
    }
  });

  it("generates through the configured runtime without a provider-specific API branch", async () => {
    setAIRuntimeForTest(new AIRuntime(new FakeProvider()));
    const { port, close } = await listen(createApp());
    try {
      const status = await fetch(`http://127.0.0.1:${port}/api/ai/status`, {
        headers: { "x-user-id": "00000000-0000-0000-0000-000000000001" },
      });
      assert.equal(status.status, 200);

      const response = await fetch(`http://127.0.0.1:${port}/api/ai/generate`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-user-id": "00000000-0000-0000-0000-000000000001",
        },
        body: JSON.stringify({ prompt: "hello" }),
      });
      assert.equal(response.status, 200);
      const body = (await response.json()) as { text?: string; provider?: string; model?: string };
      assert.equal(body.text, "echo:hello");
      assert.equal(body.provider, "gemini");
      assert.equal(body.model, "fake-model");
    } finally {
      await close();
    }
  });

  it("surfaces provider errors", async () => {
    setAIRuntimeForTest(new AIRuntime(new FakeProvider()));
    const { port, close } = await listen(createApp());
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/ai/generate`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-user-id": "00000000-0000-0000-0000-000000000001",
        },
        body: JSON.stringify({ prompt: "fail" }),
      });
      assert.equal(response.status, 502);
      const body = (await response.json()) as { error?: string; code?: string };
      assert.equal(body.code, "provider");
      assert.equal(body.error, "synthetic provider failure");
    } finally {
      await close();
    }
  });
});
