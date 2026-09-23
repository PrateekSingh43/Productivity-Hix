/**
 * Deterministic Job Identity Utilities
 * Provides canonical identity hashing without domain-specific knowledge.
 */

import { createHash } from 'node:crypto';

/**
 * Hashes canonical identity components deterministically.
 * Strips undefined/null values and normalizes separators.
 */
export function hashCanonicalIdentity(
  parts: (string | number | boolean | undefined | null)[]
): string {
  const normalized = parts
    .map((p) => (p === undefined || p === null ? '' : String(p).trim()))
    .join(':');

  return createHash('sha256').update(normalized).digest('hex').slice(0, 32);
}

/**
 * Builds a deterministic job ID string with prefix and components.
 */
export function formatJobIdentity(
  prefix: string,
  parts: (string | number | boolean | undefined | null)[]
): string {
  const joined = parts
    .map((p) => (p === undefined || p === null ? '' : String(p).trim()))
    .join(':');
  return `${prefix}:${joined}`;
}
