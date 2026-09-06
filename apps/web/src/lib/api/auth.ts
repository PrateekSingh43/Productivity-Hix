import type { AuthStatus } from "@repo/types";
import { apiFetch } from "./client";

export function getAuthStatus() {
  return apiFetch<AuthStatus>("/api/auth/me");
}
export function getAuthProviders() {
  return apiFetch<{ providers: string[]; configured: boolean }>("/api/auth/providers");
}

export function verifyDeviceCode(userCode: string) {
  return apiFetch<{ success: boolean; userCode: string }>("/api/auth/device/verify", {
    method: "POST",
    body: JSON.stringify({ userCode }),
  });
}
