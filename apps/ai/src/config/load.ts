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

  const rawTemperature = env.AI_TEMPERATURE?.trim();
  const rawMaxOutputTokens = env.AI_MAX_OUTPUT_TOKENS?.trim();

  return {
    provider: rawProvider,
    model,
    geminiApiKey: env.GEMINI_API_KEY?.trim() || undefined,
    groqApiKey: env.GROQ_API_KEY?.trim() || env.GROQ_API_Key?.trim() || undefined,
    defaultTemperature: rawTemperature ? Number(rawTemperature) : undefined,
    defaultMaxOutputTokens: rawMaxOutputTokens ? Number(rawMaxOutputTokens) : undefined,
  };
}

export function loadAIGenerationPolicy(
  env: Record<string, string | undefined>,
): AIGenerationPolicy {
  const rawDefaultTemp = env.AI_TEMPERATURE?.trim();
  const rawDefaultTokens =
    env.AI_DEFAULT_MAX_OUTPUT_TOKENS?.trim() || env.AI_MAX_OUTPUT_TOKENS?.trim();
  const rawMaxTokens = env.AI_MAX_OUTPUT_TOKENS?.trim();

  const defaultTemperature = rawDefaultTemp !== undefined ? Number(rawDefaultTemp) : 0.7;
  const defaultMaxOutputTokens = rawDefaultTokens !== undefined ? Number(rawDefaultTokens) : 4096;
  const maxOutputTokens = rawMaxTokens !== undefined ? Number(rawMaxTokens) : 8192;

  if (Number.isNaN(defaultTemperature) || defaultTemperature < 0 || defaultTemperature > 2) {
    throw new AIError("AI_TEMPERATURE must be between 0 and 2", "config", 500);
  }
  if (Number.isNaN(defaultMaxOutputTokens) || defaultMaxOutputTokens <= 0) {
    throw new AIError("AI_DEFAULT_MAX_OUTPUT_TOKENS must be a positive number", "config", 500);
  }
  if (Number.isNaN(maxOutputTokens) || maxOutputTokens <= 0) {
    throw new AIError("AI_MAX_OUTPUT_TOKENS must be a positive number", "config", 500);
  }

  return {
    defaultTemperature,
    defaultMaxOutputTokens,
    maxOutputTokens,
  };
}

export { DEFAULT_MODELS };

