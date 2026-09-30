/**
 * Phase 0 Worker Processors Registry
 * Exposes processor interfaces and contract stubs.
 */

export * from './timeline';
export * from './pattern';
// NOTE (Phase 5): processors/insight.ts (Phase-0 stub that only threw) was
// deleted. Insight composition lives in packages/analytics + the API service;
// no insight worker is registered, so no processor adapter is needed.
