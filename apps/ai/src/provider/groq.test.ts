import { describe, it, expect } from "vitest";
import { GroqProvider, type GroqChatParams, type GroqClientLike } from "./groq";
import { AIError } from "./errors";

function createGroqClient(options?: {
  text?: string;
  streamTexts?: string[];
  toolCalls?: Array<{ id: string; name: string; arguments: string }>;
  finishReason?: string | null;
  fail?: Error;
  onCreate?: (params: GroqChatParams) => void;
}): GroqClientLike {
  return {
    chat: {
      completions: {
        async create(params) {
          options?.onCreate?.(params);
          if (options?.fail) throw options.fail;
          if (params.stream) {
            const chunks = options?.streamTexts ?? ["gr", "oq"];
            return (async function* () {
              for (const text of chunks) {
                yield { choices: [{ delta: { content: text } }] };
              }
            })();
          }
          return {
            choices: [
              {
                finish_reason: options?.finishReason ?? (options?.toolCalls ? "tool_calls" : "stop"),
                message: {
                  role: "assistant",
                  content: options?.text ?? "groq-ok",
                  tool_calls: options?.toolCalls?.map((call) => ({
                    id: call.id,
                    type: "function" as const,
                    function: { name: call.name, arguments: call.arguments },
                  })),
                },
              },
            ],
            usage: { prompt_tokens: 8, completion_tokens: 3 },
          };
        },
      },
    },
  };
}

