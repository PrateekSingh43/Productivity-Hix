import { DEFAULT_MODELS } from "./defaults";
import { AIError } from "../provider/errors";
import type { AIConfig, AIProviderName } from "../provider/types";

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
    geminiApiKey: env.GEMINI_API_KEY?.trim() || env.GEMINI_KEY?.trim() || undefined,
    groqApiKey: env.GROQ_API_KEY?.trim() || undefined,
  };
}

export { DEFAULT_MODELS };
