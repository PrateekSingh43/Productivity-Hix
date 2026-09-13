import Groq from "groq-sdk";
import { AIError, wrapProviderError } from "./errors";
import { assertGenerateRequest, mapFinishReason, splitSystemMessages } from "./messages";
import type {
  AIProvider,
  ChatMessage,
  GenerateRequest,
  GenerateResult,
  GenerateWithToolsResult,
  StreamChunk,
  ToolCallRequest,
  ToolDefinition,
} from "./types";

export type GroqChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
};

export type GroqChatCompletion = {
  choices?: Array<{
    finish_reason?: string | null;
    message?: GroqChatMessage;
    delta?: { content?: string | null };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
  };
};

export type GroqChatParams = {
  model: string;
  messages: GroqChatMessage[];
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
  tools?: unknown[];
};

export interface GroqClientLike {
  chat: {
    completions: {
      create(params: GroqChatParams): Promise<GroqChatCompletion | AsyncIterable<GroqChatCompletion>>;
    };
  };
}

export class GroqProvider implements AIProvider {
  readonly name = "groq" as const;
  readonly model: string;
  private readonly client: GroqClientLike;
  private readonly apiKey: string;

  constructor(options: { model: string; apiKey: string; client?: GroqClientLike }) {
    if (!options.apiKey.trim()) {
      throw new AIError("Groq API key is missing", "config", 503, "groq");
    }
    if (!options.model.trim()) {
      throw new AIError("AI_MODEL is required for Groq", "config", 500, "groq");
    }
    this.model = options.model;
    this.apiKey = options.apiKey;
    this.client =
      options.client ??
      (new Groq({
        apiKey: options.apiKey,
        maxRetries: 0,
      }) as unknown as GroqClientLike);
  }

  async generate(request: GenerateRequest): Promise<GenerateResult> {
    const params = this.buildParams(request, { stream: false });
    try {
      const response = (await this.client.chat.completions.create(params)) as GroqChatCompletion;
      return this.toGenerateResult(response);
    } catch (error) {
      throw wrapProviderError(error, "groq", [this.apiKey]);
    }
  }

  async *generateStream(request: GenerateRequest): AsyncIterable<StreamChunk> {
    const params = this.buildParams(request, { stream: true });
    try {
      const stream = (await this.client.chat.completions.create(
        params,
      )) as AsyncIterable<GroqChatCompletion>;
      for await (const chunk of stream) {
        const text = chunk.choices?.[0]?.delta?.content ?? "";
        if (text) {
          yield { text, done: false };
        }
      }
      yield { text: "", done: true };
    } catch (error) {
      throw wrapProviderError(error, "groq", [this.apiKey]);
    }
  }

  async generateWithTools(
    request: GenerateRequest,
    tools: ToolDefinition[],
  ): Promise<GenerateWithToolsResult> {
    if (tools.length === 0) {
      const result = await this.generate(request);
      return { ...result, toolCalls: [] };
    }

    const params = this.buildParams(request, {
      stream: false,
      tools: tools.map((tool) => ({
        type: "function",
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.inputSchema,
        },
      })),
    });

    try {
      const response = (await this.client.chat.completions.create(params)) as GroqChatCompletion;
      const result = this.toGenerateResult(response);
      const toolCalls = this.toToolCalls(response);
      return {
        ...result,
        finishReason: toolCalls.length > 0 ? "tool_calls" : result.finishReason,
        toolCalls,
      };
    } catch (error) {
      throw wrapProviderError(error, "groq", [this.apiKey]);
    }
  }

  private buildParams(
    request: GenerateRequest,
    extras: { stream: boolean; tools?: unknown[] },
  ): GroqChatParams {
    assertGenerateRequest(request, "groq");
    const { systemInstruction, conversation } = splitSystemMessages(request.messages);
    const messages: GroqChatMessage[] = [];
    if (systemInstruction) {
      messages.push({ role: "system", content: systemInstruction });
    }
    for (const message of conversation) {
      messages.push({ role: message.role, content: message.content });
    }

    return {
      model: this.model,
      messages,
      temperature: request.temperature,
      max_tokens: request.maxOutputTokens,
      stream: extras.stream,
      tools: extras.tools,
    };
  }

  private toGenerateResult(response: GroqChatCompletion): GenerateResult {
    const choice = response.choices?.[0];
    const text = choice?.message?.content ?? "";
    return {
      text,
      finishReason: mapFinishReason(choice?.finish_reason),
      provider: this.name,
      model: this.model,
      usage: {
        inputTokens: response.usage?.prompt_tokens,
        outputTokens: response.usage?.completion_tokens,
      },
    };
  }

  private toToolCalls(response: GroqChatCompletion): ToolCallRequest[] {
    const calls = response.choices?.[0]?.message?.tool_calls ?? [];
    return calls.map((call, index) => ({
      id: call.id || `groq_call_${index}`,
      name: call.function.name,
      arguments: parseToolArguments(call.function.arguments),
    }));
  }
}

function parseToolArguments(raw: string): Record<string, unknown> {
  if (!raw || raw.trim().length === 0) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return { value: parsed };
  } catch {
    return { raw };
  }
}

export function toGroqMessages(messages: ChatMessage[]): GroqChatMessage[] {
  return messages.map((message) => ({ role: message.role, content: message.content }));
}
