export type ActivityAssessment =
  | "productive"
  | "learning"
  | "deep_focus"
  | "useful_not_productive"
  | "distracted"
  | "break";

export type CheckInAlignment = "yes" | "partly" | "no";

export type EmotionalState =
  | "calm"
  | "neutral"
  | "happy"
  | "stressed"
  | "anxious"
  | "frustrated"
  | "motivated";

export type EnergyLevel = "low" | "medium" | "high";

export type FocusLevel = "scattered" | "mixed" | "focused";

export type CheckIn = {
  id: string;
  userId: string;
  workSessionId: string | null;
  taskId: string | null;
  windowStart: string | null;
  windowEnd: string | null;
  activityAssessment: string | null;
  alignment: string | null;
  reasons: string[];
  state: string | null;
  energy: string | null;
  focus: string | null;
  note: string | null;
  questionVersion: string;
  source: string;
  deeperAnswers?: Record<string, string> | null;
  // Legacy fields
  intent: string | null;
  progress: boolean | null;
  blocker: string | null;
  productive: boolean | null;
  outcome: string | null;
  createdAt: string;
};

export type CheckInPatternCandidate = {
  reason: string;
  occurrences: number;
  daysCount: number;
  deeperEligible: boolean;
  deeperQuestion?: {
    id: string;
    prompt: string;
    targetReason: string;
    options: string[];
  };
};
