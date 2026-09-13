import { AIError } from "../provider/errors";
import type {
  AIGenerationPolicy,
  AIProvider,
  GenerateRequest,
  GenerateResult,
  GenerateWithToolsResult,
  StreamChunk,
  ToolDefinition,
} from "../provider/types";

const DEFAULT_POLICY: AIGenerationPolicy = {
  defaultTemperature: 0.7,
  defaultMaxOutputTokens: 4096,
  maxOutputTokens: 8192,
};

/**
 * Thin provider-agnostic generation runtime.
 * Applies generation policy defaults and ceilings before delegating to the provider.
 * Enforces policy invariants at construction time.
 * Phase 0 does not include a tool registry or multi-step agent loop.
 */
export class AIRuntime {
  private readonly policy: AIGenerationPolicy;

  constructor(
    private readonly provider: AIProvider,
    policy?: Partial<AIGenerationPolicy>,
  ) {
    const defaultTemperature =
      policy?.defaultTemperature ?? DEFAULT_POLICY.defaultTemperature;
    const defaultMaxOutputTokens =
      policy?.defaultMaxOutputTokens ?? DEFAULT_POLICY.defaultMaxOutputTokens;
    const maxOutputTokens = policy?.maxOutputTokens ?? DEFAULT_POLICY.maxOutputTokens;

    if (
      !Number.isFinite(defaultTemperature) ||
      defaultTemperature < 0 ||
      defaultTemperature > 2
    ) {
      throw new AIError(
        "defaultTemperature must be a finite number between 0 and 2",
        "config",
        500,
      );
    }
    if (
      !Number.isFinite(defaultMaxOutputTokens) ||
      !Number.isInteger(defaultMaxOutputTokens) ||
      defaultMaxOutputTokens <= 0
    ) {
      throw new AIError(
        "defaultMaxOutputTokens must be a positive integer",
        "config",
        500,
      );
    }
    if (
      !Number.isFinite(maxOutputTokens) ||
      !Number.isInteger(maxOutputTokens) ||
      maxOutputTokens <= 0
    ) {
      throw new AIError(
        "maxOutputTokens must be a positive integer",
        "config",
        500,
      );
    }
    if (defaultMaxOutputTokens > maxOutputTokens) {
      throw new AIError(
        `defaultMaxOutputTokens (${defaultMaxOutputTokens}) cannot exceed maxOutputTokens (${maxOutputTokens})`,
        "config",
        500,
      );
    }

    this.policy = {
      defaultTemperature,
      defaultMaxOutputTokens,
      maxOutputTokens,
    };
  }

  getProviderInfo(): { provider: AIProvider["name"]; model: string } {
    return {
      provider: this.provider.name,
      model: this.provider.model,
    };
  }

  getPolicy(): AIGenerationPolicy {
    return { ...this.policy };
  }

  generate(request: GenerateRequest): Promise<GenerateResult> {
    return this.provider.generate(this.applyPolicy(request));
  }

  generateStream(request: GenerateRequest): AsyncIterable<StreamChunk> {
    return this.provider.generateStream(this.applyPolicy(request));
  }

  generateWithTools(
    request: GenerateRequest,
    tools: ToolDefinition[],
  ): Promise<GenerateWithToolsResult> {
    return this.provider.generateWithTools(this.applyPolicy(request), tools);
  }

  private applyPolicy(request: GenerateRequest): GenerateRequest {
    const temperature =
      request.temperature !== undefined
        ? Math.max(0, Math.min(2, request.temperature))
        : this.policy.defaultTemperature;

    const requestedTokens = request.maxOutputTokens ?? this.policy.defaultMaxOutputTokens;
    const maxOutputTokens = Math.min(
      Math.max(1, requestedTokens),
      this.policy.maxOutputTokens,
    );

    return {
      ...request,
      temperature,
      maxOutputTokens,
    };
  }
}
