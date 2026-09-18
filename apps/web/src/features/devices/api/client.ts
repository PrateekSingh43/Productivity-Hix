import { apiFetch, jsonBody } from "@shared/api/client";

export function verifyDeviceCode(userCode: string) {
  return apiFetch<{ success: boolean; userCode: string }>("/api/auth/device/verify", {
    method: "POST",
    ...jsonBody({ userCode }),
  });
}
