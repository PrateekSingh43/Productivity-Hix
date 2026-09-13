import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createAIProvider } from "./factory";
import { GeminiProvider, type GeminiClientLike } from "./gemini";
import { GroqProvider, type GroqClientLike } from "./groq";
import { AIError } from "./errors";
import { loadAIConfig } from "../config/load";

const geminiClient: GeminiClientLike = {
  models: {
    async generateContent() {
      return { text: "g" };
    },
    async generateContentStream() {
      return (async function* () {})();
    },
  },
};

const groqClient: GroqClientLike = {
  chat: {
    completions: {
      async create() {
        return { choices: [{ message: { role: "assistant", content: "q" } }] };
      },
    },
  },
};

describe("createAIProvider", () => {
  it("creates a Gemini provider from configuration", () => {
    const provider = createAIProvider(
      {
        provider: "gemini",
        model: "gemini-2.5-flash",
        geminiApiKey: "k",
      },
      { geminiClient },
    );
    assert.equal(provider instanceof GeminiProvider, true);
    assert.equal(provider.name, "gemini");
    assert.equal(provider.model, "gemini-2.5-flash");
  });

  it("creates a Groq provider from configuration", () => {
    const provider = createAIProvider(
      {
        provider: "groq",
        model: "llama-3.1-8b-instant",
        groqApiKey: "k",
      },
      { groqClient },
    );
    assert.equal(provider instanceof GroqProvider, true);
    assert.equal(provider.name, "groq");
    assert.equal(provider.model, "llama-3.1-8b-instant");
  });

  it("switches provider when configuration changes", () => {
    const gemini = createAIProvider(loadAIConfig({
      AI_PROVIDER: "gemini",
      AI_MODEL: "gemini-2.5-flash",
      GEMINI_API_KEY: "gk",
    })!, { geminiClient, groqClient });
    const groq = createAIProvider(loadAIConfig({
      AI_PROVIDER: "groq",
      AI_MODEL: "llama-3.1-8b-instant",
      GROQ_API_KEY: "qk",
    })!, { geminiClient, groqClient });
    assert.equal(gemini.name, "gemini");
    assert.equal(groq.name, "groq");
  });

  it("fails when the selected provider is missing its API key", () => {
    assert.throws(
      () => createAIProvider({ provider: "gemini", model: "gemini-2.5-flash" }),
      (error: unknown) => error instanceof AIError && error.code === "config",
    );
    assert.throws(
      () => createAIProvider({ provider: "groq", model: "llama-3.1-8b-instant" }),
      (error: unknown) => error instanceof AIError && error.code === "config",
    );
  });
});
