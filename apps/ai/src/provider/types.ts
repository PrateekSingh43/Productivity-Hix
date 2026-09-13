export type AIProviderName = "gemini" | "groq";

export type ChatRole = "system" | "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface GenerateRequest {
  messages: ChatMessage[];
  temperature?: number;
  maxOutputTokens?: number;
}

export interface TokenUsage {
  inputTokens?: number;
  outputTokens?: number;
}

export type FinishReason = "stop" | "length" | "tool_calls" | "content_filter";

export interface GenerateResult {
  text: string;
  finishReason: FinishReason;
  provider: AIProviderName;
  model: string;
  usage?: TokenUsage;
}

export interface StreamChunk {
  text: string;
  done: boolean;
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface ToolCallRequest {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface GenerateWithToolsResult extends GenerateResult {
  toolCalls: ToolCallRequest[];
}

export interface AIProvider {
  readonly name: AIProviderName;
  readonly model: string;
  generate(request: GenerateRequest): Promise<GenerateResult>;
  generateStream(request: GenerateRequest): AsyncIterable<StreamChunk>;
  generateWithTools(
    request: GenerateRequest,
    tools: ToolDefinition[],
  ): Promise<GenerateWithToolsResult>;
}

export interface AIConfig {
  provider: AIProviderName;
  model: string;
  geminiApiKey?: string;
  groqApiKey?: string;
  defaultTemperature?: number;
  defaultMaxOutputTokens?: number;
}

export interface AIGenerationPolicy {
  defaultTemperature: number;
  defaultMaxOutputTokens: number;
  maxOutputTokens: number;
}

