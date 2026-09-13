import type { CheckIn } from "@repo/types";
import { apiFetch, jsonBody } from "./client";

export function getCheckIns() {
  return apiFetch<CheckIn[]>("/api/check-ins");
}
export function createCheckIn(input: {
  workSessionId?: string | null;
  taskId?: string | null;
  intent?: string;
  progress?: boolean;
  productive?: boolean | null;
  blocker?: string | null;
  outcome?: string | null;
  activityAssessment?: string | null;
  energy?: string | null;
  focus?: string | null;
  note?: string | null;
  source?: string;
}) {
  return apiFetch<CheckIn>("/api/check-ins", jsonBody(input));
}
