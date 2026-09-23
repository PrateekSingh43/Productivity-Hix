import {
  AIRuntime,
  createAIProvider,
  loadAIConfig,
  loadAIGenerationPolicy,
  type AIConfig,
  type AIGenerationPolicy,
  type AIProvider,
  type AIProviderName,
} from "@repo/ai";
import { env, type Env } from "../../config/env";

let runtimeOverride: AIRuntime | null | undefined;
let cachedRuntime: AIRuntime | null | undefined;

export type AIEnvSource = Partial<Record<keyof Env, unknown>>;

export function getAIConfigFromEnv(source: AIEnvSource = env): AIConfig | null {
  const provider =
    source.AI_PROVIDER !== undefined
      ? String(source.AI_PROVIDER)
      : source.GROQ_API_KEY
        ? "groq"
        : source.GEMINI_API_KEY
          ? "gemini"
          : undefined;
  return loadAIConfig({
    AI_PROVIDER: provider,
    AI_MODEL: source.AI_MODEL !== undefined ? String(source.AI_MODEL) : undefined,
    GEMINI_API_KEY: source.GEMINI_API_KEY !== undefined ? String(source.GEMINI_API_KEY) : undefined,
    GROQ_API_KEY: source.GROQ_API_KEY !== undefined ? String(source.GROQ_API_KEY) : undefined,
  });
}

export function getAIGenerationPolicyFromEnv(source: AIEnvSource = env): AIGenerationPolicy {
  return loadAIGenerationPolicy({
    AI_TEMPERATURE:
      source.AI_TEMPERATURE !== undefined ? String(source.AI_TEMPERATURE) : undefined,
    AI_DEFAULT_MAX_OUTPUT_TOKENS:
      source.AI_DEFAULT_MAX_OUTPUT_TOKENS !== undefined
        ? String(source.AI_DEFAULT_MAX_OUTPUT_TOKENS)
        : undefined,
    AI_MAX_OUTPUT_TOKENS:
      source.AI_MAX_OUTPUT_TOKENS !== undefined ? String(source.AI_MAX_OUTPUT_TOKENS) : undefined,
  });
}

export function createAIRuntime(
  config: AIConfig,
  policy: AIGenerationPolicy,
  provider?: AIProvider,
): AIRuntime {
  const activeProvider = provider ?? createAIProvider(config);
  return new AIRuntime(activeProvider, policy);
}

export function getAIRuntime(): AIRuntime | null {
  if (runtimeOverride !== undefined) {
    return runtimeOverride;
  }
  if (cachedRuntime !== undefined) {
    return cachedRuntime;
  }
  const config = getAIConfigFromEnv();
  if (!config) {
    cachedRuntime = null;
    return null;
  }
  const policy = getAIGenerationPolicyFromEnv();
  cachedRuntime = createAIRuntime(config, policy);
  return cachedRuntime;
}

export function getAIStatus(): {
  configured: boolean;
  ready: boolean;
  provider: AIProviderName | null;
  model: string | null;
} {
  const config = getAIConfigFromEnv();
  if (!config) {
    return { configured: false, ready: false, provider: null, model: null };
  }
  try {
    const runtime = getAIRuntime();
    return {
      configured: true,
      ready: runtime !== null,
      provider: config.provider,
      model: config.model,
    };
  } catch {
    return {
      configured: true,
      ready: false,
      provider: config.provider,
      model: config.model,
    };
  }
}

export function setAIRuntimeForTest(runtime: AIRuntime | null | undefined): void {
  runtimeOverride = runtime;
  cachedRuntime = undefined;
}
