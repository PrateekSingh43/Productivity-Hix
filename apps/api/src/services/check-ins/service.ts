import type { CheckIn, CheckInPatternCandidate } from "@repo/types";
import type { CheckInCreateInput } from "@repo/validation";
import { getDb } from "../../lib/prisma";

const DEEPER_QUESTION_CATALOG: Record<
  string,
  { id: string; prompt: string; targetReason: string; options: string[] }
> = {
  didnt_feel_like_it: {
    id: "q_starting_difficulty",
    targetReason: "didnt_feel_like_it",
    prompt: "You've mentioned several times that starting was difficult. Which feels closest?",
    options: [
      "Task felt too large",
      "Didn't know the first step",
      "Mentally tired",
      "Preferred something easier",
      "Worried I would do it badly",
      "Task didn't feel important",
    ],
  },
  low_motivation: {
    id: "q_low_motivation",
    targetReason: "low_motivation",
    prompt: "Motivation has dipped across several work blocks. What describes your state?",
    options: [
      "Energy depleted",
      "Goal doesn't feel rewarding",
      "Too many context switches",
      "Unclear immediate impact",
      "Need a real break",
    ],
  },
  distracted: {
    id: "q_distraction_source",
    targetReason: "distracted",
    prompt: "Distraction has come up repeatedly. What is typically pulling your attention?",
    options: [
      "Notifications / messages",
      "Urgent side tasks",
      "Mind wandering / boredom",
      "Social media / browsing",
      "Physical environment noise",
    ],
  },
  task_unclear: {
    id: "q_task_clarity",
    targetReason: "task_unclear",
    prompt: "Tasks frequently feel unclear. When is definition usually missing?",
    options: [
      "At the start of the day",
      "When requirements change",
      "Missing acceptance criteria",
      "Scope is too broad",
    ],
  },
  too_difficult: {
    id: "q_difficulty_unblock",
    targetReason: "too_difficult",
    prompt: "You've often encountered challenging blocks recently. What usually helps unblock?",
    options: [
      "Breaking into smaller steps",
      "Checking documentation",
      "Taking a 10m walk",
      "Pairing / asking someone",
      "Writing out problem in pseudo-code",
    ],
  },
};

function serializeCheckIn(row: {
  id: string;
  userId: string;
  workSessionId: string | null;
  taskId: string | null;
  windowStart: Date | null;
  windowEnd: Date | null;
  activityAssessment: string | null;
  alignment: string | null;
  reasons: string[];
  state: string | null;
  energy: string | null;
  focus: string | null;
  note: string | null;
  questionVersion: string;
  source: string;
  deeperAnswers: unknown;
  intent: string | null;
  progress: boolean | null;
  blocker: string | null;
  productive: boolean | null;
  outcome: string | null;
  createdAt: Date;
}): CheckIn {
  return {
    id: row.id,
    userId: row.userId,
    workSessionId: row.workSessionId,
    taskId: row.taskId,
    windowStart: row.windowStart ? row.windowStart.toISOString() : null,
    windowEnd: row.windowEnd ? row.windowEnd.toISOString() : null,
    activityAssessment: row.activityAssessment,
    alignment: row.alignment,
    reasons: row.reasons ?? [],
    state: row.state,
    energy: row.energy,
    focus: row.focus,
    note: row.note,
    questionVersion: row.questionVersion,
    source: row.source,
    deeperAnswers:
      row.deeperAnswers && typeof row.deeperAnswers === "object"
        ? (row.deeperAnswers as Record<string, string>)
        : null,
    intent: row.intent,
    progress: row.progress,
    blocker: row.blocker,
    productive: row.productive,
    outcome: row.outcome,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listCheckIns(userId: string): Promise<CheckIn[]> {
  const rows = await getDb().checkIn.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return rows.map(serializeCheckIn);
}

export async function createCheckIn(
  userId: string,
  input: CheckInCreateInput,
): Promise<CheckIn> {
  const effectiveSessionId = input.workSessionId || input.sessionId || null;

  const data = {
    userId,
    workSessionId: effectiveSessionId,
    taskId: input.taskId || null,
    windowStart: input.windowStart ? new Date(input.windowStart) : null,
    windowEnd: input.windowEnd ? new Date(input.windowEnd) : null,
    activityAssessment: input.activityAssessment || null,
    alignment: input.alignment || null,
    reasons: input.reasons || [],
    state: input.state || null,
    energy: input.energy || null,
    focus: input.focus || null,
    note: input.note ? input.note.slice(0, 350) : null,
    questionVersion: input.questionVersion || "v1",
    source: input.source || "extension_hourly",
    deeperAnswers: input.deeperAnswers ? (input.deeperAnswers as any) : null,
    // Legacy fields populated sensibly
    intent: input.intent || (input.activityAssessment ? `Reflection: ${input.activityAssessment}` : "Hourly reflection"),
    progress: input.progress !== undefined ? input.progress : input.alignment !== "no",
    blocker: input.blocker || (input.reasons && input.reasons.length > 0 ? input.reasons.join(", ") : null),
    productive: input.productive !== undefined ? input.productive : input.activityAssessment === "productive" || input.activityAssessment === "deep_focus",
    outcome: input.outcome || input.note || null,
  };

  const created = await getDb().checkIn.create({ data });
  return serializeCheckIn(created);
}

/**
 * Deterministic deeper pattern detection:
 * Same reason >= 5 occurrences AND >= 3 separate days -> candidate pattern -> deeper question eligible
 */
export async function getCheckInPatterns(userId: string): Promise<CheckInPatternCandidate[]> {
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const rows = await getDb().checkIn.findMany({
    where: {
      userId,
      createdAt: { gte: fourteenDaysAgo },
    },
    select: {
      reasons: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  const reasonStats: Record<string, { total: number; days: Set<string> }> = {};

  for (const row of rows) {
    const dayKey = row.createdAt.toISOString().slice(0, 10);
    for (const r of row.reasons) {
      if (!reasonStats[r]) {
        reasonStats[r] = { total: 0, days: new Set() };
      }
      reasonStats[r].total += 1;
      reasonStats[r].days.add(dayKey);
    }
  }

  const candidates: CheckInPatternCandidate[] = [];

  for (const [reason, stats] of Object.entries(reasonStats)) {
    const daysCount = stats.days.size;
    const deeperEligible = stats.total >= 5 && daysCount >= 3;
    const deeperQuestion = DEEPER_QUESTION_CATALOG[reason];

    candidates.push({
      reason,
      occurrences: stats.total,
      daysCount,
      deeperEligible,
      deeperQuestion: deeperEligible && deeperQuestion ? deeperQuestion : undefined,
    });
  }

  return candidates.sort((a, b) => b.occurrences - a.occurrences);
}
