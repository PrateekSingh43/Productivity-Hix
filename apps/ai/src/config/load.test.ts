import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_MODELS, loadAIConfig } from "./load";
import { generateRequestSchema } from "./schema";
import { AIError } from "../provider/errors";

describe("loadAIConfig", () => {
  it("returns null when AI_PROVIDER is unset", () => {
    assert.equal(loadAIConfig({}), null);
    assert.equal(loadAIConfig({ AI_PROVIDER: "  " }), null);
  });

  it("loads gemini configuration and uses the configured model", () => {
    const config = loadAIConfig({
      AI_PROVIDER: "gemini",
      AI_MODEL: "gemini-2.5-flash-lite",
      GEMINI_API_KEY: "secret-gemini",
    });
    assert.deepEqual(config, {
      provider: "gemini",
      model: "gemini-2.5-flash-lite",
      geminiApiKey: "secret-gemini",
      groqApiKey: undefined,
    });
  });

  it("accepts GEMINI_KEY as an alias and default model from configuration", () => {
    const config = loadAIConfig({
      AI_PROVIDER: "GEMINI",
      GEMINI_KEY: "alias-key",
    });
    assert.equal(config?.provider, "gemini");
    assert.equal(config?.model, DEFAULT_MODELS.gemini);
    assert.equal(config?.geminiApiKey, "alias-key");
  });

  it("loads groq configuration", () => {
    const config = loadAIConfig({
      AI_PROVIDER: "groq",
      AI_MODEL: "llama-3.1-8b-instant",
      GROQ_API_KEY: "secret-groq",
    });
    assert.equal(config?.provider, "groq");
    assert.equal(config?.model, "llama-3.1-8b-instant");
    assert.equal(config?.groqApiKey, "secret-groq");
  });

  it("rejects unknown providers", () => {
    assert.throws(
      () => loadAIConfig({ AI_PROVIDER: "openai" }),
      (error: unknown) => error instanceof AIError && error.code === "config",
    );
  });
});

describe("generateRequestSchema", () => {
  it("accepts a prompt shorthand", () => {
    const parsed = generateRequestSchema.parse({ prompt: "Hello" });
    assert.deepEqual(parsed.messages, [{ role: "user", content: "Hello" }]);
  });

  it("accepts conversation messages", () => {
    const parsed = generateRequestSchema.parse({
      messages: [
        { role: "system", content: "Be concise." },
        { role: "user", content: "Status?" },
      ],
    });
    assert.equal(parsed.messages.length, 2);
  });

  it("rejects an empty payload", () => {
    assert.throws(() => generateRequestSchema.parse({}));
  });
});
