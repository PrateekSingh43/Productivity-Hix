# AGENTS.md — ProductiveHix Engineering & Architecture Rules

This file is automatically loaded by AI coding assistants working in the ProductiveHix workspace.

## 1. Single Source of Truth
Before planning or implementing any feature, database migration, analytical detector, AI synthesis prompt, or UI change, you **MUST** consult:
- **[docs/PRODUCTIVEHIX_SYSTEM_BLUEPRINT.md](file:///c:/Users/prate/ProductiveHix/docs/PRODUCTIVEHIX_SYSTEM_BLUEPRINT.md)**: Master product philosophy, the Four Kinds of Truth, the 5 core questions, the "missing telemetry" gap recovery mechanism, the DuckDB analytical pipeline, the closed-loop retention engine, and the 9-phase roadmap.
- **[docs/PRODUCTIVEHIX_UX_CONTRACT.md](file:///c:/Users/prate/ProductiveHix/docs/PRODUCTIVEHIX_UX_CONTRACT.md)**: UX contract, presentation states, page layouts, and information architecture.
- **[docs/PRODUCTIVEHIX_MAINTAINABILITY_STANDARD.md](file:///c:/Users/prate/ProductiveHix/docs/PRODUCTIVEHIX_MAINTAINABILITY_STANDARD.md)**: Permanent maintainability, traceability, and future-refactorability standard, domain feature ownership, and TanStack Query v5 invalidation contracts.

## 2. Inviolable Core Principles
1. **Zero Fake Data**: Never invent metrics, hardcoded trends (`+12%`), synthetic multipliers (`* 0.65`), or fake baseline placeholders. Use explicit `loading`, `empty`, or `insufficient` states.
2. **AI Never Receives Raw Telemetry**: Never dump hundreds of raw ActivityWatch events into an LLM context window. Raw telemetry must be aggregated and summarized via DuckDB and canonical feature extractors (`packages/analytics`).
3. **The Four Kinds of Truth**:
   - `Intention` (Daily Goal, Priorities, Tasks)
   - `Observation` (ActivityWatch desktop + browser telemetry)
   - `Reflection` (50m check-ins, focus debriefs, and **inactivity gap explanations**)
   - `Retention` (Spaced active recall testing, probe questions, knowledge gaps)
4. **Missing Telemetry ≠ Slacking**: Telemetry gaps (50+ min away or sleep/suspend) require checking machine availability and recovering the user explanation (e.g., "went to college"). Coverage is an analytical concept.
5. **Decouple the Epistemic Hierarchy**:
   - `Observation`: *"X happened."*
   - `Pattern`: *"X repeatedly happens across comparable sessions."*
   - `Insight`: *"X matters because it affects outcome Z."*
   - `Recommendation`: *"Consider doing Y."*
   Never collapse these four into one object.
6. **Decouple Goal Outcome from Task Completion**: Completing 5/5 tasks does not mean a Daily Goal was achieved. Goal outcome is a subjective self-assessment at day's end.
7. **Permanent Maintainability, Traceability & Refactorability**:
   - Assume code will be maintained by someone with zero context.
   - Enforce domain colocation under `apps/web/src/features/<domain>/` with strict public boundaries via `index.ts`.
   - TanStack Query factories (`queryOptions`) must govern all query keys.
   - All mutations must explicitly declare their cache invalidation blast radius.
   - Complex functions, detectors, and converters must include explicit JSDoc contracts stating purpose, units, assumptions, and edge cases.

## 3. Worker Subsystem & Runtime Invariants (Plan v3)
All background and analytical execution must conform to Section 10 of **[docs/PRODUCTIVEHIX_SYSTEM_BLUEPRINT.md](file:///c:/Users/prate/ProductiveHix/docs/PRODUCTIVEHIX_SYSTEM_BLUEPRINT.md)**:
1. **Worker Ownership Boundary**:
   - `apps/api`: HTTP routes + authoritative transactions only. Never run heavy background computation or DuckDB materializations in request handlers.
   - `apps/worker`: Single dedicated runtime hosting all 8 domain workers (`TimelineWorker`, `AnalyticalProjectionWorker`, `FeatureWorker`, `PatternWorker`, `InsightWorker`, `FinalizationWorker`, `ReconciliationWorker`, `AIAnalysisWorker`).
   - `packages/analytics`: Pure deterministic algorithms; `simple-statistics` stays strictly here.
   - `packages/data`: DuckDB client and projection queries.
   - `PostgreSQL`: Durable source of truth and durable derived states.
   - `Redis / BullMQ`: Transient queueing, distributed locking, and job orchestration.
2. **AI Isolation**: Lower-level workers and `BaseWorker` must NEVER import `@repo/ai`. Only `InsightWorker` (automatic synthesis from qualified candidates) and `AIAnalysisWorker` (asynchronous user questions) may touch AI.
3. **Retry Ownership**: BullMQ manages job attempts and backoff. `BaseWorker` normalizes errors and classifies them as `RETRYABLE_ERROR` or `PERMANENT_ERROR`. `BaseWorker` must not implement internal sleep/retry loops.
4. **Cooperative Timeout**: Timeouts emit an `AbortSignal`. Operations must handle cooperative cancellation.
5. **Idempotency vs. Locking**:
   - `jobId` provides queue-level deduplication.
   - Distributed lock (`IdempotencyProvider`) serializes active execution.
   - Domain `checkIdempotency()` verifies whether output already exists in PostgreSQL.
6. **Pre- and Post-Execution Supersession**: Check `checkSuperseded()` before execution (skip obsolete) and immediately after execution before persistence (discard stale results if source data mutated during computation).
7. **Strict Dependency Execution Order**: Features must be built strictly in order of foundational dependencies: `Group 0 (Reconciliation) → Group 1 (BaseWorker) → Group 2 (Queue/Events) → Group 3 (Timeline) → Group 4 (DuckDB Projection) → ...`.
