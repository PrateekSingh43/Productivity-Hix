import { z } from "zod";

export const activityAssessmentSchema = z.enum([
  "productive",
  "learning",
  "deep_focus",
  "useful_not_productive",
  "distracted",
  "break",
]);

export const checkInAlignmentSchema = z.enum(["yes", "partly", "no"]);

export const emotionalStateSchema = z.enum([
  "calm",
  "neutral",
  "happy",
  "motivated",
  "sleepy",
  "stressed",
  "anxious",
  "frustrated",
  "angry",
]);

export const energyLevelSchema = z.enum(["low", "medium", "high"]);

export const focusLevelSchema = z.enum(["scattered", "mixed", "focused"]);

export const checkInCreateSchema = z.object({
  workSessionId: z.string().uuid().nullable().optional(),
  sessionId: z.string().uuid().nullable().optional(),
  taskId: z.string().uuid().nullable().optional(),
  windowStart: z.string().datetime().nullable().optional(),
  windowEnd: z.string().datetime().nullable().optional(),
  activityAssessment: activityAssessmentSchema.or(z.string()).nullable().optional(),
  alignment: checkInAlignmentSchema.or(z.string()).nullable().optional(),
  reasons: z.array(z.string().trim().min(1).max(100)).default([]),
  state: emotionalStateSchema.or(z.string()).nullable().optional(),
  energy: energyLevelSchema.or(z.string()).nullable().optional(),
  focus: focusLevelSchema.or(z.string()).nullable().optional(),
  // Free-text reflection max 500 characters
  note: z.string().trim().max(500, "Reflection note must be at most 500 characters").nullable().optional(),
  questionVersion: z.string().trim().min(1).max(50).default("v1"),
  source: z.string().trim().min(1).max(50).default("extension_hourly"),
  deeperAnswers: z.record(z.string(), z.string()).nullable().optional(),
  eventType: z.enum(["PERIODIC", "AWAY_REVIEW"]).or(z.string()).default("PERIODIC"),
  // Legacy fields
  intent: z.string().trim().max(500).optional(),
  progress: z.boolean().optional(),
  blocker: z.string().trim().max(1000).nullable().optional(),
  productive: z.boolean().nullable().optional(),
  outcome: z.string().trim().max(2000).nullable().optional(),
});

export type CheckInCreateInput = z.infer<typeof checkInCreateSchema>;
