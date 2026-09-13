import { GoogleGenAI } from "@google/genai";
import { AIError, wrapProviderError } from "./errors";
import { assertGenerateRequest, mapFinishReason, splitSystemMessages } from "./messages";
import type {
  AIProvider,
  GenerateRequest,
  GenerateResult,
  GenerateWithToolsResult,
  StreamChunk,
  ToolCallRequest,
  ToolDefinition,
} from "./types";

export type GeminiContent = {
  role: "user" | "model";
  parts: Array<{ text: string }>;
};

export type GeminiGenerateContentParams = {
  model: string;
  contents: GeminiContent[];
  config?: {
    systemInstruction?: string;
    temperature?: number;
    maxOutputTokens?: number;
    tools?: unknown[];
  };
};

export type GeminiGenerateContentResponse = {
  text?: string;
  functionCalls?: Array<{
    id?: string;
    name?: string;
    args?: Record<string, unknown>;
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
  };
  candidates?: Array<{ finishReason?: string }>;
};

export interface GeminiClientLike {
  models: {
    generateContent(params: GeminiGenerateContentParams): Promise<GeminiGenerateContentResponse>;
    generateContentStream(
      params: GeminiGenerateContentParams,
    ): Promise<AsyncIterable<Pick<GeminiGenerateContentResponse, "text">>>;
  };
}

export class GeminiProvider implements AIProvider {
  readonly name = "gemini" as const;
  readonly model: string;
  private readonly client: GeminiClientLike;
  private readonly apiKey: string;

  constructor(options: { model: string; apiKey: string; client?: GeminiClientLike }) {
    if (!options.apiKey.trim()) {
      throw new AIError("Gemini API key is missing", "config", 503, "gemini");
    }
    if (!options.model.trim()) {
      throw new AIError("AI_MODEL is required for Gemini", "config", 500, "gemini");
    }
    this.model = options.model;
    this.apiKey = options.apiKey;
    this.client = options.client ?? (new GoogleGenAI({ apiKey: options.apiKey }) as GeminiClientLike);
  }

  async generate(request: GenerateRequest): Promise<GenerateResult> {
    const params = this.buildParams(request);
    try {
      const response = await this.client.models.generateContent(params);
      return this.toGenerateResult(response);
    } catch (error) {
      throw wrapProviderError(error, "gemini", [this.apiKey]);
    }
  }

  async *generateStream(request: GenerateRequest): AsyncIterable<StreamChunk> {
    const params = this.buildParams(request);
    try {
      const stream = await this.client.models.generateContentStream(params);
      for await (const chunk of stream) {
        const text = chunk.text ?? "";
        if (text) {
          yield { text, done: false };
        }
      }
      yield { text: "", done: true };
    } catch (error) {
      throw wrapProviderError(error, "gemini", [this.apiKey]);
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

    const params = this.buildParams(request, tools);
    try {
      const response = await this.client.models.generateContent(params);
      const result = this.toGenerateResult(response);
      const toolCalls = this.toToolCalls(response);
      return {
        ...result,
        finishReason: toolCalls.length > 0 ? "tool_calls" : result.finishReason,
        toolCalls,
      };
    } catch (error) {
      throw wrapProviderError(error, "gemini", [this.apiKey]);
    }
  }

  private buildParams(request: GenerateRequest, tools?: ToolDefinition[]): GeminiGenerateContentParams {
    assertGenerateRequest(request, "gemini");
    const { systemInstruction, conversation } = splitSystemMessages(request.messages);
    const contents: GeminiContent[] = conversation.map((message) => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: message.content }],
    }));

    return {
      model: this.model,
      contents,
      config: {
        systemInstruction,
        temperature: request.temperature,
        maxOutputTokens: request.maxOutputTokens,
        tools:
          tools && tools.length > 0
            ? [
                {
                  functionDeclarations: tools.map((tool) => ({
                    name: tool.name,
                    description: tool.description,
                    parametersJsonSchema: tool.inputSchema,
                  })),
                },
              ]
            : undefined,
      },
    };
  }

  private toGenerateResult(response: GeminiGenerateContentResponse): GenerateResult {
    const text = response.text ?? "";
    const finishReason = mapFinishReason(response.candidates?.[0]?.finishReason);
    return {
      text,
      finishReason,
      provider: this.name,
      model: this.model,
      usage: {
        inputTokens: response.usageMetadata?.promptTokenCount,
        outputTokens: response.usageMetadata?.candidatesTokenCount,
      },
    };
  }

  private toToolCalls(response: GeminiGenerateContentResponse): ToolCallRequest[] {
    const calls = response.functionCalls ?? [];
    return calls
      .filter((call) => Boolean(call.name))
      .map((call, index) => ({
        id: call.id || `gemini_call_${index}`,
        name: call.name as string,
        arguments: call.args ?? {},
      }));
  }
}
