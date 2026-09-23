# Pattern Vertical Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run PatternWorker end-to-end (job → detectors → persisted findings → API → UI) with zero fake data and zero LLM calls.

**Architecture:** Move the existing API-side orchestration (`evaluate` in `apps/api/src/services/patterns/service.ts`) into a pure `packages/analytics` pipeline module both API and worker call; persist `PatternFinding` + `PatternAnalysisRun` rows in Postgres; implement `PatternWorker extends BaseWorker`; produce jobs via outbox-backed `POST /api/patterns/analyze`; switch `GET /api/patterns` to persisted reads with a truthful `pending` state.

**Tech Stack:** TypeScript, Prisma/Postgres, BullMQ/Redis (worker only), Vitest, TanStack Query, Next.js.

**Spec:** This task brief (Pattern Vertical Slice, independent track). No Timeline changes. No AI imports in pattern path (`packages/analytics` verified free of `@repo/ai`).

## Global Constraints

- Observation ≠ Feature ≠ Pattern ≠ Insight — patterns stay deterministic, non-causal, evidence-backed.
- No LLM calls in PatternWorker; no `@repo/ai` import in pattern computation path.
- BullMQ owns retry/backoff; BaseWorker owns execution semantics; PatternWorker owns only computation + durable output.
- Do not rewrite Timeline, TemporalActivityBlock, timeline APIs, DuckDB, FeatureSnapshot, InsightWorker.
- Do not enable `blocked-not-implemented` / `not-implemented` / `insight-material-only` catalog detectors.
- Do not modify detector thresholds to make tests pass.
- Zero fake metrics in UI; zero Patterns is legitimate; `INSUFFICIENT_EVIDENCE` never becomes a pattern.
- Existing Group 1/2 tests must stay green.

---

## Implementation audit (required §4 format)

```text
Pattern detectors ................ IMPLEMENTED (4 available; 19 test files; rest stay blocked)
Pattern qualification ............ IMPLEMENTED (guards/evidence/temporal + tests)
Pattern promotion ................ IMPLEMENTED (only D3 path wired in orchestration; D1 dropped by design-catalog-role, D2 wrapper deferred)
Baseline engine .................. IMPLEMENTED (engine/statistics/providers + tests)
Pattern result types ............. IMPLEMENTED (packages/types/src/patterns.ts)
Pattern persistence .............. MISSING (no Prisma model)
PatternWorker .................... MISSING (stub throws PHASE_0_SAFETY_GUARD)
Pattern job producer ............. MISSING (API has no queue access; outbox path available)
Worker queue registration ........ MISSING (bootstrap registers zero workers)
API persisted-read path .......... MISSING (GET computes synchronously)
Current synchronous fallback ..... IMPLEMENTED (runPatternPipeline + 458-line service.test.ts)
Patterns UI ...................... IMPLEMENTED (PatternsView/PatternCard/AnalyticsState/queries)
Pattern UI states ................ PARTIAL (no pending state)
Detector test coverage ........... IMPLEMENTED
End-to-end Pattern flow ......... MISSING
```

**Smallest complete path:** persist (2 models) → share orchestration via analytics pipeline module → worker → register → outbox producer → persisted-read API → pending UI → tests.

**Detector correctness notes (from audit):** D1 zero-baseline guard OK; windows strictly separated; timezone-aware day counting; coverage/unknown fractions enforced; weak samples → INSUFFICIENT_EVIDENCE. Real gap found: D1/D2 pattern outputs are computed but never promoted (only D3 `continuousCandidate` is promoted). Preserved intentionally: D1 is contributor-only per catalog; a D2 promotion wrapper would invent qualification semantics — deferred, not silently fixed. D4 is evaluated with `[]` instances (plan snapshots unavailable by design) — preserved.

---

### Task 1: Pattern persistence models + migration

**Files:**
- Modify: `packages/db/prisma/schema.prisma` (append models + User relations)
- Run: migration + `pnpm --filter @repo/db db:generate`

**Interfaces:**
- Consumes: existing `User` model, `OutboxEvent` pattern for status enums.
- Produces: `PatternFinding`, `PatternAnalysisRun` Prisma models used by Tasks 4, 6.

