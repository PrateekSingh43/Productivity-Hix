const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000";

export function getApiBaseUrl(): string {
  return apiUrl;
}

export function getWebSocketBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_WS_URL) {
    return process.env.NEXT_PUBLIC_WS_URL;
  }
  const url = new URL(apiUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/ws";
  return url.toString().replace(/\/$/, "");
}

export class ApiClientError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
  }
}

/**
 * Explicit browser identity for development authentication.
 *
 * The API resolves the user from (in order): device token, then the
 * `x-user-id` dev header when `ALLOW_DEV_AUTH` is enabled server-side.
 * This value MUST be explicit per install — it is read from
 * `NEXT_PUBLIC_DEV_USER_ID` (documented in `.env.example`) with a local-dev
 * fallback. Set it to an empty string to omit the header entirely (session /
 * device-token auth). Never inline a literal user id at call sites.
 */
export function getBrowserDevUserId(): string {
  return process.env.NEXT_PUBLIC_DEV_USER_ID ?? "00000000-0000-0000-0000-000000000001";
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const devUserId = getBrowserDevUserId();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(devUserId ? { "x-user-id": devUserId } : {}),
    ...((init?.headers as Record<string, string>) || {}),
  };
  const response = await fetch(`${apiUrl}${path}`, {
    ...init,
    credentials: "include",
    headers,
  });
  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    throw new ApiClientError(
      errorBody?.error ?? `API request failed (${response.status})`,
      response.status
    );
  }
  return response.json() as Promise<T>;
}

export function jsonBody(body: unknown, method: "POST" | "PUT" | "PATCH" | "DELETE" = "POST"): RequestInit {
  return { method, body: JSON.stringify(body) };
}
