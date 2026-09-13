import type { AIProviderName } from "./types";

export type AIErrorCode =
  | "auth"
  | "rate_limit"
  | "invalid_request"
  | "provider"
  | "config"
  | "unavailable";

export class AIError extends Error {
  readonly name = "AIError";
  readonly statusCode: number;
  readonly status: number;
  readonly code: AIErrorCode;
  readonly provider?: AIProviderName;

  constructor(
    message: string,
    code: AIErrorCode,
    statusCode: number,
    provider?: AIProviderName,
  ) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
    this.status = statusCode;
    this.provider = provider;
  }
}

const SECRET_PATTERNS: RegExp[] = [
  /AIza[0-9A-Za-z_-]{10,}/g,
  /gsk_[0-9A-Za-z_-]{10,}/g,
  /AQ\.[0-9A-Za-z_-]{10,}/g,
  /Bearer\s+\S+/gi,
  /(?:api[_-]?key|authorization)[=:\s]+["']?[\w.-]{8,}/gi,
];

export function sanitizeErrorMessage(message: string, secrets: Array<string | undefined>): string {
  let sanitized = message;
  for (const secret of secrets) {
    if (secret && secret.length > 0) {
      sanitized = sanitized.split(secret).join("[redacted]");
    }
  }
  for (const pattern of SECRET_PATTERNS) {
    sanitized = sanitized.replace(pattern, "[redacted]");
  }
  return sanitized;
}

function statusFromUnknown(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const candidate = error as { status?: unknown; statusCode?: unknown };
  if (typeof candidate.status === "number") return candidate.status;
  if (typeof candidate.statusCode === "number") return candidate.statusCode;
  return undefined;
}

export function wrapProviderError(
  error: unknown,
  provider: AIProviderName,
  secrets: Array<string | undefined>,
): AIError {
  if (error instanceof AIError) {
    return error;
  }

  const raw = error instanceof Error ? error.message : "Unknown provider error";
  const message = sanitizeErrorMessage(raw, secrets) || "AI generation failed";
  const status = statusFromUnknown(error);
  const lower = message.toLowerCase();

  if (status === 401 || status === 403) {
    return new AIError("AI provider authentication failed", "auth", 401, provider);
  }
  if (status === 429) {
    return new AIError("AI provider rate limit exceeded", "rate_limit", 429, provider);
  }
  if (status === 400 || status === 404 || status === 422) {
    return new AIError(message, "invalid_request", 400, provider);
  }
  if (
    (status !== undefined && status >= 500) ||
    lower.includes("network") ||
    lower.includes("timeout") ||
    lower.includes("econn") ||
    lower.includes("fetch failed")
  ) {
    return new AIError("AI provider is unavailable", "unavailable", 503, provider);
  }
  return new AIError(message, "provider", 502, provider);
}
