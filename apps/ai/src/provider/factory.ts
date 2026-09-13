import { AIError } from "./errors";
import { GeminiProvider, type GeminiClientLike } from "./gemini";
import { GroqProvider, type GroqClientLike } from "./groq";
import type { AIConfig, AIProvider } from "./types";

export interface ProviderDependencies {
  geminiClient?: GeminiClientLike;
  groqClient?: GroqClientLike;
}

export function createAIProvider(
  config: AIConfig,
  dependencies: ProviderDependencies = {},
): AIProvider {
  switch (config.provider) {
    case "gemini": {
      if (!config.geminiApiKey) {
        throw new AIError("Gemini API key is missing", "config", 503, "gemini");
      }
      return new GeminiProvider({
        model: config.model,
        apiKey: config.geminiApiKey,
        client: dependencies.geminiClient,
      });
    }
    case "groq": {
      if (!config.groqApiKey) {
        throw new AIError("Groq API key is missing", "config", 503, "groq");
      }
      return new GroqProvider({
        model: config.model,
        apiKey: config.groqApiKey,
        client: dependencies.groqClient,
      });
    }
    default: {
      const provider = (config as AIConfig).provider;
      throw new AIError(
        `Unsupported AI provider "${String(provider)}". Use gemini or groq.`,
        "config",
        500,
      );
    }
  }
}
