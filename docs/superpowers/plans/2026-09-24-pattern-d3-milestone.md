# Pattern Milestone: First Real D3 Proof + Working Path Record (Phase C)

Status: VALIDATED on live infrastructure 2026-09-23. No thresholds weakened. No evidence manufactured.

## 1. Working path (the only supported route to a user-visible Pattern)

```text
Browser (explicit NEXT_PUBLIC_DEV_USER_ID identity)
  ↓ POST /api/patterns/analyze {from, to} (date-only, day-stable windows)
API → 202 {state: RUNNING, requestId/jobCorrelationId} + OutboxEvent(PENDING)
  ↓ OutboxPublisher.processNextBatch → BullMQ pattern-analysis (envelope job data)
PatternWorker (BaseWorker: validate → idempotent? → lock → pre-check → execute → post-check)
  ↓ PrismaPatternDataProvider (source-faithful reads, no session rewriting)
evaluatePatterns (D1 evaluated/contributor-only, D2 evaluated/not promoted,
  D3 candidate per task-linked closed sessions + promotePattern, D4 NOT_AVAILABLE)
  ↓ freshness gate → $transaction { findings create + run COMPLETED } (atomic)
PostgreSQL: PatternAnalysisRun (immutable row per execution) + PatternFinding (bound to run)
  ↓ GET /api/patterns (latest COMPLETED for user+window + readiness)
Patterns UI (single state; RUNNING polls; terminal states stop; readiness strip)
```

## 2. D3 evidence requirements (exact, from enforced configs — do not weaken)

- Current window: ≥3 qualifying occasions AND ≥3 distinct days (`continuousThresholds`), coverage ≥0.80, unknown ≤0.20, episode ≥600s; sessions manual + closed + non-paused + non-overlapping + same productive day + explicitly linked to ONE task; baseline: 30-day window, ≥3 occasions + ≥3 days; contrast ≥600s median with ≥2/3 directional support; `promotePattern` gates (validity flags, claim level, non-causal claim, evidence lineage).
- D3 sees ONLY task-linked sessions. Unlinked continuous work is not eligible evidence (recorded in D3 diagnostics reason, not silently dropped).

## 3. Live proof record (real user 00000000-0000-0000-0000-000000000001)

- POST → 202, correlation `1a46bfe8-9cfc-4641-8a16-65211292d9ff`, window 2026-09-10→2026-09-23, outbox PENDING.
- Independent live worker consumed → run `cmueh87ru0000lg11rehe8xdm` COMPLETED `insufficient-evidence`, 0 findings.
- Prior run `cmue9izwg0000k011aw4xst9c` (10:03 UTC, different fingerprint) preserved untouched — immutable history on real rows.
- GET returns diagnostics: D1 1/1 (bar 5/3), D2 2/1 (bar 3/2), D3 0/0, D4 NOT_AVAILABLE; readiness `{recorded, insufficient, completed, none}`.
- Conclusion: 26,780 telemetry events / 20 recording days, yet max 2 same-day sessions per task → system correctly refuses the card. Per §52 this IS a successful analytical result.
- D3-DETECTED shape + persistence proven on real Postgres by `pattern-integration.test.ts` ("detects a real same-task sustained change with full lineage": DETECTED, finding persisted, COMPLETED, lineage read back).

## 4. Real-user runbook (to obtain the first D3 card honestly)

1. Postgres + Redis reachable; schema migrated; API + worker running; browser identity = telemetry/session/task user.
2. Log closed manual sessions linked to ONE task across ≥3 days (current 14-day window) with telemetry coverage.
3. Ensure the same task has ≥3 comparable sessions across ≥3 days in the preceding 30-day baseline.
4. Click Run analysis → 202 → wait for COMPLETED → card renders; polling stops automatically.
5. If INSUFFICIENT_EVIDENCE: read the D3 diagnostic reason (tells exactly which gate failed), keep logging sessions.

## 5. Detector portfolio status (frozen until roles defined)

- D3 extended_continuous_activity: USER-FACING (proven). D1: SUPPORTING (contributor-only, diagnostics only).
- D2: constrained, no promotion wrapper (would invent semantics). D4: NOT_AVAILABLE (needs snapshots; `Task.plannedStart` is mutable, not a snapshot). D5–D7: unimplemented. Insight synthesis: out of scope.
