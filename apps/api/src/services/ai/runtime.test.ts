import { describe, it, expect, afterEach } from "vitest";
import { AIRuntime, AIError, type AIProvider, type GenerateRequest } from "@repo/ai";
import { setAIRuntimeForTest } from "./runtime";

// Ensure test environment
process.env.NODE_ENV = "test";
process.env.ALLOW_DEV_AUTH = "true";

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

describe("AI runtime service", () => {
  afterEach(() => {
    setAIRuntimeForTest(undefined);
  });

  it("setAIRuntimeForTest overrides the runtime", async () => {
    const fake = new FakeProvider();
    const runtime = new AIRuntime(fake);
    setAIRuntimeForTest(runtime);

    // Import dynamically to avoid circular issues
    const { getAIRuntime } = await import("./runtime");
    expect(getAIRuntime()).toBe(runtime);
  });

  it("setAIRuntimeForTest(null) returns null runtime", async () => {
    setAIRuntimeForTest(null);
    const { getAIRuntime } = await import("./runtime");
    expect(getAIRuntime()).toBeNull();
  });
});
