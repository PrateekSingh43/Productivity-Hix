import { describe, it, expect } from "vitest";
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
    expect(provider).toBeInstanceOf(GeminiProvider);
    expect(provider.name).toBe("gemini");
    expect(provider.model).toBe("gemini-2.5-flash");
  });

  it("creates a Groq provider from configuration", () => {
    const provider = createAIProvider(
      {
        provider: "groq",
        model: "llama-3.3-70b-versatile",
        groqApiKey: "k",
      },
      { groqClient },
    );
    expect(provider).toBeInstanceOf(GroqProvider);
    expect(provider.name).toBe("groq");
    expect(provider.model).toBe("llama-3.3-70b-versatile");
  });

  it("switches provider when configuration changes", () => {
    const gemini = createAIProvider(loadAIConfig({
      AI_PROVIDER: "gemini",
      AI_MODEL: "gemini-2.5-flash",
      GEMINI_API_KEY: "gk",
    })!, { geminiClient, groqClient });
    const groq = createAIProvider(loadAIConfig({
      AI_PROVIDER: "groq",
      AI_MODEL: "llama-3.3-70b-versatile",
      GROQ_API_KEY: "qk",
    })!, { geminiClient, groqClient });
    expect(gemini.name).toBe("gemini");
    expect(groq.name).toBe("groq");
  });

  it("fails when the selected provider is missing its API key", () => {
    expect(
      () => createAIProvider({ provider: "gemini", model: "gemini-2.5-flash" }),
    ).toThrow(AIError);
    expect(
      () => createAIProvider({ provider: "groq", model: "llama-3.3-70b-versatile" }),
    ).toThrow(AIError);
  });

  it("both providers implement the same AIProvider interface methods", async () => {
    const gemini = createAIProvider(
      { provider: "gemini", model: "gemini-2.5-flash", geminiApiKey: "k" },
      { geminiClient },
    );
    const groq = createAIProvider(
      { provider: "groq", model: "llama-3.3-70b-versatile", groqApiKey: "k" },
      { groqClient },
    );

    // Both have the same interface methods
    for (const provider of [gemini, groq]) {
      expect(provider).toHaveProperty("name");
      expect(provider).toHaveProperty("model");
      expect(typeof provider.generate).toBe("function");
      expect(typeof provider.generateStream).toBe("function");
      expect(typeof provider.generateWithTools).toBe("function");
    }
  });
});