**Schema (exact):**

```prisma
enum PatternRunStatus {
  RUNNING
  COMPLETED
  FAILED
  SUPERSEDED
}

model PatternAnalysisRun {
  id               String           @id @default(cuid())
  userId           String           @map("user_id")
  windowStart      DateTime         @map("window_start")
  windowEnd        DateTime         @map("window_end")
  identityKey      String           @map("identity_key")
  inputFingerprint String           @map("input_fingerprint")
  status           PatternRunStatus @default(RUNNING)
  state            String           @default("pending")
  diagnosticsJson  Json?            @map("diagnostics_json")
  detectorVersion  String           @map("detector_version")
  configVersion    String           @map("config_version")
  jobCorrelationId String?          @map("job_correlation_id")
  error            String?
  computedAt       DateTime?        @map("computed_at")
  createdAt        DateTime         @default(now()) @map("created_at")
  updatedAt        DateTime         @updatedAt @map("updated_at")
  user             User             @relation(fields: [userId], references: [id], onDelete: Cascade)
  findings         PatternFinding[]

  @@unique([userId, identityKey])
  @@index([userId, windowStart, windowEnd])
  @@map("pattern_analysis_runs")
}

model PatternFinding {
  id             String   @id @default(cuid())
  userId         String   @map("user_id")
  runId          String   @map("run_id")
  patternKey     String   @map("pattern_key")
  detectorIdentity String @map("detector_identity")
  patternId      String   @map("pattern_id")
  status         String
  resultJson     Json     @map("result_json")
  createdAt      DateTime @default(now()) @map("created_at")
  user           User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  run            PatternAnalysisRun @relation(fields: [runId], references: [id], onDelete: Cascade)

  @@unique([userId, patternKey])
  @@index([runId])
  @@map("pattern_findings")
}
```

- Add to `User`: `patternAnalysisRuns PatternAnalysisRun[]` + `patternFindings PatternFinding[]`.
- `identityKey` = `pattern:{userId}:{windowStart}:{windowEnd}:{sortedDetectors}:{detectorVersion}:{configVersion}` hashed sha256 hex 32 (reuse `hashCanonicalIdentity` semantics; implement locally in worker to avoid cross-package import — actually `apps/worker/src/base/identity.ts` already exports `hashCanonicalIdentity`; use it).
- `patternKey` = `pattern:{patternId}:{detectorVersion}:{configVersion}` (patternId already embeds window via stableId; version suffix forces recompute on bump).
- `inputFingerprint` = sha256 of `{userId, windowStart, windowEnd, detectorVersions, maxSourceTimestamps}` (see Task 4).

- [ ] **Step 1:** Append models + User relations to schema.prisma.
- [ ] **Step 2:** Run `pnpm --filter @repo/db db:migrate -- --name pattern_findings_and_runs` (needs DB per `packages/db/.env`), then `db:generate`.
- [ ] **Step 3:** Run `pnpm --filter @repo/db check-types`.
- [ ] **Step 4:** Commit.

---

### Task 2: Shared pipeline module in analytics (API delegates, no contract change)

**Files:**
- Create: `packages/analytics/src/patterns/pipeline.ts`
- Create: `packages/analytics/src/patterns/evidence-assembler.ts` (moved verbatim from `apps/api/src/services/patterns/evidence.ts`)
- Modify: `packages/analytics/src/patterns/index.ts` (export both)
- Modify: `apps/api/src/services/patterns/evidence.ts` (re-export shim for `service.test.ts` compat)
- Modify: `apps/api/src/services/patterns/support.ts` (re-export configs from pipeline)
- Modify: `apps/api/src/services/patterns/service.ts` (readData stays; `evaluate` delegates to pipeline)

**Interfaces:**
- Consumes: existing detectors, promotion, catalog, qualification, baseline (all in-repo).
- Produces: `PatternPipelineInput`, `evaluatePatterns(input): PatternPipelineResult`, `PATTERN_ENGINE_VERSION = "1.0.0"`, `PATTERN_CONFIG_VERSION = "api-prototype-1"`, `assembleEvidence`, `timelineFromBlocks`, `stableId`, `compare`, `overlaps` (all re-exported, same signatures).

