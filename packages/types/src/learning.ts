export type LearningQuestion = {
  id: string;
  assessmentId: string;
  prompt: string;
  answer: string | null;
  expectedAnswer: string | null;
  score: number | null;
};

export type LearningAssessment = {
  id: string;
  userId: string;
  topic: string;
  scheduledAt: string;
  completedAt: string | null;
  score: number | null;
  questions: LearningQuestion[];
};
