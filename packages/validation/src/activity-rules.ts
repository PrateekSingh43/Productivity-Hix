import { z } from "zod";

export const activityModalitySchema = z.enum([
  "development",
  "reading_research",
  "writing_documentation",
  "communication",
  "administration",
  "media_consumption",
  "gaming",
  "idle_away",
  "system_maintenance",
  "unknown",
]);

export const contextRelevanceSchema = z.enum([
  "DIRECT",
  "SUPPORTIVE",
  "TANGENTIAL",
  "UNRELATED",
  "UNKNOWN",
]);

const userActivityRuleBaseSchema = z.object({
  name: z.string().min(1).max(120),
  priority: z.number().int().min(0).max(100000).default(100),
  isEnabled: z.boolean().default(true),
  applicationPattern: z.string().max(500).nullable().optional(),
  domainPattern: z.string().max(500).nullable().optional(),
  titlePattern: z.string().max(500).nullable().optional(),
  urlPattern: z.string().max(500).nullable().optional(),
  assignedModality: activityModalitySchema.nullable().optional(),
  assignedContext: z.string().max(200).nullable().optional(),
  defaultRelevance: contextRelevanceSchema.nullable().optional(),
});

export const userActivityRuleCreateSchema = userActivityRuleBaseSchema
  .refine(
    (r) =>
      [r.applicationPattern, r.domainPattern, r.titlePattern, r.urlPattern].some((p) => p),
    { message: "At least one matcher pattern is required" }
  )
  .refine(
    (r) => r.assignedModality !== null || r.assignedContext !== null || r.defaultRelevance !== null,
    { message: "At least one assignment (modality, context, or relevance) is required" }
  );

export const userActivityRuleUpdateSchema = userActivityRuleBaseSchema.partial();

export const userOverrideCreateSchema = z.object({
  targetTimeWindowStart: z.string().datetime(),
  targetTimeWindowEnd: z.string().datetime(),
  targetApplication: z.string().min(1).max(200),
  targetClaimFamily: z.enum(["CLASSIFICATION", "INTENT_ASSOCIATION"]).default("CLASSIFICATION"),
  targetClaimType: z.enum(["MODALITY_PRIMARY", "TOPIC_CONTEXT"]),
  overriddenValue: z.string().min(1).max(200),
  reason: z.string().max(1000).optional(),
});

export type UserActivityRuleCreateInput = z.infer<typeof userActivityRuleCreateSchema>;
export type UserActivityRuleUpdateInput = z.infer<typeof userActivityRuleUpdateSchema>;
export type UserOverrideCreateInput = z.infer<typeof userOverrideCreateSchema>;
