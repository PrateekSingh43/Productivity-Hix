const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

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
