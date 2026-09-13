import { DEFAULT_MODELS } from "./defaults";
import { AIError } from "../provider/errors";
import type { AIConfig, AIGenerationPolicy, AIProviderName } from "../provider/types";

const PROVIDERS: readonly AIProviderName[] = ["gemini", "groq"];

function isProviderName(value: string): value is AIProviderName {
  return (PROVIDERS as readonly string[]).includes(value);
}

export function loadAIConfig(env: Record<string, string | undefined>): AIConfig | null {
  const rawProvider = env.AI_PROVIDER?.trim().toLowerCase();
  if (!rawProvider) {
    return null;
  }
  if (!isProviderName(rawProvider)) {
    throw new AIError(
      `Unsupported AI provider "${rawProvider}". Use gemini or groq.`,
      "config",
      500,
    );
  }

  const model = env.AI_MODEL?.trim() || DEFAULT_MODELS[rawProvider];
  if (!model) {
    throw new AIError("AI_MODEL is required", "config", 500, rawProvider);
  }

  return {
    provider: rawProvider,
    model,
    geminiApiKey: env.GEMINI_API_KEY?.trim() || undefined,
    groqApiKey: env.GROQ_API_KEY?.trim() || undefined,
  };
}

export function loadAIGenerationPolicy(
  env: Record<string, string | undefined>,
): AIGenerationPolicy {
  const rawDefaultTemp = env.AI_TEMPERATURE?.trim();
  const rawDefaultTokens = env.AI_DEFAULT_MAX_OUTPUT_TOKENS?.trim();
  const rawMaxTokens = env.AI_MAX_OUTPUT_TOKENS?.trim();

  let defaultTemperature = 0.7;
  if (rawDefaultTemp !== undefined && rawDefaultTemp !== "") {
    const parsed = Number(rawDefaultTemp);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 2) {
      throw new AIError("AI_TEMPERATURE must be a finite number between 0 and 2", "config", 500);
    }
    defaultTemperature = parsed;
  }

  let defaultMaxOutputTokens = 4096;
  if (rawDefaultTokens !== undefined && rawDefaultTokens !== "") {
    const parsed = Number(rawDefaultTokens);
    if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) {
      throw new AIError(
        "AI_DEFAULT_MAX_OUTPUT_TOKENS must be a positive integer",
        "config",
        500,
      );
    }
    defaultMaxOutputTokens = parsed;
  }

  let maxOutputTokens = 8192;
  if (rawMaxTokens !== undefined && rawMaxTokens !== "") {
    const parsed = Number(rawMaxTokens);
    if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) {
      throw new AIError("AI_MAX_OUTPUT_TOKENS must be a positive integer", "config", 500);
    }
    maxOutputTokens = parsed;
  }

  if (defaultMaxOutputTokens > maxOutputTokens) {
    throw new AIError(
      `AI_DEFAULT_MAX_OUTPUT_TOKENS (${defaultMaxOutputTokens}) cannot exceed AI_MAX_OUTPUT_TOKENS (${maxOutputTokens})`,
      "config",
      500,
    );
  }

  return {
    defaultTemperature,
    defaultMaxOutputTokens,
    maxOutputTokens,
  };
}

export { DEFAULT_MODELS };
