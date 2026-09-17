/**
 * Shared Math utilities for Phase 4 Analytics.
 * Guarantees no NaN, Infinity, or -Infinity emissions.
 * Does not implement arbitrary rounding or precision clamping unless semantically required.
 */

export function safeDivide(numerator: number | null | undefined, denominator: number | null | undefined): number | null {
  if (numerator == null || denominator == null || !Number.isFinite(numerator) || !Number.isFinite(denominator)) {
    return null;
  }
  if (denominator === 0) {
    return null;
  }
  const result = numerator / denominator;
  if (!Number.isFinite(result)) {
    return null;
  }
  return result;
}

export function safeRatio(numerator: number | null | undefined, denominator: number | null | undefined): number | null {
  return safeDivide(numerator, denominator);
}

export function isValidFinite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
