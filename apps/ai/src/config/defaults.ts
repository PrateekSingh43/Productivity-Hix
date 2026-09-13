import type { AIProviderName } from "../provider/types";

/**
 * Configuration defaults only. Provider implementations must use the resolved
 * `AIConfig.model` and must not hardcode a model identifier.
 */
export const DEFAULT_MODELS: Record<AIProviderName, string> = {
  gemini: "gemini-2.5-flash",
  groq: "llama-3.1-8b-instant",
};