describe("GroqProvider", () => {
  it("requires an API key", () => {
    expect(
      () => new GroqProvider({ model: "llama-3.3-70b-versatile", apiKey: "" }),
    ).toThrow(AIError);
  });

  it("requires a model", () => {
    expect(
      () => new GroqProvider({ model: "  ", apiKey: "key" }),
    ).toThrow(AIError);
  });

  it("generates using the configured model", async () => {
    let captured: GroqChatParams | undefined;
    const provider = new GroqProvider({
      model: "llama-3.3-70b-versatile",
      apiKey: "groq-secret",
      client: createGroqClient({
        text: "hello from groq",
        onCreate: (params) => {
          captured = params;
        },
      }),
    });

    const result = await provider.generate({
      messages: [
        { role: "system", content: "Be brief." },
        { role: "user", content: "Ping" },
      ],
      temperature: 0.2,
      maxOutputTokens: 128,
    });

    expect(result.provider).toBe("groq");
    expect(result.model).toBe("llama-3.3-70b-versatile");
    expect(result.text).toBe("hello from groq");
    expect(captured?.model).toBe("llama-3.3-70b-versatile");
    expect(captured?.max_tokens).toBe(128);
    expect(captured?.messages[0]).toEqual({ role: "system", content: "Be brief." });
  });

  it("streams chunks then a done marker", async () => {
    const provider = new GroqProvider({
      model: "llama-3.3-70b-versatile",
      apiKey: "groq-secret",
      client: createGroqClient({ streamTexts: ["x", "y"] }),
    });
    const chunks: string[] = [];
    let done = false;
    for await (const chunk of provider.generateStream({
      messages: [{ role: "user", content: "stream" }],
    })) {
      if (chunk.text) chunks.push(chunk.text);
      if (chunk.done) done = true;
    }
    expect(chunks).toEqual(["x", "y"]);
    expect(done).toBe(true);
  });

  it("handles empty stream", async () => {
    const provider = new GroqProvider({
      model: "llama-3.3-70b-versatile",
      apiKey: "groq-secret",
      client: createGroqClient({ streamTexts: [] }),
    });
    const chunks: string[] = [];
    let done = false;
    for await (const chunk of provider.generateStream({
      messages: [{ role: "user", content: "stream" }],
    })) {
      if (chunk.text) chunks.push(chunk.text);
      if (chunk.done) done = true;
    }
    expect(chunks).toEqual([]);
    expect(done).toBe(true);
  });

  it("handles null content in stream delta", async () => {
    const client: GroqClientLike = {
      chat: {
        completions: {
          async create() {
            return (async function* () {
              yield { choices: [{ delta: { content: null } }] };
              yield { choices: [{ delta: { content: "actual" } }] };
            })();
          },
        },
      },
    };
    const provider = new GroqProvider({
      model: "llama-3.3-70b-versatile",
      apiKey: "key",
      client,
    });
    const chunks: string[] = [];
    for await (const chunk of provider.generateStream({
      messages: [{ role: "user", content: "hi" }],
    })) {
      if (chunk.text) chunks.push(chunk.text);
    }
    expect(chunks).toEqual(["actual"]);
  });

  it("wraps stream errors as AIError", async () => {
    const provider = new GroqProvider({
      model: "llama-3.3-70b-versatile",
      apiKey: "groq-secret",
      client: createGroqClient({
        fail: Object.assign(new Error("stream failed"), { status: 500 }),
      }),
    });
    await expect(async () => {
      for await (const _chunk of provider.generateStream({
        messages: [{ role: "user", content: "hi" }],
      })) {
        /* consume */
      }
    }).rejects.toThrow(AIError);
  });

  it("maps native tool calls", async () => {
    const provider = new GroqProvider({
      model: "llama-3.3-70b-versatile",
      apiKey: "groq-secret",
      client: createGroqClient({
        text: "",
        toolCalls: [{ id: "tc1", name: "get_tasks", arguments: '{"status":"todo"}' }],
      }),
    });

    const result = await provider.generateWithTools(
      { messages: [{ role: "user", content: "list tasks" }] },
      [{ name: "get_tasks", description: "List tasks", inputSchema: { type: "object" } }],
    );

    expect(result.finishReason).toBe("tool_calls");
    expect(result.toolCalls).toEqual([
      { id: "tc1", name: "get_tasks", arguments: { status: "todo" } },
    ]);
  });

  it("generates without tool calls when tools array is empty", async () => {
    const provider = new GroqProvider({
      model: "llama-3.3-70b-versatile",
      apiKey: "groq-secret",
      client: createGroqClient({ text: "plain" }),
    });
    const result = await provider.generateWithTools(
      { messages: [{ role: "user", content: "hi" }] },
      [],
    );
    expect(result.toolCalls).toEqual([]);
    expect(result.text).toBe("plain");
  });

  it("handles malformed JSON in tool arguments", async () => {
    const provider = new GroqProvider({
      model: "llama-3.3-70b-versatile",
      apiKey: "groq-secret",
      client: createGroqClient({
        text: "",
        toolCalls: [{ id: "tc1", name: "foo", arguments: "not-json" }],
      }),
    });
    const result = await provider.generateWithTools(
      { messages: [{ role: "user", content: "test" }] },
      [{ name: "foo", description: "test", inputSchema: { type: "object" } }],
    );
    expect(result.toolCalls[0].arguments).toEqual({ raw: "not-json" });
  });

  it("handles empty tool arguments string", async () => {
    const provider = new GroqProvider({
      model: "llama-3.3-70b-versatile",
      apiKey: "groq-secret",
      client: createGroqClient({
        text: "",
        toolCalls: [{ id: "tc1", name: "foo", arguments: "" }],
      }),
    });
    const result = await provider.generateWithTools(
      { messages: [{ role: "user", content: "test" }] },
      [{ name: "foo", description: "test", inputSchema: { type: "object" } }],
    );
    expect(result.toolCalls[0].arguments).toEqual({});
  });

  it("handles array JSON in tool arguments", async () => {
    const provider = new GroqProvider({
      model: "llama-3.3-70b-versatile",
      apiKey: "groq-secret",
      client: createGroqClient({
        text: "",
        toolCalls: [{ id: "tc1", name: "foo", arguments: "[1,2,3]" }],
      }),
    });
    const result = await provider.generateWithTools(
      { messages: [{ role: "user", content: "test" }] },
      [{ name: "foo", description: "test", inputSchema: { type: "object" } }],
    );
    expect(result.toolCalls[0].arguments).toEqual({ value: [1, 2, 3] });
  });

  it("handles empty tool_calls array in response", async () => {
    const client: GroqClientLike = {
      chat: {
        completions: {
          async create() {
            return {
              choices: [{
                finish_reason: "stop",
                message: { role: "assistant", content: "no tools", tool_calls: [] },
              }],
            };
          },
        },
      },
    };
    const provider = new GroqProvider({
      model: "llama-3.3-70b-versatile",
      apiKey: "key",
      client,
    });
    const result = await provider.generateWithTools(
      { messages: [{ role: "user", content: "test" }] },
      [{ name: "tool", description: "test", inputSchema: { type: "object" } }],
    );
    expect(result.toolCalls).toEqual([]);
    expect(result.finishReason).toBe("stop");
  });

  describe("finish reason mapping", () => {
    it.each([
      ["stop", "stop"],
      ["length", "length"],
      ["max_tokens", "length"],
      ["tool_calls", "tool_calls"],
      ["function_call", "tool_calls"],
      ["content_filter", "content_filter"],
      [null, "stop"],
      [undefined, "stop"],
      ["unknown_value", "stop"],
    ] as const)("maps %s → %s", async (input, expected) => {
      const provider = new GroqProvider({
        model: "llama-3.3-70b-versatile",
        apiKey: "key",
        client: createGroqClient({ finishReason: input as string | null }),
      });
      const result = await provider.generate({
        messages: [{ role: "user", content: "hi" }],
      });
      expect(result.finishReason).toBe(expected);
    });
  });

  it("surfaces provider errors without leaking the API key", async () => {
    const provider = new GroqProvider({
      model: "llama-3.3-70b-versatile",
      apiKey: "gsk_live_secret",
      client: createGroqClient({
        fail: Object.assign(new Error("rate limited gsk_live_secret"), { status: 429 }),
      }),
    });

    await expect(
      provider.generate({ messages: [{ role: "user", content: "hi" }] }),
    ).rejects.toSatisfy((error: unknown) =>
      error instanceof AIError &&
      error.code === "rate_limit" &&
      !error.message.includes("gsk_live_secret"),
    );
  });
});
