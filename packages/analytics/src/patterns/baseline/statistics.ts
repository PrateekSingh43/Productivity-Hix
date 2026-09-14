import { safeDivide, isValidFinite } from "../shared/math";

/**
 * Computes the percentile of an array of numbers using NIST / Hyndman-Fan Method 7
 * (linear interpolation between closest ranks).
 * 
 * @param values An array of numbers (does not need to be pre-sorted).
 * @param p The percentile to compute, in range [0, 1].
 * @returns The computed percentile, or null if the array is empty or contains non-finite values.
 */
export function percentile(values: number[], p: number): number | null {
  if (!values.length || p < 0 || p > 1) {
    return null;
  }

  const validValues = values.filter(isValidFinite);
  if (validValues.length === 0) {
    return null;
  }

  const sorted = [...validValues].sort((a, b) => a - b);
  const N = sorted.length;

  if (N === 1) {
    return sorted[0]!;
  }

  // Method 7: h = 1 + (N - 1)p (1-based) -> zero-based h0 = (N - 1)p
  const h0 = (N - 1) * p;
  const i0 = Math.floor(h0);
  const f = h0 - i0;

  if (i0 >= N - 1) {
    return sorted[N - 1]!;
  }

  const result = (1 - f) * sorted[i0]! + f * sorted[i0 + 1]!;
  return isValidFinite(result) ? result : null;
}

/**
 * Computes the median of an array of numbers.
 * The median is strictly the 50th percentile computed via Method-7 (p = 0.5).
 * For even N, this corresponds exactly to the average of the two central values.
 * 
 * @param values An array of numbers.
 * @returns The computed median, or null if invalid.
 */
export function median(values: number[]): number | null {
  return percentile(values, 0.5);
}

/**
 * Computes the Interquartile Range (IQR) of an array of numbers.
 * IQR = Q3 (75th percentile) - Q1 (25th percentile), via Method-7.
 * 
 * @param values An array of numbers.
 * @returns The computed IQR, or null if invalid.
 */
export function iqr(values: number[]): number | null {
  const q3 = percentile(values, 0.75);
  const q1 = percentile(values, 0.25);

  if (q3 === null || q1 === null) {
    return null;
  }

  const result = q3 - q1;
  return isValidFinite(result) ? Math.max(0, result) : null;
}

/**
 * Computes the fraction of qualifying observations that satisfy an operational criterion.
 * 
 * @param satisfyingCount The number of observations satisfying the criterion.
 * @param totalQualifyingCount The total number of qualifying observations.
 * @returns The fraction [0, 1], or null if denominator is 0.
 */
export function recurrenceFraction(satisfyingCount: number, totalQualifyingCount: number): number | null {
  if (satisfyingCount < 0 || totalQualifyingCount < 0) {
    return null;
  }
  return safeDivide(satisfyingCount, totalQualifyingCount);
}

/**
 * Computes the relative deviation of an observed metric from a baseline reference.
 * 
 * @param currentValue The currently observed metric.
 * @param baselineValue The baseline reference metric.
 * @returns The delta ratio, or null if baseline <= 0 or if values are invalid.
 */
export function deltaRatio(currentValue: number | null, baselineValue: number | null): number | null {
  if (currentValue == null || baselineValue == null || baselineValue <= 0) {
    return null;
  }
  const diff = currentValue - baselineValue;
  return safeDivide(diff, baselineValue);
}
