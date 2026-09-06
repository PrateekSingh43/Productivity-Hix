export function averageRecallScore(scores: Array<number | null | undefined>) {
  const known = scores.filter((score): score is number => typeof score === "number");
  return known.length === 0 ? null : known.reduce((sum, score) => sum + score, 0) / known.length;
}
