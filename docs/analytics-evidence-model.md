# ProductiveHix Analytics & Evidence Model

## 1. Purpose

ProductiveHix is not a passive time tracker or raw telemetry logger. It is a closed-loop behavioral analytics and cognitive performance system designed to answer five core questions:
1. *What did you intend to do?* (`Intention`)
2. *What did the machine observe?* (`Observation`)
3. *What did you experience and reflect?* (`Report` / `Reflection`)
4. *What outcome occurred?* (`Outcome`)
5. *What was retained or learned?* (`Retention`)

To maintain epistemic integrity, the system strictly decouples physical observations from subjective self-assessments, explicit intentions from unverified guesses, and objective outcomes from effort. Physical telemetry (`authority: "SYSTEM"`) and self-reports (`authority: "USER"`) corroborate each other without one overwriting or contaminating the other.

---

## 2. Architectural Layers

The ProductiveHix analytics pipeline is organized into strict unidirectional layers:

```text
PostgreSQL (Durable Authoritative Truth)
    ↓
DuckDB Analytical Projection (User-Isolated Analytical Cache)
    ↓
Canonical Feature Layer (@repo/analytics)
    ↓
Evidence & Observation Model (Temporal Evidence Blocks)
    ↓
Behavioral Pattern Detection (Phase 4 — Future)
    ↓
Insight Generation (Phase 5 — Future)
    ↓
Periodic Synthesis & AI Reasoning (Phase 6 & 7 — Future)
```

> [!IMPORTANT]
> **AI is NEVER the source of fundamental metrics.** LLMs never receive raw ActivityWatch telemetry events. All reasoning is conducted strictly over aggregated, verified feature models and deterministic evidence timelines.

---

## 3. Analytics Foundation

### PostgreSQL: Authoritative Durable Source
PostgreSQL is the sole durable source of truth. Telemetry batches, user check-ins, work sessions, task completions, and gap explanations are committed durably to PostgreSQL before any downstream analytical processing.

### DuckDB: Analytical Projection
DuckDB operates as an in-process, persistent, user-isolated analytical cache. It accelerates aggregation, ranking, top-app extraction, and temporal windowing. DuckDB is strictly derived: it holds no durable state that cannot be reconstructed from PostgreSQL.

### Synchronization & Readiness Gating
1. **Startup Synchronization**: On server initialization, [`apps/api/src/server.ts`](../apps/api/src/server.ts) executes `ensureDuckDBSynchronized()`. If synchronization fails, the HTTP server listener does not start.
2. **Rebuildability**: If DuckDB schema changes or telemetry parity diverges, [`apps/api/src/services/data/duckdb.ts`](../apps/api/src/services/data/duckdb.ts) wipes and re-projects all user events from PostgreSQL.
3. **Projection Failure Invalidation**: If DuckDB projection fails during live telemetry ingestion or updates, the failure is logged and `isSynchronized` is set to `false`. PostgreSQL commits are preserved.
4. **Analytics 503 Gating**: All analytical endpoints enforce `assertDuckDBReady()`. If DuckDB is rebuilding or invalidated, endpoints return `HTTP 503 Service Unavailable` rather than serving stale, corrupted, or synthetic data.

Related source files:
- [`apps/api/src/services/data/duckdb.ts`](../apps/api/src/services/data/duckdb.ts)
- [`apps/api/src/routes/telemetry.ts`](../apps/api/src/routes/telemetry.ts)
- [`apps/api/src/routes/analytics.ts`](../apps/api/src/routes/analytics.ts)
- [`packages/data/src/`](../packages/data/src/)

---

## 4. Canonical Evidence Concepts

The Evidence Model normalizes raw telemetry, user self-reports, intentions, and outcomes into structured, non-overlapping temporal units:

