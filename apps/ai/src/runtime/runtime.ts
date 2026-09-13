import type {
  AIProvider,
  GenerateRequest,
  GenerateResult,
  GenerateWithToolsResult,
  StreamChunk,
  ToolDefinition,
} from "../provider/types";

/**
 * Thin provider-agnostic generation runtime.
 * Phase 1 does not include a tool registry or multi-step agent loop.
 */
export class AIRuntime {
  constructor(private readonly provider: AIProvider) {}

  getProviderInfo(): { provider: AIProvider["name"]; model: string } {
    return {
      provider: this.provider.name,
      model: this.provider.model,
    };
  }

  generate(request: GenerateRequest): Promise<GenerateResult> {
    return this.provider.generate(request);
  }

  generateStream(request: GenerateRequest): AsyncIterable<StreamChunk> {
    return this.provider.generateStream(request);
  }

  generateWithTools(
    request: GenerateRequest,
    tools: ToolDefinition[],
  ): Promise<GenerateWithToolsResult> {
    return this.provider.generateWithTools(request, tools);
  }
}
