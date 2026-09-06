import type { CheckIn } from "@repo/types";
import { apiFetch, jsonBody } from "./client";

export function getCheckIns() {
  return apiFetch<CheckIn[]>("/api/check-ins");
}
export function createCheckIn(input: {
  intent: string;
  progress: boolean;
  productive?: boolean | null;
  blocker?: string | null;
  outcome?: string | null;
}) {
  return apiFetch<CheckIn>("/api/check-ins", jsonBody(input));
}
