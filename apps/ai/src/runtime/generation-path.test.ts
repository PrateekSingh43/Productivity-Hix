import { describe, it, expect } from "vitest";
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
  expect(config).toBeTruthy();
  return new AIRuntime(createAIProvider(config!, { geminiClient, groqClient }));
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
    expect(result.provider).toBe("gemini");
    expect(result.model).toBe("gemini-2.5-flash");
    expect(result.text).toBe("gemini-path");
    expect(runtime.getProviderInfo()).toEqual({ provider: "gemini", model: "gemini-2.5-flash" });
  });

  it("generates through Groq when AI_PROVIDER=groq", async () => {
    const runtime = runtimeFor({
      AI_PROVIDER: "groq",
      AI_MODEL: "openai/gpt-oss-120b",
      GROQ_API_KEY: "qk",
    });
    const result = await runtime.generate(request);
    expect(result.provider).toBe("groq");
    expect(result.text).toBe("groq-path");
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
    expect(gemini.provider).toBe("gemini");
    expect(groq.provider).toBe("groq");
    expect(await collectStream(request, geminiRuntime)).toBe("gemini-stream");
    expect(await collectStream(request, groqRuntime)).toBe("groq-stream");
  });

  it("surfaces configuration errors before any generation", () => {
    const config = loadAIConfig({
      AI_PROVIDER: "gemini",
      AI_MODEL: "gemini-2.5-flash",
    });
    expect(config).toBeTruthy();
    expect(
      () => createAIProvider(config!),
    ).toThrow(AIError);
  });

  it("enforces generation policy: applies defaults and hard ceilings", async () => {
    let capturedParams: any = null;
    const recordingGroqClient: GroqClientLike = {
      chat: {
        completions: {
          async create(params) {
            capturedParams = params;
            return {
              choices: [{ finish_reason: "stop", message: { role: "assistant", content: "ok" } }],
            };
          },
        },
      },
    };

    const provider = createAIProvider(
      { provider: "groq", model: "openai/gpt-oss-120b", groqApiKey: "key" },
      { groqClient: recordingGroqClient },
    );

    const runtime = new AIRuntime(provider, {
      defaultTemperature: 0.5,
      defaultMaxOutputTokens: 2000,
      maxOutputTokens: 4000,
    });

    // 1. Omitted values get policy defaults
    await runtime.generate({ messages: [{ role: "user", content: "hi" }] });
    expect(capturedParams.temperature).toBe(0.5);
    expect(capturedParams.max_tokens).toBe(2000);

    // 2. Values exceeding maxOutputTokens are capped
    await runtime.generate({
      messages: [{ role: "user", content: "hi" }],
      maxOutputTokens: 50000,
      temperature: 3.5, // defensive runtime clamp
    });
    expect(capturedParams.max_tokens).toBe(4000);
    expect(capturedParams.temperature).toBe(2);
  });

  it("enforces policy invariants in AIRuntime constructor", () => {
    const fakeProvider = createAIProvider(
      { provider: "gemini", model: "gemini-2.5-flash", geminiApiKey: "k" },
      { geminiClient },
    );

    // defaultMaxOutputTokens > maxOutputTokens rejected
    expect(
      () =>
        new AIRuntime(fakeProvider, {
          defaultMaxOutputTokens: 9000,
          maxOutputTokens: 4000,
        }),
    ).toThrow(AIError);

    // Invalid temperatures rejected
    expect(() => new AIRuntime(fakeProvider, { defaultTemperature: 3.0 })).toThrow(AIError);
    expect(() => new AIRuntime(fakeProvider, { defaultTemperature: -0.5 })).toThrow(AIError);
    expect(() => new AIRuntime(fakeProvider, { defaultTemperature: NaN })).toThrow(AIError);
    expect(() => new AIRuntime(fakeProvider, { defaultTemperature: Infinity })).toThrow(AIError);

    // Non-integer / non-positive tokens rejected
    expect(() => new AIRuntime(fakeProvider, { defaultMaxOutputTokens: 0 })).toThrow(AIError);
    expect(() => new AIRuntime(fakeProvider, { maxOutputTokens: 12.5 })).toThrow(AIError);
  });
});

