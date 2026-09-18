import type { UserPreferences } from "@repo/types";
import type {
  UserPreferencesUpdateInput,
  UserActivityRuleCreateInput,
  UserActivityRuleUpdateInput,
  UserOverrideCreateInput,
} from "@repo/validation";

export interface UserActivityRule {
  id: string;
  userId: string;
  name: string;
  priority: number;
  isEnabled: boolean;
  applicationPattern: string | null;
  domainPattern: string | null;
  titlePattern: string | null;
  urlPattern: string | null;
  assignedModality: string | null;
  assignedContext: string | null;
  defaultRelevance: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UserActivityOverride {
  id: string;
  userId: string;
  targetTimeWindowStart: string;
  targetTimeWindowEnd: string;
  targetApplication: string;
  targetClaimFamily: string;
  targetClaimType: string;
  overriddenValue: string;
  reason: string | null;
  createdAt: string;
}

export type {
  UserPreferences,
  UserPreferencesUpdateInput,
  UserActivityRuleCreateInput,
  UserActivityRuleUpdateInput,
  UserOverrideCreateInput,
};
