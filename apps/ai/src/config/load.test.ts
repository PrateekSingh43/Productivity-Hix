import { describe, it, expect } from "vitest";
import { DEFAULT_MODELS, loadAIConfig, loadAIGenerationPolicy } from "./load";
import { generateRequestSchema } from "./schema";
import { AIError } from "../provider/errors";

describe("loadAIConfig", () => {
  it("returns null when AI_PROVIDER is unset", () => {
    expect(loadAIConfig({})).toBeNull();
    expect(loadAIConfig({ AI_PROVIDER: "  " })).toBeNull();
  });

  it("loads gemini configuration and uses the configured model", () => {
    const config = loadAIConfig({
      AI_PROVIDER: "gemini",
      AI_MODEL: "gemini-2.5-flash-lite",
      GEMINI_API_KEY: "secret-gemini",
    });
    expect(config).toEqual({
      provider: "gemini",
      model: "gemini-2.5-flash-lite",
      geminiApiKey: "secret-gemini",
      groqApiKey: undefined,
    });
  });

  it("uses the default model when AI_MODEL is omitted", () => {
    const config = loadAIConfig({
      AI_PROVIDER: "gemini",
      GEMINI_API_KEY: "key",
    });
    expect(config?.model).toBe(DEFAULT_MODELS.gemini);
  });

  it("does not accept GEMINI_KEY as an alias for GEMINI_API_KEY", () => {
    const config = loadAIConfig({
      AI_PROVIDER: "gemini",
      GEMINI_KEY: "alias-key",
    });
    expect(config?.geminiApiKey).toBeUndefined();
  });

  it("loads groq configuration", () => {
    const config = loadAIConfig({
      AI_PROVIDER: "groq",
      AI_MODEL: "llama-3.1-8b-instant",
      GROQ_API_KEY: "secret-groq",
    });
    expect(config?.provider).toBe("groq");
    expect(config?.model).toBe("llama-3.1-8b-instant");
    expect(config?.groqApiKey).toBe("secret-groq");
  });

  it("uses the correct default model for groq", () => {
    const config = loadAIConfig({
      AI_PROVIDER: "groq",
      GROQ_API_KEY: "key",
    });
    expect(config?.model).toBe("openai/gpt-oss-120b");
  });

  it("rejects unknown providers", () => {
    expect(() => loadAIConfig({ AI_PROVIDER: "openai" })).toThrow(AIError);
    try {
      loadAIConfig({ AI_PROVIDER: "openai" });
    } catch (error) {
      expect(error).toBeInstanceOf(AIError);
      expect((error as AIError).code).toBe("config");
    }
  });
});

describe("loadAIGenerationPolicy", () => {
  it("provides sensible defaults when environment is empty", () => {
    const policy = loadAIGenerationPolicy({});
    expect(policy).toEqual({
      defaultTemperature: 0.7,
      defaultMaxOutputTokens: 4096,
      maxOutputTokens: 8192,
    });
  });

  it("loads configured limits from environment", () => {
    const policy = loadAIGenerationPolicy({
      AI_TEMPERATURE: "1.2",
      AI_DEFAULT_MAX_OUTPUT_TOKENS: "2048",
      AI_MAX_OUTPUT_TOKENS: "4096",
    });
    expect(policy).toEqual({
      defaultTemperature: 1.2,
      defaultMaxOutputTokens: 2048,
      maxOutputTokens: 4096,
    });
  });

  it("rejects out-of-range temperature", () => {
    expect(() => loadAIGenerationPolicy({ AI_TEMPERATURE: "2.5" })).toThrow(AIError);
    expect(() => loadAIGenerationPolicy({ AI_TEMPERATURE: "-0.1" })).toThrow(AIError);
    expect(() => loadAIGenerationPolicy({ AI_TEMPERATURE: "invalid" })).toThrow(AIError);
    expect(() => loadAIGenerationPolicy({ AI_TEMPERATURE: "Infinity" })).toThrow(AIError);
    expect(() => loadAIGenerationPolicy({ AI_TEMPERATURE: "-Infinity" })).toThrow(AIError);
    expect(() => loadAIGenerationPolicy({ AI_TEMPERATURE: "NaN" })).toThrow(AIError);
  });

  it("rejects non-positive and non-integer max output tokens", () => {
    expect(() => loadAIGenerationPolicy({ AI_MAX_OUTPUT_TOKENS: "0" })).toThrow(AIError);
    expect(() => loadAIGenerationPolicy({ AI_MAX_OUTPUT_TOKENS: "-10" })).toThrow(AIError);
    expect(() => loadAIGenerationPolicy({ AI_MAX_OUTPUT_TOKENS: "abc" })).toThrow(AIError);
    expect(() => loadAIGenerationPolicy({ AI_MAX_OUTPUT_TOKENS: "12.5" })).toThrow(AIError);
    expect(() => loadAIGenerationPolicy({ AI_MAX_OUTPUT_TOKENS: "Infinity" })).toThrow(AIError);
  });

  it("rejects non-positive and non-integer default output tokens", () => {
    expect(() => loadAIGenerationPolicy({ AI_DEFAULT_MAX_OUTPUT_TOKENS: "0" })).toThrow(AIError);
    expect(() => loadAIGenerationPolicy({ AI_DEFAULT_MAX_OUTPUT_TOKENS: "-5" })).toThrow(AIError);
    expect(() => loadAIGenerationPolicy({ AI_DEFAULT_MAX_OUTPUT_TOKENS: "3.14" })).toThrow(AIError);
    expect(() => loadAIGenerationPolicy({ AI_DEFAULT_MAX_OUTPUT_TOKENS: "Infinity" })).toThrow(AIError);
  });

  it("enforces defaultMaxOutputTokens <= maxOutputTokens invariant", () => {
    // default > max -> failure
    expect(() =>
      loadAIGenerationPolicy({
        AI_DEFAULT_MAX_OUTPUT_TOKENS: "9000",
        AI_MAX_OUTPUT_TOKENS: "8192",
      }),
    ).toThrow(AIError);

    // default == max -> valid
    const equalPolicy = loadAIGenerationPolicy({
      AI_DEFAULT_MAX_OUTPUT_TOKENS: "8192",
      AI_MAX_OUTPUT_TOKENS: "8192",
    });
    expect(equalPolicy.defaultMaxOutputTokens).toBe(8192);
    expect(equalPolicy.maxOutputTokens).toBe(8192);

    // default < max -> valid
    const lessPolicy = loadAIGenerationPolicy({
      AI_DEFAULT_MAX_OUTPUT_TOKENS: "8191",
      AI_MAX_OUTPUT_TOKENS: "8192",
    });
    expect(lessPolicy.defaultMaxOutputTokens).toBe(8191);
    expect(lessPolicy.maxOutputTokens).toBe(8192);
  });
});

describe("generateRequestSchema", () => {
  it("accepts a prompt shorthand", () => {
    const parsed = generateRequestSchema.parse({ prompt: "Hello" });
    expect(parsed.messages).toEqual([{ role: "user", content: "Hello" }]);
  });

  it("accepts conversation messages", () => {
    const parsed = generateRequestSchema.parse({
      messages: [
        { role: "system", content: "Be concise." },
        { role: "user", content: "Status?" },
      ],
    });
    expect(parsed.messages).toHaveLength(2);
  });

  it("rejects an empty payload", () => {
    expect(() => generateRequestSchema.parse({})).toThrow();
  });
});
