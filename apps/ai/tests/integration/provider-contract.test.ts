import { describe, it, expect } from "vitest";
import {
  GeminiProvider,
  GroqProvider,
  AIError,
  type AIProvider,
  type AIProviderName,
  type GenerateRequest,
  type ToolDefinition,
} from "../../src";
import type { GeminiClientLike } from "../../src/provider/gemini";
import type { GroqClientLike } from "../../src/provider/groq";

interface ProviderTestFixture {
  name: AIProviderName;
  model: string;
  createProvider(options?: {
    generateResponse?: unknown;
    streamChunks?: unknown[];
    generateError?: unknown;
  }): AIProvider;
}

const testTools: ToolDefinition[] = [
  {
    name: "lookup_info",
    description: "Look up testing info",
    inputSchema: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
    },
  },
];

const standardRequest: GenerateRequest = {
  messages: [{ role: "user", content: "test prompt" }],
};

const fixtures: ProviderTestFixture[] = [
  {
    name: "gemini",
    model: "gemini-2.5-flash",
    createProvider({ generateResponse, streamChunks, generateError } = {}) {
      const mockClient: GeminiClientLike = {
        models: {
          async generateContent() {
            if (generateError) throw generateError;
            return (
              (generateResponse as any) ?? {
                text: "contract-success",
                usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 24 },
                candidates: [{ finishReason: "STOP" }],
              }
            );
          },
          async generateContentStream() {
            if (generateError) throw generateError;
            const chunks = streamChunks ?? [{ text: "contract-" }, { text: "chunk" }];
            return (async function* () {
              for (const c of chunks) yield c as any;
            })();
          },
        },
      };
      return new GeminiProvider({
        model: "gemini-2.5-flash",
        apiKey: "fake-gemini-key",
        client: mockClient,
      });
    },
  },
  {
    name: "groq",
    model: "openai/gpt-oss-120b",
    createProvider({ generateResponse, streamChunks, generateError } = {}) {
      const mockClient: GroqClientLike = {
        chat: {
          completions: {
            async create(params) {
              if (generateError) throw generateError;
              if (params.stream) {
                const chunks = streamChunks ?? [
                  { choices: [{ delta: { content: "contract-" } }] },
                  { choices: [{ delta: { content: "chunk" } }] },
                ];
                return (async function* () {
                  for (const c of chunks) yield c as any;
                })();
              }
              return (
                (generateResponse as any) ?? {
                  choices: [
                    {
                      finish_reason: "stop",
                      message: { role: "assistant", content: "contract-success" },
                    },
                  ],
                  usage: { prompt_tokens: 12, completion_tokens: 24 },
                }
              );
            },
          },
        },
      };
      return new GroqProvider({
        model: "openai/gpt-oss-120b",
        apiKey: "fake-groq-key",
        client: mockClient,
      });
    },
  },
];

describe.each(fixtures)("Provider Contract: $name", ({ name, model, createProvider }) => {
  it("implements the AIProvider interface contract", () => {
    const provider = createProvider();
    expect(provider.name).toBe(name);
    expect(provider.model).toBe(model);
    expect(typeof provider.generate).toBe("function");
    expect(typeof provider.generateStream).toBe("function");
    expect(typeof provider.generateWithTools).toBe("function");
  });

  it("generate() returns canonical GenerateResult shape and normalized usage", async () => {
    const provider = createProvider();
    const result = await provider.generate(standardRequest);

    expect(result.text).toBe("contract-success");
    expect(result.finishReason).toBe("stop");
    expect(result.provider).toBe(name);
    expect(result.model).toBe(model);
    expect(result.usage).toEqual({ inputTokens: 12, outputTokens: 24 });
  });

  it("generateStream() emits canonical StreamChunk objects with final done=true", async () => {
    const provider = createProvider();
    const chunks: Array<{ text: string; done: boolean }> = [];

    for await (const chunk of provider.generateStream(standardRequest)) {
      chunks.push(chunk);
    }

    expect(chunks.length).toBeGreaterThanOrEqual(2);
    // Intermediate chunks have done: false
    expect(chunks[0]?.text).toBe("contract-");
    expect(chunks[0]?.done).toBe(false);

    // Final chunk has done: true
    const last = chunks.at(-1);
    expect(last?.done).toBe(true);

    const fullText = chunks.map((c) => c.text).join("");
    expect(fullText).toBe("contract-chunk");
  });

  it("generateWithTools() normalizes tool calls without execution", async () => {
    let provider: AIProvider;

    if (name === "gemini") {
      provider = createProvider({
        generateResponse: {
          candidates: [
            {
              finishReason: "STOP",
              content: {
                parts: [
                  {
                    functionCall: {
                      name: "lookup_info",
                      args: { query: "spaced repetition" },
                    },
                  },
                ],
              },
            },
          ],
        },
      });
    } else {
      provider = createProvider({
        generateResponse: {
          choices: [
            {
              finish_reason: "tool_calls",
              message: {
                role: "assistant",
                tool_calls: [
                  {
                    id: "call_groq_1",
                    type: "function",
                    function: {
                      name: "lookup_info",
                      arguments: JSON.stringify({ query: "spaced repetition" }),
                    },
                  },
                ],
              },
            },
          ],
        },
      });
    }

    const result = await provider.generateWithTools(standardRequest, testTools);

    expect(result.provider).toBe(name);
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0]?.name).toBe("lookup_info");
    expect(result.toolCalls[0]?.arguments).toEqual({ query: "spaced repetition" });
    expect(result.finishReason).toBe("tool_calls");
  });

  it("normalizes provider errors into AIError without leaking credentials", async () => {
    const secretKey = name === "gemini" ? "AIzaSySecretGemini12345" : "gsk_SecretGroqKey12345";

    const provider = createProvider({
      generateError: {
        status: 401,
        message: `Unauthorized request with token ${secretKey}`,
      },
    });

    await expect(provider.generate(standardRequest)).rejects.toThrow(AIError);

    try {
      await provider.generate(standardRequest);
    } catch (error) {
      expect(error).toBeInstanceOf(AIError);
      const aiError = error as AIError;
      expect(aiError.code).toBe("auth");
      expect(aiError.statusCode).toBe(401);
      expect(aiError.provider).toBe(name);
      expect(aiError.message).not.toContain(secretKey);
    }
  });

  it("normalizes rate limits (429) to rate_limit code", async () => {
    const provider = createProvider({
      generateError: { status: 429, message: "Too many requests" },
    });

    try {
      await provider.generate(standardRequest);
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(AIError);
      expect((error as AIError).code).toBe("rate_limit");
      expect((error as AIError).statusCode).toBe(429);
    }
  });

  it("normalizes 5xx provider failures to unavailable code", async () => {
    const provider = createProvider({
      generateError: { status: 503, message: "Backend service unavailable" },
    });

    try {
      await provider.generate(standardRequest);
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(AIError);
      expect((error as AIError).code).toBe("unavailable");
      expect((error as AIError).statusCode).toBe(503);
    }
  });
});