**Move rules:** byte-for-byte moves of `evidence.ts` helpers, `support.ts` constants/builders, and service `closedSessions/sessionEpisodes/taskEpisodes/diagnostic/continuousCandidate/evaluate` internals. The only edits allowed: import paths + exporting `evaluatePatterns(input: PatternPipelineInput)` where input = the existing `Data` interface (minus `connected`/`recordingHistory` which stay API-side for state computation... actually `evaluate` uses `data.connected` and `data.recordingHistory` for state — include them in input; worker provider supplies equivalents).

`PatternPipelineInput` (exact):

```ts
export interface PatternPipelineInput {
  userId: string;
  timezone: string;
  boundary: string;
  window: AnalyticalWindow;
  baselineWindow: AnalyticalWindow;
  timeline: EvidenceTimeline;
  baseline: EvidenceTimeline;
  sessions: WorkSession[];
  reports: CheckIn[];
  outcomes: OutcomeInput[];
  tasks: Array<{ id: string; completedAt: string | null }>;
  connected: boolean;
  recordingHistory: { firstObservationAt: string | null; lastObservationAt: string | null; recordedDays: number; connected: boolean };
}
```

(Note: service `Data.tasks` uses `completedAt: Date | null`; normalize to ISO string|null at the boundary in both callers.)

- [ ] **Step 1:** Create `evidence-assembler.ts` (move), export from index, shim api `evidence.ts` re-exports.
- [ ] **Step 2:** Create `pipeline.ts` (move configs + orchestration), export from index.
- [ ] **Step 3:** Rewrite api `service.ts` to `readData` → `evaluatePatterns`; keep `resolveWindow`, `PatternsResponse`, `runPatternPipeline`, `runInsightPipeline` signatures identical.
- [ ] **Step 4:** Run `pnpm --filter @repo/analytics test` and `pnpm --filter @repo/api test` — all green.
- [ ] **Step 5:** Commit.

---

### Task 3: PatternWorker + data provider + registration + routing

**Files:**
- Create: `apps/worker/src/pattern/data-provider.ts`
- Create: `apps/worker/src/pattern/pattern-worker.ts`
- Create: `apps/worker/src/pattern/index.ts`
- Create: `apps/worker/src/pattern/pattern-worker.test.ts`
- Modify: `apps/worker/package.json` (add `@repo/analytics: workspace:*`)
- Modify: `apps/worker/src/bootstrap.ts` (register PatternWorker)
- Modify: `apps/worker/src/queues/registry.ts` (add `'pattern.analysis.requested'` → PATTERN_ANALYSIS)
- Modify: `apps/worker/src/processors/pattern.ts` (delegate stub to real worker OR leave stub and register new class — choose: keep stub file untouched, register `PatternWorker` class; processors/index stays)

**Interfaces:**
- Consumes: `BaseWorker`, `patternAnalysisJobDataSchema`, `evaluatePatterns`, `PatternPipelineInput`, `getDb` from `@repo/db`, `DomainEventEnvelope`.
- Produces: `PatternWorker` (queueName `pattern-analysis`), `PrismaPatternDataProvider`, `computePatternInputFingerprint`, `buildPatternIdentityKey`.

**Worker semantics (exact):**

```ts
validate(raw): PatternAnalysisJobData {
  const payload = (raw && typeof raw === "object" && "payload" in (raw as any) && "eventType" in (raw as any))
    ? (raw as DomainEventEnvelope).payload   // outbox envelope path
    : raw;                                    // direct enqueue path (tests, manual)
  const data = patternAnalysisJobDataSchema.parse(payload);  // throws → WorkerValidationError via BaseWorker? No: wrap in WorkerValidationError (permanent)
  const known = data.targetDetectors?.filter(isDetectorIdentity) ?? [];
  const unknown = (data.targetDetectors ?? []).filter(d => !isDetectorIdentity(d));
  if (unknown.length) throw new WorkerPermanentError(`Unknown detectors: ${unknown.join(",")}`);
  if (data.windowStart >= data.windowEnd) throw new WorkerPermanentError("Empty window");
  return { ...data, targetDetectors: known.length || !data.targetDetectors ? data.targetDetectors : known };
}
```

