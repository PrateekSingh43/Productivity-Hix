import { describe, it, expect, afterEach } from "vitest";
import { AIRuntime, AIError, type AIProvider, type GenerateRequest } from "@repo/ai";
import {
  createAIRuntime,
  getAIConfigFromEnv,
  getAIGenerationPolicyFromEnv,
  getAIRuntime,
  setAIRuntimeForTest,
} from "./runtime";

// Ensure test environment
process.env.NODE_ENV = "test";
process.env.ALLOW_DEV_AUTH = "true";

class RecordingFakeProvider implements AIProvider {
  readonly name = "groq" as const;
  readonly model = "openai/gpt-oss-120b";
  lastRequest: GenerateRequest | null = null;

  async generate(request: GenerateRequest) {
    this.lastRequest = request;
    return {
      text: "response",
      finishReason: "stop" as const,
      provider: this.name,
      model: this.model,
      usage: { inputTokens: 1, outputTokens: 1 },
    };
  }

  async *generateStream(request: GenerateRequest) {
    this.lastRequest = request;
    yield { text: "chunk", done: false };
    yield { text: "", done: true };
  }

  async generateWithTools(request: GenerateRequest) {
    const result = await this.generate(request);
    return { ...result, toolCalls: [] };
  }
}

describe("AI runtime service & configuration wiring", () => {
  afterEach(() => {
    setAIRuntimeForTest(undefined);
  });

  it("setAIRuntimeForTest overrides the runtime", () => {
    const fake = new RecordingFakeProvider();
    const runtime = new AIRuntime(fake);
    setAIRuntimeForTest(runtime);

    expect(getAIRuntime()).toBe(runtime);
  });

  it("setAIRuntimeForTest(null) returns null runtime", () => {
    setAIRuntimeForTest(null);
    expect(getAIRuntime()).toBeNull();
  });

  describe("pure environment mappers", () => {
    it("maps environment to AIConfig cleanly", () => {
      const config = getAIConfigFromEnv({
        AI_PROVIDER: "groq",
        AI_MODEL: "openai/gpt-oss-120b",
        GROQ_API_KEY: "test-groq-key",
      });

      expect(config).toEqual({
        provider: "groq",
        model: "openai/gpt-oss-120b",
        geminiApiKey: undefined,
        groqApiKey: "test-groq-key",
      });
    });

    it("maps environment to AIGenerationPolicy with finite bounds", () => {
      const policy = getAIGenerationPolicyFromEnv({
        AI_TEMPERATURE: 1.1,
        AI_DEFAULT_MAX_OUTPUT_TOKENS: 2048,
        AI_MAX_OUTPUT_TOKENS: 4096,
      });

      expect(policy).toEqual({
        defaultTemperature: 1.1,
        defaultMaxOutputTokens: 2048,
        maxOutputTokens: 4096,
      });
    });

    it("enforces defaultMaxOutputTokens <= maxOutputTokens invariant in API mapper", () => {
      // default > max -> failure
      expect(() =>
        getAIGenerationPolicyFromEnv({
          AI_DEFAULT_MAX_OUTPUT_TOKENS: 9000,
          AI_MAX_OUTPUT_TOKENS: 4096,
        }),
      ).toThrow(AIError);

      // default == max -> valid
      const equalPolicy = getAIGenerationPolicyFromEnv({
        AI_DEFAULT_MAX_OUTPUT_TOKENS: 4096,
        AI_MAX_OUTPUT_TOKENS: 4096,
      });
      expect(equalPolicy.defaultMaxOutputTokens).toBe(4096);
      expect(equalPolicy.maxOutputTokens).toBe(4096);

      // default < max -> valid
      const lessPolicy = getAIGenerationPolicyFromEnv({
        AI_DEFAULT_MAX_OUTPUT_TOKENS: 4095,
        AI_MAX_OUTPUT_TOKENS: 4096,
      });
      expect(lessPolicy.defaultMaxOutputTokens).toBe(4095);
      expect(lessPolicy.maxOutputTokens).toBe(4096);
    });
  });

  describe("end-to-end API policy wiring proof", () => {
    it("proves the full chain: API env -> config mapper -> policy mapper -> createAIRuntime -> provider", async () => {
      const customEnv = {
        AI_PROVIDER: "groq",
        AI_MODEL: "openai/gpt-oss-120b",
        GROQ_API_KEY: "gsk_test12345",
        AI_TEMPERATURE: 1.1,
        AI_DEFAULT_MAX_OUTPUT_TOKENS: 2048,
        AI_MAX_OUTPUT_TOKENS: 4096,
      };

      const config = getAIConfigFromEnv(customEnv);
      const policy = getAIGenerationPolicyFromEnv(customEnv);
      const fakeProvider = new RecordingFakeProvider();

      const runtime = createAIRuntime(config!, policy, fakeProvider);

      // Test 1: Request omitting generation options receives environment defaults
      await runtime.generate({
        messages: [{ role: "user", content: "hello" }],
      });
      expect(fakeProvider.lastRequest).toEqual({
        messages: [{ role: "user", content: "hello" }],
        temperature: 1.1,
        maxOutputTokens: 2048,
      });

      // Test 2: Request options override defaults up to ceiling
      await runtime.generate({
        messages: [{ role: "user", content: "hello" }],
        temperature: 0.2,
        maxOutputTokens: 8000, // exceeds ceiling of 4096
      });
      expect(fakeProvider.lastRequest).toEqual({
        messages: [{ role: "user", content: "hello" }],
        temperature: 0.2,
        maxOutputTokens: 4096, // capped at ceiling
      });
    });
  });
});
