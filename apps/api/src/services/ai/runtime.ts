import {
  AIRuntime,
  createAIProvider,
  loadAIConfig,
  type AIConfig,
  type AIProviderName,
} from "@repo/ai";
import { env } from "../../config/env";

let runtimeOverride: AIRuntime | null | undefined;
let cachedRuntime: AIRuntime | null | undefined;

function envForAI(): Record<string, string | undefined> {
  return {
    AI_PROVIDER: env.AI_PROVIDER,
    AI_MODEL: env.AI_MODEL,
    GEMINI_API_KEY: env.GEMINI_API_KEY,
    GEMINI_KEY: env.GEMINI_KEY,
    GROQ_API_KEY: env.GROQ_API_KEY,
  };
}

export function loadApiAIConfig(): AIConfig | null {
  return loadAIConfig(envForAI());
}

export function getAIRuntime(): AIRuntime | null {
  if (runtimeOverride !== undefined) {
    return runtimeOverride;
  }
  if (cachedRuntime !== undefined) {
    return cachedRuntime;
  }
  const config = loadApiAIConfig();
  if (!config) {
    cachedRuntime = null;
    return null;
  }
  cachedRuntime = new AIRuntime(createAIProvider(config));
  return cachedRuntime;
}

export function getAIStatus(): {
  configured: boolean;
  ready: boolean;
  provider: AIProviderName | null;
  model: string | null;
} {
  const config = loadApiAIConfig();
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
