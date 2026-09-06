import type { LearningAssessment } from "@repo/types";
import { apiFetch } from "./client";

export function getAssessments() {
  return apiFetch<LearningAssessment[]>("/api/learning/assessments");
}
