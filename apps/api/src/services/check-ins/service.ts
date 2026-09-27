import type { CheckIn, CheckInAmendment, CheckInPatternCandidate } from "@repo/types";
import type { CheckInCreateInput, CheckInUpdateInput } from "@repo/validation";
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

export async function listCheckIns(userId: string, window?: { from: Date; to: Date }): Promise<CheckIn[]> {
  const rows = await getDb().checkIn.findMany({
    where: {
      userId,
      ...(window ? {
        OR: [
          { windowStart: { lt: window.to }, windowEnd: { gt: window.from } },
          { windowStart: null, createdAt: { gte: window.from, lt: window.to } },
        ],
      } : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    ...(window ? {} : { take: 50 }),
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
    note: input.note ? input.note.trim().slice(0, 500) : null,
    questionVersion: input.questionVersion || "v1",
    source: input.source || "extension_hourly",
    deeperAnswers: input.deeperAnswers ? (input.deeperAnswers as any) : null,
    // Legacy fields populated sensibly (strictly capped at DB column limit 500 chars)
    intent: (input.intent || (input.activityAssessment ? `Reflection: ${input.activityAssessment}` : "Hourly reflection")).slice(0, 500),
    progress: input.progress !== undefined ? input.progress : input.alignment !== "no",
    blocker: (input.blocker || (input.reasons && input.reasons.length > 0 ? input.reasons.join(", ") : null))?.slice(0, 500) ?? null,
    productive: input.productive !== undefined ? input.productive : input.activityAssessment === "productive" || input.activityAssessment === "deep_focus",
    outcome: (input.outcome ? input.outcome.trim() : (input.note ? input.note.trim() : null))?.slice(0, 500) ?? null,
  };

  const created = await getDb().checkIn.create({ data });
  return serializeCheckIn(created);
}

/**
 * Amends a reflection: snapshots the current content into the append-only
 * check_in_amendments table, then updates the row in place so every existing
 * read (drawer, analytics, patterns) keeps showing the latest words while the
 * raw original stays inspectable. Amendment is best-effort atomic: snapshot
 * first, then update; a snapshot failure aborts before anything changes.
 */
export async function amendCheckIn(
  userId: string,
  id: string,
  input: CheckInUpdateInput,
): Promise<CheckIn> {
  const db = getDb();
  const existing = await db.checkIn.findFirst({ where: { id, userId } });
  if (!existing) {
    const error = new Error("Check-in not found") as Error & { status?: number };
    error.status = 404;
    throw error;
  }

  const trim500 = (v: string | null | undefined) =>
    v === undefined ? undefined : v === null ? null : v.trim().slice(0, 500);

  await db.checkInAmendment.create({
    data: {
      userId,
      checkInId: id,
      activityAssessment: existing.activityAssessment,
      alignment: existing.alignment,
      reasons: existing.reasons,
      state: existing.state,
      energy: existing.energy,
      focus: existing.focus,
      note: existing.note,
      blocker: existing.blocker,
      productive: existing.productive,
      outcome: existing.outcome,
    },
  });

  const updated = await db.checkIn.update({
    where: { id },
    data: {
      ...(input.activityAssessment !== undefined && { activityAssessment: input.activityAssessment || null }),
      ...(input.alignment !== undefined && { alignment: input.alignment || null }),
      ...(input.reasons !== undefined && { reasons: input.reasons }),
      ...(input.state !== undefined && { state: input.state || null }),
      ...(input.energy !== undefined && { energy: input.energy || null }),
      ...(input.focus !== undefined && { focus: input.focus || null }),
      ...(input.note !== undefined && { note: input.note ? input.note.trim().slice(0, 500) : null }),
      ...(input.blocker !== undefined && { blocker: trim500(input.blocker) ?? null }),
      ...(input.productive !== undefined && { productive: input.productive }),
      ...(input.outcome !== undefined && { outcome: trim500(input.outcome) ?? null }),
    },
  });
  return serializeCheckIn(updated);
}

/**
 * Preserved pre-amendment snapshots for one reflection, oldest-first.
 * Empty when never amended.
 */
export async function listCheckInAmendments(
  userId: string,
  checkInId: string,
): Promise<CheckInAmendment[]> {
  const checkIn = await getDb().checkIn.findFirst({
    where: { id: checkInId, userId },
    select: { id: true },
  });
  if (!checkIn) return [];
  const rows = await getDb().checkInAmendment.findMany({
    where: { userId, checkInId },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((r) => ({
    id: r.id,
    activityAssessment: r.activityAssessment,
    alignment: r.alignment,
    reasons: r.reasons ?? [],
    state: r.state,
    energy: r.energy,
    focus: r.focus,
    note: r.note,
    blocker: r.blocker,
    productive: r.productive,
    outcome: r.outcome,
    createdAt: r.createdAt.toISOString(),
  }));
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
