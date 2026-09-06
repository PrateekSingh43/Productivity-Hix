import type { LearningAssessment } from "@repo/types";
import { averageRecallScore } from "@repo/analytics";
import { getDb } from "../../lib/prisma";

function serializeAssessment(row: {
  id: string;
  userId: string;
  topic: string;
  scheduledAt: Date;
  completedAt: Date | null;
  score: number | null;
  questions: Array<{
    id: string;
    assessmentId: string;
    prompt: string;
    expectedAnswer: string | null;
    answer: { answer: string; score: number | null } | null;
  }>;
}): LearningAssessment {
  return {
    id: row.id,
    userId: row.userId,
    topic: row.topic,
    scheduledAt: row.scheduledAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
    score: row.score,
    questions: row.questions.map((question) => ({
      id: question.id,
      assessmentId: question.assessmentId,
      prompt: question.prompt,
      expectedAnswer: question.expectedAnswer,
      answer: question.answer?.answer ?? null,
      score: question.answer?.score ?? null,
    })),
  };
}

export async function listAssessments(userId: string) {
  const rows = await getDb().learningAssessment.findMany({
    where: { userId },
    include: { questions: { include: { answer: true } } },
    orderBy: { scheduledAt: "asc" },
  });
  return rows.map(serializeAssessment);
}

export async function createAssessment(
  userId: string,
  input: {
    topic: string;
    scheduledAt?: Date;
    questions: Array<{ prompt: string; expectedAnswer?: string | null }>;
  },
) {
  const row = await getDb().learningAssessment.create({
    data: {
      userId,
      topic: input.topic,
      scheduledAt: input.scheduledAt ?? new Date(),
      questions: { create: input.questions },
    },
    include: { questions: { include: { answer: true } } },
  });
  return serializeAssessment(row);
}

export async function answerQuestion(
  userId: string,
  questionId: string,
  input: { answer: string; score?: number | null },
) {
  const question = await getDb().learningQuestion.findFirst({
    where: { id: questionId, assessment: { userId } },
  });
  if (!question) throw new Error("Learning question not found");
  const answer = await getDb().learningAnswer.upsert({
    where: { questionId },
    update: input,
    create: { questionId, ...input },
  });
  const questions = await getDb().learningQuestion.findMany({
    where: { assessmentId: question.assessmentId },
    include: { answer: true },
  });
  const score = averageRecallScore(questions.map((item) => item.answer?.score));
  await getDb().learningAssessment.update({
    where: { id: question.assessmentId },
    data: { score, completedAt: new Date() },
  });
  return { answer, score };
}
