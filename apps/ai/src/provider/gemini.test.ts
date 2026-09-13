import { describe, it, expect } from "vitest";
import { GeminiProvider, type GeminiClientLike, type GeminiGenerateContentParams } from "./gemini";
import { AIError } from "./errors";

function createGeminiClient(options?: {
  text?: string;
  streamTexts?: string[];
  functionCalls?: Array<{ id?: string; name?: string; args?: Record<string, unknown> }>;
  finishReason?: string;
  fail?: Error;
  onGenerate?: (params: GeminiGenerateContentParams) => void;
}): GeminiClientLike {
  return {
    models: {
      async generateContent(params) {
        options?.onGenerate?.(params);
        if (options?.fail) throw options.fail;
        return {
          text: options?.text ?? "gemini-ok",
          functionCalls: options?.functionCalls,
          usageMetadata: { promptTokenCount: 11, candidatesTokenCount: 4 },
          candidates: [{ finishReason: options?.finishReason ?? "STOP" }],
        };
      },
      async generateContentStream() {
        if (options?.fail) throw options.fail;
        const chunks = options?.streamTexts ?? ["gem", "ini"];
        return (async function* () {
          for (const text of chunks) {
            yield { text };
          }
        })();
      },
    },
  };
}

describe("GeminiProvider", () => {
  it("requires an API key", () => {
    expect(
      () => new GeminiProvider({ model: "gemini-2.5-flash", apiKey: "  " }),
    ).toThrow(AIError);
  });

  it("requires a model", () => {
    expect(
      () => new GeminiProvider({ model: "  ", apiKey: "key" }),
    ).toThrow(AIError);
  });

  it("generates using the configured model and maps the response", async () => {
    let captured: GeminiGenerateContentParams | undefined;
    const provider = new GeminiProvider({
      model: "gemini-2.5-flash",
      apiKey: "gemini-secret",
      client: createGeminiClient({
        text: "hello from gemini",
        onGenerate: (params) => {
          captured = params;
        },
      }),
    });

    const result = await provider.generate({
      messages: [
        { role: "system", content: "Be brief." },
        { role: "user", content: "Ping" },
      ],
    });

    expect(result.provider).toBe("gemini");
    expect(result.model).toBe("gemini-2.5-flash");
    expect(result.text).toBe("hello from gemini");
    expect(result.finishReason).toBe("stop");
    expect(result.usage?.inputTokens).toBe(11);
    expect(captured?.model).toBe("gemini-2.5-flash");
    expect(captured?.config?.systemInstruction).toBe("Be brief.");
    expect(captured?.contents).toEqual([{ role: "user", parts: [{ text: "Ping" }] }]);
  });

  it("streams chunks then a done marker", async () => {
    const provider = new GeminiProvider({
      model: "gemini-2.5-flash",
      apiKey: "gemini-secret",
      client: createGeminiClient({ streamTexts: ["a", "b"] }),
    });
    const chunks: string[] = [];
    let done = false;
    for await (const chunk of provider.generateStream({
      messages: [{ role: "user", content: "stream" }],
    })) {
      if (chunk.text) chunks.push(chunk.text);
      if (chunk.done) done = true;
    }
    expect(chunks).toEqual(["a", "b"]);
    expect(done).toBe(true);
  });

  it("handles empty stream", async () => {
    const provider = new GeminiProvider({
      model: "gemini-2.5-flash",
      apiKey: "gemini-secret",
      client: createGeminiClient({ streamTexts: [] }),
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

  it("handles single chunk stream", async () => {
    const provider = new GeminiProvider({
      model: "gemini-2.5-flash",
      apiKey: "gemini-secret",
      client: createGeminiClient({ streamTexts: ["only"] }),
    });
    const chunks: string[] = [];
    for await (const chunk of provider.generateStream({
      messages: [{ role: "user", content: "stream" }],
    })) {
      if (chunk.text) chunks.push(chunk.text);
    }
    expect(chunks).toEqual(["only"]);
  });

  it("wraps stream errors as AIError", async () => {
    const provider = new GeminiProvider({
      model: "gemini-2.5-flash",
      apiKey: "gemini-secret",
      client: createGeminiClient({
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

  it("maps native tool declarations and tool calls", async () => {
    let captured: GeminiGenerateContentParams | undefined;
    const provider = new GeminiProvider({
      model: "gemini-2.5-flash",
      apiKey: "gemini-secret",
      client: createGeminiClient({
        text: "",
        functionCalls: [{ id: "c1", name: "get_today", args: { date: "2026-09-14" } }],
        onGenerate: (params) => {
          captured = params;
        },
      }),
    });

    const result = await provider.generateWithTools(
      { messages: [{ role: "user", content: "What did I do today?" }] },
      [
        {
          name: "get_today",
          description: "Read today's plan",
          inputSchema: { type: "object", properties: { date: { type: "string" } } },
        },
      ],
    );

    expect(result.finishReason).toBe("tool_calls");
    expect(result.toolCalls).toEqual([
      { id: "c1", name: "get_today", arguments: { date: "2026-09-14" } },
    ]);
    const declarations = (
      captured?.config?.tools as Array<{ functionDeclarations: Array<{ name: string }> }>
    )?.[0]?.functionDeclarations;
    expect(declarations?.[0]?.name).toBe("get_today");
  });

  it("generates without tool calls when tools array is empty", async () => {
    const provider = new GeminiProvider({
      model: "gemini-2.5-flash",
      apiKey: "gemini-secret",
      client: createGeminiClient({ text: "plain response" }),
    });
    const result = await provider.generateWithTools(
      { messages: [{ role: "user", content: "hi" }] },
      [],
    );
    expect(result.toolCalls).toEqual([]);
    expect(result.text).toBe("plain response");
  });

  it("normalizes tool calls with missing id", async () => {
    const provider = new GeminiProvider({
      model: "gemini-2.5-flash",
      apiKey: "gemini-secret",
      client: createGeminiClient({
        text: "",
        functionCalls: [{ name: "foo", args: {} }],
      }),
    });
    const result = await provider.generateWithTools(
      { messages: [{ role: "user", content: "test" }] },
      [{ name: "foo", description: "test", inputSchema: { type: "object" } }],
    );
    expect(result.toolCalls[0].id).toBe("gemini_call_0");
    expect(result.toolCalls[0].name).toBe("foo");
  });

  it("normalizes tool calls with missing args", async () => {
    const provider = new GeminiProvider({
      model: "gemini-2.5-flash",
      apiKey: "gemini-secret",
      client: createGeminiClient({
        text: "",
        functionCalls: [{ id: "c1", name: "no_args" }],
      }),
    });
    const result = await provider.generateWithTools(
      { messages: [{ role: "user", content: "test" }] },
      [{ name: "no_args", description: "test", inputSchema: { type: "object" } }],
    );
    expect(result.toolCalls[0].arguments).toEqual({});
  });

  it("filters out tool calls with missing name", async () => {
    const provider = new GeminiProvider({
      model: "gemini-2.5-flash",
      apiKey: "gemini-secret",
      client: createGeminiClient({
        text: "",
        functionCalls: [{ id: "c1" }, { id: "c2", name: "valid", args: {} }],
      }),
    });
    const result = await provider.generateWithTools(
      { messages: [{ role: "user", content: "test" }] },
      [{ name: "valid", description: "test", inputSchema: { type: "object" } }],
    );
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0].name).toBe("valid");
  });

  it("handles empty function calls list", async () => {
    const provider = new GeminiProvider({
      model: "gemini-2.5-flash",
      apiKey: "gemini-secret",
      client: createGeminiClient({
        text: "no tools used",
        functionCalls: [],
      }),
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
      ["STOP", "stop"],
      ["MAX_TOKENS", "length"],
      ["SAFETY", "content_filter"],
      ["FUNCTION_CALL", "tool_calls"],
      [undefined, "stop"],
      [null, "stop"],
      ["UNKNOWN_VALUE", "stop"],
    ] as const)("maps %s → %s", async (input, expected) => {
      const provider = new GeminiProvider({
        model: "gemini-2.5-flash",
        apiKey: "key",
        client: createGeminiClient({ finishReason: input as string }),
      });
      const result = await provider.generate({
        messages: [{ role: "user", content: "hi" }],
      });
      expect(result.finishReason).toBe(expected);
    });
  });

  it("surfaces provider errors without leaking the API key", async () => {
    const provider = new GeminiProvider({
      model: "gemini-2.5-flash",
      apiKey: "gemini-secret-key",
      client: createGeminiClient({
        fail: Object.assign(new Error("auth failed gemini-secret-key"), { status: 401 }),
      }),
    });

    await expect(
      provider.generate({ messages: [{ role: "user", content: "hi" }] }),
    ).rejects.toSatisfy((error: unknown) =>
      error instanceof AIError &&
      error.code === "auth" &&
      !error.message.includes("gemini-secret-key"),
    );
  });
});