- **Observation** (`ObservationEvidence`): Objective machine telemetry recorded by desktop or browser watchers (`application`, `title`, `cleanTitle`, `domain`, `category`, `isAfk`, `rawEventCount`).
- **Report** (`ReportEvidence`): Subjective user report (`source`, `reportingWindow`, `assessment`, `alignment`, `energy`, `focus`, `note`, `reasons`, `gapReason`, `offlineWorkContext`, `authority: "USER"`).
- **Intention** (`IntentionEvidence`): Declared task or goal target (`targetScope`, `taskId`, `taskTitle`, `goalId`, `goalTitle`, `linkType: "EXPLICIT" | "INFERRED" | "UNKNOWN"`).
- **Outcome** (`OutcomeEvidence`): Recorded task completion or goal achievement (`taskId`, `taskStatus`, `taskCompletedAt`, `goalId`, `goalOutcome`).
- **Provenance** (`EvidenceProvenance`): Provenance lineage recording which systems or collectors corroborated the interval (`source`, `collector`, `authority`).
- **Coverage** (`EvidenceCoverageState`): Epistemic state covering the interval.
- **Temporal Evidence Block** (`TemporalEvidenceBlock`): An atomic or merged interval `[startTime, endTime)` with uniform coverage and identical evidence dimensions.
- **Evidence Timeline** (`EvidenceTimeline`): The complete sequence of contiguous, non-overlapping evidence blocks covering `[windowStart, windowEnd]`, accompanied by mathematical coverage metrics (`coverageRatio`, `observedSeconds`, `unknownSeconds`, etc.).

Related source files:
- [`packages/types/src/evidence.ts`](../packages/types/src/evidence.ts)
- [`packages/analytics/src/evidence/builder.ts`](../packages/analytics/src/evidence/builder.ts)
- [`packages/analytics/src/evidence/slicing.ts`](../packages/analytics/src/evidence/slicing.ts)

---

## 5. Coverage State Contract

Every temporal evidence block has exactly one canonical `EvidenceCoverageState`:

| State | Definition | Concrete Example |
|---|---|---|
| `OBSERVED` | Physical telemetry observed; no user self-report. | ActivityWatch records 20 min in VS Code. |
| `REPORTED` | User report exists; no physical telemetry recorded. | Hourly check-in logged on mobile during an offline meeting. |
| `OBSERVED_REPORTED` | Both physical telemetry and user self-report corroborate the interval. | 30 min browser research accompanied by an hourly check-in. |
| `EXPLAINED_GAP` | Telemetry missing, but accounted for by user gap explanation. | 45 min telemetry absence explained as "Went to college lecture". |
| `UNKNOWN` | No telemetry and no user report recorded for the interval. | 30 min machine suspend with no explanation. |

> [!CAUTION]
> **UNKNOWN ≠ IDLE and UNKNOWN ≠ ZERO.**
> Absence of telemetry must never be classified as idle time, break, or distraction. The system does not invent synthetic zero baselines or assume the user was slacking when sensors were unavailable.

---

## 6. Precedence Rules

For every atomic slice of time, coverage is evaluated against the following strict decision tree:

```text
Telemetry covers interval?
    YES
       ↓
User report also covers it?
    YES → OBSERVED_REPORTED
    NO  → OBSERVED

    NO
       ↓
User report covers interval?
    YES
       ↓
Is the report specifically explaining missing telemetry (UserGapExplanation)?
    YES → EXPLAINED_GAP
    NO  → REPORTED

    NO
       ↓
UNKNOWN
```

---

## 7. Observation vs Report

Physical observation and subjective reflection represent fundamentally different kinds of truth.

### Concrete Example:
- Desktop Telemetry: VS Code active window → `observation.category = "focused"`
- Check-In Report: User self-assessment → `report.assessment = "distracted"`

### Correct Representation:
```typescript
{
  coverage: "OBSERVED_REPORTED",
  observation: {
    application: "Code.exe",
    category: "focused",
    // ...
  },
  report: {
    source: "CHECK_IN",
    assessment: "distracted",
    authority: "USER",
    // ...
  }
}
```

The user's self-assessment does **not** change the sensor observation category to `"distracted"`, nor does the sensor category invalidate the user's subjective report of feeling distracted. Both coexist.

---

## 8. Explained Gaps

When telemetry is absent (machine suspend, lock, or offline period) and the user provides an explanation:
- Telemetry: 10:30–10:45 absent.
- User explanation: *"Had an urgent phone call."*

### Correct Representation:
```typescript
{
  coverage: "EXPLAINED_GAP",
  observation: null,
  report: {
    source: "GAP_EXPLANATION",
    gapReason: "Had an urgent phone call.",
    authority: "USER"
  }
}
```

