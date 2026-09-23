# Pattern Reliability Audit (§49 artifact) — 2026-09-24

Verified by direct file reads on `main` @ `8191829`. No reliance on prior summaries.

## 1. Current Pattern request path
`PatternsView` → `useRequestPatternAnalysis` → `POST /api/patterns/analyze` (`apps/api/src/routes/patterns.ts`)
→ `requestPatternAnalysis` writes `outbox_events` row (`pattern.analysis.requested`, payload = raw `PatternAnalysisJobData`).
Identity: `userIdFrom(request)` (requireAuth: device token, else dev `x-user-id` header). Chain after API is per-user correct.

## 2. Current worker path
OutboxPublisher polls (`FOR UPDATE SKIP LOCKED` + ORM fallback, lease/reclaim/dead-letter — Group 2 tested)
→ `resolveQueueForEvent('pattern.analysis.requested')` → `pattern-analysis` → envelope job data
→ `WorkerRuntime` → `PatternWorker(BaseWorker)` → `PrismaPatternDataProvider` → `evaluatePatterns` → persist.
`bootstrap.ts` registers ONLY `PatternWorker`. TimelineWorker/AnalyticalProjectionWorker remain Phase-0 stubs, unregistered.

## 3. Current persistence path
`PatternAnalysisRun @@unique([userId, identityKey])`, `PatternFinding @@unique([userId, patternKey])`.
DEFECTS: failure leaves `RUNNING` forever (`onFailure` only clears memory); findings upserted incrementally
then run marked COMPLETED in separate statements (partial visibility); findings reassigned across runs via
`runId` update (history mutated, §21); no transaction.

## 4. Current API read path
`GET /api/patterns` → `getPersistedPatterns`: COMPLETED run → rows; else overloaded `"pending"`.
DEFECT: `pending` covers NO_RUN + RUNNING + FAILED + SUPERSEDED. `runPatternPipeline` sync legacy still
exported (used by insights path — left intact per §17/§47).

## 5. Current frontend state path
`usePatterns` (polls every 2500ms while state==`pending` — including terminal COMPLETED states,
§31 defect) → `PatternsView` renders `OnboardingNote` AND `AnalyticsState` simultaneously (§28 defect).
Copy updated by parallel commits but state machine still single overloaded `pending`.

## 6. Identity path — DEFECT (§3 P0/P1)
`apps/web/src/shared/api/client.ts:29` hard-codes `x-user-id: 0000…0001` for EVERY browser request.
Server side is correct per-user. Extension/desktop defaults are separate surfaces (out of scope).
Fix: configurable browser identity; server chain unchanged; isolation test.

## 7. Detector execution matrix
| Detector | Output | Promotion | User-facing | Status |
|---|---|---|---|---|
| D1 context_switching_density | evaluated per session | contributor-only (catalog) — never primary | none (diagnostics only) | CORRECT, keep |
| D2 task_execution_fragmentation | evaluated, thresholds intact | eligible primary but NO promotion wrapper exists → never persisted | none | GAP (wrapper = new semantics; deferred unless §11 audit demands) |
| D3 extended_continuous_activity | candidates per task-linked closed sessions | promoted via `continuousCandidate` | cards | OK, task-link limitation must be explicit (§12) |
| D4 schedule_variance | `evaluatePatternWithInstances(..., [])` → always INSUFFICIENT_EVIDENCE | n/a | none, mislabeled as insufficiency | DEFECT (§13): must be NOT_AVAILABLE |
| blocked/not-implemented/insight-only | — | — | — | stay blocked |

## 8. Worker registration matrix
| Stage | Declared | Implemented | Registered | Executed | Persisted | Read | Rendered |
|---|---|---|---|---|---|---|---|
| outbox→pattern-analysis queue | ✓ | ✓ | n/a | ✓ | n/a | n/a | n/a |
| PatternWorker | ✓ | ✓ | ✓ (bootstrap) | ✓ | ✓ | ✓ | ✓ |
| TimelineWorker | ✓ | stub | ✗ | ✗ | — | — | — |
| AnalyticalProjectionWorker | ✓ | stub | ✗ | ✗ | — | — | — |
| chain telemetry→timeline→projection→pattern | ✓ names | ✗ | — | ✗ | — | — | — (AUDIT ONLY, out of scope) |

## 9. Known defects (this task)
P1 identity hard-code; P0 RUNNING-forever; overloaded pending; incremental persistence; finding-reassignment
history; D4 silent `[]`; D3 task-link limitation implicit; `serializeSession` start-time heuristic in provider;
watermark-only fingerprint (in-place edits invisible); double-render UI; poll-on-terminal; no readiness gate.

## 10. Required changes (§50 Phases 1–9)
1. Configurable browser identity + isolation test. 2. FAILED/SUPERSEDED persistence via onFailure +
API run-state machine. 3. Transactional atomic publication. 4. D4 NOT_AVAILABLE. 5. Registration matrix
doc-only. 6. NO_RUN/RUNNING/COMPLETED/FAILED states + readiness fields. 7. Single-state UI + copy.
8. Readiness indicator (Activity/Evidence/Analysis/Patterns). 9. Real-PG integration tests.
Thresholds untouched (§9, §53).
