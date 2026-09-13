import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { GroqProvider, type GroqChatParams, type GroqClientLike } from "./groq";
import { AIError } from "./errors";

function createGroqClient(options?: {
  text?: string;
  streamTexts?: string[];
  toolCalls?: Array<{ id: string; name: string; arguments: string }>;
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
                finish_reason: options?.toolCalls ? "tool_calls" : "stop",
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
    assert.throws(
      () => new GroqProvider({ model: "llama-3.1-8b-instant", apiKey: "" }),
      (error: unknown) => error instanceof AIError && error.code === "config",
    );
  });

  it("generates using the configured model", async () => {
    let captured: GroqChatParams | undefined;
    const provider = new GroqProvider({
      model: "llama-3.1-8b-instant",
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

    assert.equal(result.provider, "groq");
    assert.equal(result.model, "llama-3.1-8b-instant");
    assert.equal(result.text, "hello from groq");
    assert.equal(captured?.model, "llama-3.1-8b-instant");
    assert.equal(captured?.max_tokens, 128);
    assert.deepEqual(captured?.messages[0], { role: "system", content: "Be brief." });
  });

  it("streams chunks then a done marker", async () => {
    const provider = new GroqProvider({
      model: "llama-3.1-8b-instant",
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
    assert.deepEqual(chunks, ["x", "y"]);
    assert.equal(done, true);
  });

  it("maps native tool calls", async () => {
    const provider = new GroqProvider({
      model: "llama-3.1-8b-instant",
      apiKey: "groq-secret",
      client: createGroqClient({
        text: "",
        toolCalls: [{ id: "tc1", name: "get_tasks", arguments: "{\"status\":\"todo\"}" }],
      }),
    });

    const result = await provider.generateWithTools(
      { messages: [{ role: "user", content: "list tasks" }] },
      [{ name: "get_tasks", description: "List tasks", inputSchema: { type: "object" } }],
    );

    assert.equal(result.finishReason, "tool_calls");
    assert.deepEqual(result.toolCalls, [
      { id: "tc1", name: "get_tasks", arguments: { status: "todo" } },
    ]);
  });

  it("surfaces provider errors without leaking the API key", async () => {
    const provider = new GroqProvider({
      model: "llama-3.1-8b-instant",
      apiKey: "gsk_live_secret",
      client: createGroqClient({
        fail: Object.assign(new Error("rate limited gsk_live_secret"), { status: 429 }),
      }),
    });

    await assert.rejects(
      () => provider.generate({ messages: [{ role: "user", content: "hi" }] }),
      (error: unknown) =>
        error instanceof AIError &&
        error.code === "rate_limit" &&
        !error.message.includes("gsk_live_secret"),
    );
  });
});