The gap explanation is **never** transformed into `"distraction"`, `"unproductive"`, or synthetic `"idle"`. Those are analytical interpretations that belong strictly in downstream stages.

---

## 9. Intention and Task Attribution

Task and goal attribution in Phase 3 follows a strict explicit-only guardrail:
- **`linkType: "EXPLICIT"`**: Assigned only when an authoritative link exists (`WorkSession.taskId`, `checkIn.taskId`, `gapExplanation.associatedTaskId`).
- **`intention: null`**: Assigned when no explicit link exists.

Phase 3 does **not** perform heuristic task attribution based on application name, window title string matching, or temporal proximity.

---

## 10. Outcome Separation

What the user did, what the user felt, and what outcome occurred are separate signals:
- **Observation**: 45 minutes spent in VS Code.
- **Report**: Check-in declaring high energy and focus.
- **Outcome**: Task completion recorded at 10:45 (`taskStatus = "done"`).

Task completion does not retroactively prove that the preceding activity was productive. The completion is an objective milestone isolated in `outcome: OutcomeEvidence`.

---

## 11. Temporal Slicing

To handle arbitrary overlaps between telemetry, check-ins, work sessions, gap explanations, and task completions, the timeline uses atomic boundary slicing:

```text
1. Collect all boundary timestamps (starts, ends, completions) across all inputs.
2. Sort unique timestamps to create contiguous disjoint atomic intervals [start, end).
3. Evaluate evidence precedence and attach dimensions for each atomic interval.
4. Merge adjacent contiguous blocks only if all semantic fingerprints are identical.
```

### Concrete Example:
- Telemetry: 10:00–10:20 (observed), 10:20–10:40 (no telemetry), 10:40–11:00 (observed).
- Check-In: 10:00–11:00 (user report covering the whole hour).

Resulting blocks after atomic slicing and evaluation:
1. `10:00–10:20`: `OBSERVED_REPORTED`
2. `10:20–10:40`: `REPORTED`
3. `10:40–11:00`: `OBSERVED_REPORTED`

---

## 12. Determinism Rules

The evidence engine is strictly deterministic: identical inputs in any array order produce identical output timelines.

### Telemetry Primary Selection (7-Tier Total Ordering):
When multiple telemetry segments overlap an atomic interval:
1. Largest overlap duration
2. Canonical source priority: `desktop` (1) > `browser` (2) > `unknown` (3)
3. Earliest start timestamp
4. Earliest end timestamp
5. Application name (`localeCompare`)
6. Window title (`localeCompare`)
7. Segment ID (`localeCompare`)

### Competing Evidence Records Total Ordering:
- **Check-ins**: `windowStart` → `windowEnd` → `id`
- **Gap explanations**: `startTime` → `endTime` → `id`
- **Work sessions**: `startedAt` → resolved `endedAt` → `id`
- **Tasks / Outcomes**: `completedAt` → `id`

Array order never affects which record is selected.

---

## 13. Multi-Source Telemetry

When desktop ActivityWatch and browser extension telemetry concurrently cover an interval:
- **Primary Observation**: Selected via the deterministic 7-tier total ordering.
- **Multi-Source Provenance**: All overlapping telemetry collectors are preserved in `provenance: EvidenceProvenance[]` (`desktop_telemetry` and `browser_telemetry`).

---

## 14. Semantic Merge Rules

Contiguous adjacent blocks merge if and only if **all** semantic dimensions are identical:
1. `coverage` state is equal.
2. `observationFingerprint(a) === observationFingerprint(b)`: `[application, title, cleanTitle, domain, sanitizedUrl, category, isAfk]`.
3. `reportFingerprint(a) === reportFingerprint(b)`: `[source, reportingWindow, assessment, alignment, energy, focus, note, reasons, gapReason, offlineWorkContext, authority]`.
4. `intentionFingerprint(a) === intentionFingerprint(b)`: `[targetScope, taskId, taskTitle, goalId, goalTitle, linkType, confidence]`.
5. `outcomeFingerprint(a) === outcomeFingerprint(b)`: `[taskId, taskStatus, taskCompletedAt, goalId, goalOutcome]`.

