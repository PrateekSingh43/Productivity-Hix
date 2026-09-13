import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { GeminiProvider, type GeminiClientLike, type GeminiGenerateContentParams } from "./gemini";
import { AIError } from "./errors";

function createGeminiClient(options?: {
  text?: string;
  streamTexts?: string[];
  functionCalls?: Array<{ id?: string; name: string; args?: Record<string, unknown> }>;
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
          candidates: [{ finishReason: "STOP" }],
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
    assert.throws(
      () => new GeminiProvider({ model: "gemini-2.5-flash", apiKey: "  " }),
      (error: unknown) => error instanceof AIError && error.code === "config",
    );
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

    assert.equal(result.provider, "gemini");
    assert.equal(result.model, "gemini-2.5-flash");
    assert.equal(result.text, "hello from gemini");
    assert.equal(result.finishReason, "stop");
    assert.equal(result.usage?.inputTokens, 11);
    assert.equal(captured?.model, "gemini-2.5-flash");
    assert.equal(captured?.config?.systemInstruction, "Be brief.");
    assert.deepEqual(captured?.contents, [{ role: "user", parts: [{ text: "Ping" }] }]);
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
    assert.deepEqual(chunks, ["a", "b"]);
    assert.equal(done, true);
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

    assert.equal(result.finishReason, "tool_calls");
    assert.deepEqual(result.toolCalls, [
      { id: "c1", name: "get_today", arguments: { date: "2026-09-14" } },
    ]);
    const declarations = (
      captured?.config?.tools as Array<{ functionDeclarations: Array<{ name: string }> }>
    )?.[0]?.functionDeclarations;
    assert.equal(declarations?.[0]?.name, "get_today");
  });

  it("surfaces provider errors without leaking the API key", async () => {
    const provider = new GeminiProvider({
      model: "gemini-2.5-flash",
      apiKey: "gemini-secret-key",
      client: createGeminiClient({
        fail: Object.assign(new Error("auth failed gemini-secret-key"), { status: 401 }),
      }),
    });

    await assert.rejects(
      () => provider.generate({ messages: [{ role: "user", content: "hi" }] }),
      (error: unknown) =>
        error instanceof AIError &&
        error.code === "auth" &&
        !error.message.includes("gemini-secret-key"),
    );
  });
});
