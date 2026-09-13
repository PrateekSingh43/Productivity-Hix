import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { AIRuntime } from "./runtime";
import { createAIProvider } from "../provider/factory";
import { loadAIConfig } from "../config/load";
import { AIError } from "../provider/errors";
import type { GeminiClientLike } from "../provider/gemini";
import type { GroqClientLike } from "../provider/groq";
import type { GenerateRequest, GenerateResult } from "../provider/types";

const geminiClient: GeminiClientLike = {
  models: {
    async generateContent() {
      return {
        text: "gemini-path",
        usageMetadata: { promptTokenCount: 2, candidatesTokenCount: 2 },
        candidates: [{ finishReason: "STOP" }],
      };
    },
    async generateContentStream() {
      return (async function* () {
        yield { text: "gemini-stream" };
      })();
    },
  },
};

const groqClient: GroqClientLike = {
  chat: {
    completions: {
      async create(params) {
        if (params.stream) {
          return (async function* () {
            yield { choices: [{ delta: { content: "groq-stream" } }] };
          })();
        }
        return {
          choices: [{ finish_reason: "stop", message: { role: "assistant", content: "groq-path" } }],
        };
      },
    },
  },
};

function runtimeFor(env: Record<string, string>): AIRuntime {
  const config = loadAIConfig(env);
  assert.ok(config);
  return new AIRuntime(createAIProvider(config, { geminiClient, groqClient }));
}

async function collectStream(request: GenerateRequest, runtime: AIRuntime): Promise<string> {
  let text = "";
  for await (const chunk of runtime.generateStream(request)) {
    text += chunk.text;
  }
  return text;
}

describe("provider-agnostic generation path", () => {
  const request: GenerateRequest = { messages: [{ role: "user", content: "hello" }] };

  it("generates through Gemini when AI_PROVIDER=gemini", async () => {
    const runtime = runtimeFor({
      AI_PROVIDER: "gemini",
      AI_MODEL: "gemini-2.5-flash",
      GEMINI_API_KEY: "gk",
    });
    const result: GenerateResult = await runtime.generate(request);
    assert.equal(result.provider, "gemini");
    assert.equal(result.model, "gemini-2.5-flash");
    assert.equal(result.text, "gemini-path");
    assert.deepEqual(runtime.getProviderInfo(), { provider: "gemini", model: "gemini-2.5-flash" });
  });

  it("generates through Groq when AI_PROVIDER=groq", async () => {
    const runtime = runtimeFor({
      AI_PROVIDER: "groq",
      AI_MODEL: "llama-3.1-8b-instant",
      GROQ_API_KEY: "qk",
    });
    const result = await runtime.generate(request);
    assert.equal(result.provider, "groq");
    assert.equal(result.text, "groq-path");
  });

  it("switches providers without runtime branching on provider name", async () => {
    const geminiRuntime = runtimeFor({
      AI_PROVIDER: "gemini",
      GEMINI_API_KEY: "gk",
    });
    const groqRuntime = runtimeFor({
      AI_PROVIDER: "groq",
      GROQ_API_KEY: "qk",
    });
    const gemini = await geminiRuntime.generate(request);
    const groq = await groqRuntime.generate(request);
    assert.equal(gemini.provider, "gemini");
    assert.equal(groq.provider, "groq");
    assert.equal(await collectStream(request, geminiRuntime), "gemini-stream");
    assert.equal(await collectStream(request, groqRuntime), "groq-stream");
  });

  it("surfaces configuration errors before any generation", () => {
    const config = loadAIConfig({
      AI_PROVIDER: "gemini",
      AI_MODEL: "gemini-2.5-flash",
    });
    assert.ok(config);
    assert.throws(
      () => createAIProvider(config),
      (error: unknown) =>
        error instanceof AIError &&
        error.code === "config" &&
        error.message === "Gemini API key is missing",
    );
  });
});