Canonical fingerprint helpers are implemented in [`packages/analytics/src/evidence/slicing.ts`](../packages/analytics/src/evidence/slicing.ts).

---

## 15. AFK vs Screen Lock

- **Explicit OS AFK**: Established only by explicit OS AFK watcher signals (`isAfk: true` or `application === "Away from Keyboard"` or `watcher === "afk"`).
- **Screen Lock**: Activity classified as `"break"` due to screen lock (`LockApp.exe`) retains `category = "break"`, but strictly keeps `isAfk = false`.
- **Missing Telemetry**: Absence of telemetry produces `UNKNOWN`, never AFK or break.

Related source files:
- [`packages/types/src/timeline.ts`](../packages/types/src/timeline.ts)
- [`packages/analytics/src/activity/segments.ts`](../packages/analytics/src/activity/segments.ts)
- [`packages/analytics/src/evidence/builder.ts`](../packages/analytics/src/evidence/builder.ts)

---

## 16. Recomputability

Derived evidence blocks are pure, deterministic projections of authoritative PostgreSQL records. An evidence timeline can be recomputed at any time from raw events and user reports without state drift. Evidence timelines are analytical views, never independent durable sources of truth.

---

## 17. Phase Boundaries

| Phase | Description | Status |
|---|---|---|
| **Phase 1** | Analytics Primitive Correctness (segment aggregation, app normalization, window title sanitization) | **Completed** |
| **Phase 2** | Behavioral Feature Model (session derivation, day features, check-in features, task features) | **Completed** |
| **Foundation Hardening** | PostgreSQL-authoritative DuckDB persistent projection, user isolation, rebuildability, startup gating | **Completed** |
| **Phase 3** | Evidence & Observation Model (atomic boundary slicing, 5-state precedence tree, semantic merge fingerprints, deterministic tie-breaking) | **Completed & Frozen** |
| **Phase 4** | Behavioral Pattern Detection (context switches, hyperfocus, fatigue curves, schedule variance) | *Future* |
| **Phase 5** | Insight Generation (causal correlation between patterns and outcomes) | *Future* |
| **Phase 6** | Analytical Daily/Periodic Synthesis | *Future* |
| **Phase 7** | AI Interpretation, Coaching & Recommendations | *Future* |
| **Phase 8** | Spaced Retrieval & Closed-Loop Retention Engine | *Future* |

---

## 18. What Future Developers MUST NOT Do

> [!CAUTION]
> **Inviolable Invariants:**
> 1. **Do NOT interpret missing telemetry as idle or break.** Missing telemetry is `UNKNOWN`.
> 2. **Do NOT overwrite telemetry classification with self-report.** Keep `observation` and `report` decoupled.
> 3. **Do NOT convert user explanations into causal labels** like `"distraction"` or `"unproductive"`.
> 4. **Do NOT fabricate task attribution.** Only explicit user links produce `linkType: "EXPLICIT"`.
> 5. **Do NOT interpret task completion as proof of productivity.** Outcome is an objective signal decoupled from activity.
> 6. **Do NOT introduce a second competing timeline abstraction.** All downstream analytics must build on `TemporalEvidenceBlock`.
> 7. **Do NOT bypass canonical evidence logic with raw telemetry in Pattern detectors.**
> 8. **Do NOT add AI reasoning before evidence and analytics features are established.**
> 9. **Do NOT treat DuckDB as the durable source of truth.** PostgreSQL is authoritative.
> 10. **Do NOT weaken DuckDB readiness gating.** Analytical routes must return 503 if DuckDB is not synchronized.

---

## 19. Related Source Files

