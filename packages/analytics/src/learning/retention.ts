export function retentionScore(initialScore: number, laterScore: number) {
  if (initialScore <= 0) return laterScore > 0 ? 1 : 0;
  return Math.max(0, Math.min(1, laterScore / initialScore));
}
