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

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-user-id": "00000000-0000-0000-0000-000000000001",
    ...(init?.headers as Record<string, string> || {}),
  };
  const response = await fetch(`${apiUrl}${path}`, {
    ...init,
    credentials: "include",
    headers,
  });
  if (!response.ok)
    throw new Error(
      (await response.json().catch(() => null))?.error ?? `API request failed (${response.status})`,
    );
  return response.json() as Promise<T>;
}

export function jsonBody(body: unknown): RequestInit {
  return { method: "POST", body: JSON.stringify(body) };
}
