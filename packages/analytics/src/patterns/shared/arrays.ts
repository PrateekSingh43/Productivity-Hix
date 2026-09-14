/**
 * Shared Array utilities for Phase 4 Analytics.
 * These helpers provide deterministic ordering for currently supported string/object collections. 
 * Full canonical structured serialization for evaluation identity and audit snapshots is 
 * implemented only in the later evaluation-ID/audit stage.
 */

export function sortStringsDeterministically(values: string[]): string[] {
  return [...values].sort((a, b) => a.localeCompare(b, "en", { numeric: true, sensitivity: "base" }));
}

/**
 * Deterministically sorts an array of objects by a primary string key,
 * and an optional secondary string key for tie-breaking.
 */
export function sortObjectsDeterministically<T>(
  items: T[],
  primaryKey: (item: T) => string,
  secondaryKey?: (item: T) => string
): T[] {
  return [...items].sort((a, b) => {
    const valA = primaryKey(a);
    const valB = primaryKey(b);
    const cmp = valA.localeCompare(valB, "en", { numeric: true, sensitivity: "base" });
    if (cmp !== 0) return cmp;
    if (secondaryKey) {
      const secA = secondaryKey(a);
      const secB = secondaryKey(b);
      return secA.localeCompare(secB, "en", { numeric: true, sensitivity: "base" });
    }
    return 0;
  });
}

/**
 * Creates canonicalized nested arrays as requested by the spec
 * (e.g. contributingSessionIds, epistemicCaveats, triggeringEntityIds)
 */
export function canonicalizeStringArray(values: string[] | undefined | null): string[] | undefined {
  if (!values || values.length === 0) return undefined;
  // Deduplicate before sorting for absolute canonicalization
  const unique = Array.from(new Set(values));
  return sortStringsDeterministically(unique);
}