- `getJobIdentity`: `formatJobIdentity("pattern", [userId, windowStart, windowEnd, (targetDetectors??[]).sort().join("+"), PATTERN_ENGINE_VERSION, PATTERN_CONFIG_VERSION])`.
- Provider `loadInput(data)`: Prisma reads mirroring api `readData` (userPreference, normalizedActivity in [baselineStart, windowEnd), workSession, checkIn, task, dailyGoal+plan, counts, recordingHistory via same raw SQL with fallback), maps rows to `PatternPipelineInput` (reuse `assembleEvidence` from analytics; reuse `activityInRange`-equivalent clipping: implement `clipEventsToRange` locally — 15 lines — do NOT import from apps/api).
- `computePatternInputFingerprint(input, sourceMaxTimestamps)`: sha256 of `[userId, window, engineVersion, configVersion, maxActivityCreatedAt, maxSessionUpdatedAt, maxCheckInCreatedAt, maxTaskUpdatedAt]`.
- `checkIdempotency`: find run by `[userId, identityKey]` with status COMPLETED and equal inputFingerprint → return `{ patternsFound, runId }` summary. Else null.
- Pre/post supersession via run row: pre: upsert run `{status: RUNNING, inputFingerprint: current}`; post: recompute fingerprint; if changed → mark SUPERSEDED, return superseded (BaseWorker post-check returns boolean — implement `checkSuperseded` to compare stored fingerprint vs current; stale flag set in `execute` end... simpler: `execute` does post-check itself before persist and throws `WorkerCancelledError`? No — correct hook: `checkSuperseded` reads run row created at pre-stage? BaseWorker calls pre-check BEFORE execute, so run row doesn't exist yet at pre-time. Design: pre-check returns true if a NEWER COMPLETED/RUNNING run exists for same window with different identityKey (i.e., another job superseded this one). Post-check: recompute fingerprint vs the one stored at execute-start (stash on `this` keyed map? BaseWorker instance is singleton — stash `lastInputFingerprint` per jobIdentity in a Map, set in execute, read in checkSuperseded; acceptable, documented). If differ → true (discard).
- `execute`: load → evaluatePatterns → persist run COMPLETED + findings upsert by patternKey (delete-then-insert findings for run? No: upsert each by [userId, patternKey]; stale findings from prior run with same window but no longer detected → delete findings of prior run id for same window not in new set. Implement: deleteMany where runId = previous run for same window... simpler: findings carry runId; on new COMPLETED run for same window, delete findings whose runId = old run id. Track old run id before upsert.)
- Findings persisted ONLY for `promoted.pattern` (promotion already applied in pipeline) — plus store non-promoted statuses? No: persist promoted patterns only; run record holds state+diagnostics (covers no-findings/insufficient-evidence truthfully).
- No `@repo/ai` import anywhere in these files (lint-grep in test).

- [ ] **Step 1:** Add analytics dep, install.
- [ ] **Step 2:** Write failing worker test (valid job → persisted findings via fake db; invalid payload → permanent; rerun → idempotent; fingerprint change mid-run → superseded).
- [ ] **Step 3:** Implement provider + worker + registration + routing entry.
- [ ] **Step 4:** Run `pnpm --filter @repo/worker test` + `check-types`, Group1/2 suites green.
- [ ] **Step 5:** Commit.

---

### Task 4: Producer endpoint + persisted-read API

**Files:**
- Modify: `apps/api/src/routes/patterns.ts` (add `POST /analyze`)
- Modify: `apps/api/src/services/patterns/service.ts` (add `requestPatternAnalysis`, `getPersistedPatterns`)
- Create: `apps/api/src/services/patterns/persisted.test.ts` (mock-db tests via setTestDb)

**Interfaces:**
- Consumes: `resolveWindow`, Prisma `outboxEvent`/`patternAnalysisRun`/`patternFinding`.
- Produces: `POST /api/patterns/analyze → 202 {accepted, correlationId, window}`; `GET /api/patterns → PatternsResponse` (same shape + `"pending"` state).

**Producer (exact):** parse `{from?, to?, targetDetectors?}` with `resolveWindow`; validate detectors via `isDetectorIdentity` (400 on unknown); `jobCorrelationId = randomUUID()`, `queuedAt = now`; `db.outboxEvent.create({eventType: "pattern.analysis.requested", aggregateType: "pattern", aggregateId: userId, payload: {userId, windowStart, windowEnd, targetDetectors, reason: "MANUAL_TRIGGER", jobCorrelationId, queuedAt}, correlationId: jobCorrelationId, schemaVersion: "1.0.0"})`. No Redis touch (publisher polls).

**Persisted-read (exact):** resolve window → find runs for user overlapping window? Runs are per exact window; API window varies. Rule: find latest COMPLETED run with `windowStart/WindowEnd` exactly equal; if none → `{state: "pending", window, patterns: [], diagnostics: {perDetector: []}}`. If run → patterns from findings (parse resultJson, sort by patternId), diagnostics from run.diagnosticsJson. Include `recordingHistory`? diagnosticsJson stores full diagnostics incl. recordingHistory at compute time — truthful as-of computedAt; add `computedAt` passthrough? Response contract has no computedAt — keep contract, do NOT add fields. Hmm — staleness honesty: diagnostics recordingHistory is as-of compute. Acceptable for slice; document.

Keep `runPatternPipeline` exported (fallback unused by route; tests still cover orchestration).

- [ ] **Step 1:** Failing API tests (pending when no run; patterns from rows; 202 producer writes outbox row; 400 bad detector).
- [ ] **Step 2:** Implement, run `pnpm --filter @repo/api test`.
- [ ] **Step 3:** Commit.

---

### Task 5: UI pending state + run button

**Files:**
- Modify: `apps/web/src/features/analytics/types/index.ts` (add `"pending"` to state union — check current type first)
- Modify: `apps/web/src/features/analytics/components/analytics-state.tsx` (pending branch, non-causal copy)
- Modify: `apps/web/src/features/analytics/api/client.ts` (add `requestPatternAnalysis(period)`)
- Modify: `apps/web/src/features/analytics/api/queries.ts` (add `useRequestPatternAnalysis` mutation invalidating patterns key)
- Modify: `apps/web/src/features/analytics/components/patterns-view.tsx` (render run button when pending)

**Copy (exact, non-causal):** title "Pattern analysis hasn't run for this period." body "Run analysis to compute findings from your recorded activity. This may take a minute." button "Run analysis" / "Running…".

- [ ] **Step 1:** Implement + `pnpm --filter` web check-types (check web package name/script first).
- [ ] **Step 2:** Commit.

---

### Task 6: Verification + report

- [ ] `pnpm --filter @repo/analytics test`, `@repo/api test`, `@repo/worker test`, `@repo/db` validate, web check-types.
- [ ] L5 evidence: producer→outbox→envelope→worker→db→API test (mock-Redis style per group2 suite) all in one test file `apps/worker/src/pattern/vertical-slice.test.ts`.
- [ ] Write final report per brief §30 (files, detector changes, persistence, worker, API, UI, verification commands+results, deferred list).

## Self-Review

- Spec coverage: §4 audit ✓ (in doc), §5-6 detectors ✓ (Tasks 2-3, D2-wrapper deferred w/ reason), §7-8 worker-does-not-touch-HTTP ✓ (provider abstraction), §9-11 worker model ✓ (Task 3), §12-15 persistence/identity/idempotency/supersession ✓ (Tasks 1,3), §16 quality ✓ (promotion-gated persist), §17-18 API+producer ✓ (Task 4), §19-21 UI ✓ (Task 5), §25 tests ✓ (Tasks 3,4,6), §26 regression ✓ (Task 6), §27 future compat ✓ (provider interface).
- No placeholders: all schemas, copies, and function contracts inlined above.
- Type consistency: `PatternPipelineInput.tasks[].completedAt: string | null` normalized at both callers; envelope unwrap in one place (`validate`).