- [`packages/types/src/evidence.ts`](../packages/types/src/evidence.ts): Core type contracts (`TemporalEvidenceBlock`, `EvidenceTimeline`, `EvidenceCoverageState`).
- [`packages/types/src/semantic-timeline.ts`](../packages/types/src/semantic-timeline.ts): `UserGapExplanation` and semantic timeline types.
- [`packages/types/src/timeline.ts`](../packages/types/src/timeline.ts): `TimelineSegment` with explicit `isAfk`.
- [`packages/analytics/src/evidence/builder.ts`](../packages/analytics/src/evidence/builder.ts): `buildEvidenceTimeline()` implementation with deterministic total ordering.
- [`packages/analytics/src/evidence/slicing.ts`](../packages/analytics/src/evidence/slicing.ts): Boundary collection, atomic intervals, and canonical dimension fingerprints.
- [`packages/analytics/src/evidence/types.ts`](../packages/analytics/src/evidence/types.ts): Options and parameters for evidence timeline construction.
- [`packages/analytics/src/activity/segments.ts`](../packages/analytics/src/activity/segments.ts): Raw telemetry event consolidation into human-scale segments.
- [`packages/analytics/src/activity/sessions.ts`](../packages/analytics/src/activity/sessions.ts): Work session derivation logic.
- [`packages/analytics/src/features/`](../packages/analytics/src/features/): Canonical feature extractors (check-in, day, session, task).
- [`packages/data/src/`](../packages/data/src/): DuckDB persistent analytical projection, user isolation, and event ingestion.
- [`apps/api/src/services/data/duckdb.ts`](../apps/api/src/services/data/duckdb.ts): DuckDB connection manager, startup synchronization, and readiness assertion.
- [`apps/api/src/routes/analytics.ts`](../apps/api/src/routes/analytics.ts): Analytics endpoints with DuckDB readiness gating.
- [`apps/api/src/routes/telemetry.ts`](../apps/api/src/routes/telemetry.ts): PostgreSQL-authoritative telemetry ingestion with DuckDB projection invalidation.
- [`apps/api/src/services/analytics/service.ts`](../apps/api/src/services/analytics/service.ts): Daily analytics service consuming canonical feature extractors.
- [`apps/api/src/server.ts`](../apps/api/src/server.ts): Server bootstrap enforcing startup DuckDB synchronization.
- [`apps/api/src/services/activity/`](../apps/api/src/services/activity/): Activity aggregation services.

---

## 20. Tests Reference

[`packages/analytics/src/evidence/evidence.test.ts`](../packages/analytics/src/evidence/evidence.test.ts) provides 19 invariant and regression tests protecting the Evidence Model:

1. **Invariant 1 (Empty Interval)**: Empty intervals produce `UNKNOWN`, never fake idle or zero.
2. **Precedence (Telemetry Only)**: Produces `OBSERVED`.
3. **Precedence (Telemetry + Check-In)**: Produces `OBSERVED_REPORTED`.
4. **Precedence (Explained Gap)**: Produces `EXPLAINED_GAP` without causal degradation.
5. **Partial Overlap**: Slices 50m check-in over fragmented telemetry at exact sub-interval boundaries.
6. **Invariant 2 (Decoupling)**: Subjective check-in assessment does not overwrite physical observation category.
7. **Invariant 5 (Explicit Attribution)**: Explicit task linking vs unlinked planned tasks.
8. **Invariant 6 & 12 (Contiguous Coverage)**: Sum of block durations equals total query window.
9. **Invariant 7 & 13 (Semantic Merging)**: Adjacent blocks merge only when all semantic fingerprints are identical.
10. **Invariant 8 (Provenance)**: Lineage metadata survives transformation into evidence blocks.
11. **Invariant 10 (Outcome Decoupling)**: Task completion is recorded as an outcome, not collapsed into activity.
12. **Invariant 11 (General Determinism)**: Slicing and evaluation are invariant to input array order.
13. **Correction 1 (Semantic Fingerprints)**: Merging preserves all semantic dimensions (`alignment`, `energy`, etc.).
14. **Correction 2 (AFK vs Screen Lock)**: Screen lock keeps `isAfk: false` while explicit AFK sensors set `isAfk: true`.
15. **Correction 3 (Multi-Source Tie-Breaker)**: Deterministic 7-tier tie-breaking and multi-source provenance preservation.
16. **Test A (Check-In Ordering)**: Identical boundary check-ins produce identical output under input reversal.
17. **Test B (Gap Explanation Ordering)**: Identical boundary gap explanations produce identical output under input reversal.
18. **Test C (Work-Session Ordering)**: Identical boundary work sessions produce identical output under input reversal.
19. **Test D (Outcome Ordering)**: Identical completion time tasks produce identical outcome representation under input reversal.
