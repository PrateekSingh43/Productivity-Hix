# Phase 2 — Domain Model & Semantic Data Architecture

**Document:** `docs/productivehix/timeline/PHASE-2-DOMAIN-MODEL-SEMANTIC-DATA-ARCHITECTURE.md`  
**Status:** CANONICAL ARCHITECTURAL SPECIFICATION & DOMAIN MODEL (FROZEN ARCHITECTURE / PHASE 3A GATED)  
**Scope:** Canonical ProductiveHix domain entities, authoritative vs. derived boundaries, PostgreSQL vs. DuckDB division of responsibilities, observation-backed temporal blocks, the three semantic claim families, queryable evidence structures, recomputation resilience, coverage gaps with 1:N explanations, and the Phase 3 implementation roadmap.

---

## 1. Architectural Intent & Foundational Principles

This document establishes the canonical domain model and data architecture required to implement the **Activity Semantic Model** from [`PHASE-1-ACTIVITY-SEMANTICS-SPEC.md`](file:///c:/Users/prate/ProductiveHix/docs/productivehix/timeline/PHASE-1-ACTIVITY-SEMANTICS-SPEC.md), resolving the structural deficits and semantic leakages audited in [`PHASE-0-CURRENT-SYSTEM-AUDIT.md`](file:///c:/Users/prate/ProductiveHix/docs/productivehix/timeline/PHASE-0-CURRENT-SYSTEM-AUDIT.md).

### 1.1 The Decoupled Epistemic Pipeline
To eliminate semantic conflation and premature hardening of data, ProductiveHix strictly decouples the processing path from physical observation to actionable insight:

```text
AUTHORITATIVE (Source of Truth / Irreplaceable)
┌───────────────────────────┐         ┌───────────────────────────┐
│     USER INTENTION        │         │   NORMALIZED OBSERVATION  │
│ Goals / Tasks / Sessions  │         │ NormalizedActivity        │
│ Rules / Overrides / Gaps  │         │ (Structurally normalized) │
└─────────────┬─────────────┘         └─────────────┬─────────────┘
              │                                     │
              │                                     ▼ [Contributing Observations & Ranges]
              │                       ┌───────────────────────────┐
              │                       │  TEMPORAL ACTIVITY BLOCK  │
              │                       │  Materialized interval    │
              │                       │  projection over events   │
              │                       └─────────────┬─────────────┘
              │                                     │
              ▼                                     ▼
DERIVED / MATERIALIZED (Deterministic & Versioned Projections)
┌─────────────────────────────────────────────────────────────────┐
│ THE THREE SEMANTIC FAMILIES                                     │
│                                                                 │
│ 1. CLASSIFICATION CLAIMS        (SemanticClaim)                 │
│    • modality: MODALITY_PRIMARY, MODALITY_SECONDARY             │
│    • context: TOPIC_CONTEXT (project / subject matter)          │
│    • inferred behavior: INFERRED_BEHAVIOR                       │
│                                                                 │
│ 2. INTENT ASSOCIATIONS          (ActivityContextLink)           │
│    • target: task, goal, project                                │
│    • context relevance: DIRECT, SUPPORTIVE, TANGENTIAL ...      │
│    • intention relationship: ALIGNED, DIVERGENT, UNLINKED       │
│                                                                 │
│ 3. ATTENTION INFERENCE          (AttentionInference)            │
│    • focus evidence state: SUPPORTED, CONTRADICTORY ...         │
│    • interaction continuity & coherence evidence citations      │
└────────────────────────────────┬────────────────────────────────┘
                                 │
                                 ▼
ANALYTICAL SIGNALS (Computed Across Time)
┌─────────────────────────────────────────────────────────────────┐
│ • Transition frequency & context switches per hour              │
│ • Tool continuity ratios & possible fragmentation indicators    │
│ • Sensor coverage vs. accounted coverage ratios                 │
│ • Discrepancy detection (check-in claims vs. observed reality)  │
└────────────────────────────────┬────────────────────────────────┘
                                 │
                                 ▼
ACTIONABLE COGNITIVE INSIGHT & LEARNING RETENTION
```

### 1.2 Inviolable Architectural Principles
1. **Observation $\ne$ Interpretation**: Sensor signals (window titles, URLs, keystrokes, AFK pings) are physical records. They are stored without value judgments and never rewritten.
2. **Three Tiers of Observation**:
   - `[RAW SENSOR OBSERVATION]`: Original, untouched collector payload emitted by local daemons (JSON over HTTP/WebSocket).
   - `[NORMALIZED OBSERVATION]`: Structurally normalized, deduplicated representation (`NormalizedActivity`). This is derived from raw sensor payloads.
   - `[DERIVED SEMANTIC INTERPRETATION]`: Meaning, context, relevance, alignment, and focus derived downstream.
3. **Temporal Containment $\ne$ Semantic Association**: The fact that a task was active while an activity occurred does **not** automatically link that activity to the task. Associations between activity blocks and objectives are explicit semantic relationships.
4. **User Authority $\ne$ Epistemic Certainty**: A user manual override has authoritative user provenance (`provenance = USER_OVERRIDE`, `authority = USER`), but does **not** imply calibrated mathematical certainty (`confidence = 1.00`). Epistemic confidence measures empirical signal strength, whereas authority represents human agency.
5. **Observation-Backed Stable Identity**: Temporal activity blocks derive their identity from their **ordered set of underlying source observations and contribution ranges**, not from transient, generated start/end timestamps.
6. **Dual-Ledger Invariant (Case O)**: ProductiveHix **never manufactures fake sensor telemetry** to match a user report, and **never invalidates a user report** because physical sensors could not observe offline work. Both truths are preserved in an honest dual ledger.
7. **Coverage Gap $\ne$ Unobserved Work**: Telemetry silence is first modeled as a **Coverage Gap**. It is attributed to machine availability states (sleep, shutdown, AFK, disconnect) before determining if offline human work occurred.
8. **Scoped Conservation Invariant**: Conservation of duration ($\sum \text{Durations} = \text{Wall-Clock Time}$) applies strictly to a **single-device foreground focus track**. Concurrent multi-device observations and ambient streams (e.g. background audio) legitimately coexist.
9. **Bounded Recomputability**: Every derived projection must be recomputable from retained canonical inputs to the extent that those inputs preserve the required evidence. Historical information already lost in legacy ingestion is an established property of past data, not a recomputation failure.

---

## 2. Current Persistence Reality Audit

A review of the repository (`packages/db/prisma/schema.prisma`, `packages/data`, and `apps/api/src/services`) establishes the current persistence baseline:

```text
Current Repository Domain Structure

User
├── DailyPlan (unique per [userId, date])
│   └── DailyGoal (order, outcome: ACHIEVED | PARTIALLY | NOT_ACHIEVED | NOT_ASSESSED)
│       └── Task (status, priority, plannedDurationMinutes, dueAt, completedAt)
├── WorkSession (startedAt, endedAt, durationSeconds, source: manual | derived)
├── CheckIn (windowStart, windowEnd, activityAssessment, alignment, reasons, energy, focus)
├── LearningAssessment
│   └── LearningQuestion
│       └── LearningAnswer
├── NormalizedActivity (userId, externalId, bucketId, source, watcher, timestamp, duration, data: JSON)
├── DesktopDevice (platform, osVersion, hostname, lastActiveAt)
├── BrowserInstallation (browser, extensionVersion, userAgent, lastActiveAt)
├── DeviceAuthorization (deviceCode, userCode, status, expiresAt)
├── DeviceToken (tokenHash, source, expiresAt, lastUsedAt)
└── ActivitySyncState (userId, bucketId, cursorAt, syncedAt)
```

### 2.1 Reality by Component

#### A. PostgreSQL (`packages/db/prisma/schema.prisma`)
- **`NormalizedActivity`**: Stores structurally normalized events from ActivityWatch and the Chrome Extension with raw details in an untyped `data: Json` column.
- **`DailyPlan`, `DailyGoal`, `Task`**: Relational planning hierarchy. `Task` has an optional `goalId` foreign key and optional `productiveDate`.
- **`WorkSession`**: Independent table with optional `taskId`.
- **`CheckIn`**: Periodic user reflection record with optional `workSessionId` and `taskId`.
- **Zero Semantic Persistence**: There are currently **no tables** for timeline segments, semantic claims, evidence citations, coverage gaps, user classification rules, or user overrides.

#### B. DuckDB (`packages/data/src`)
- Embedded columnar engine (`DuckDBClient`) wrapping `@duckdb/node-api`.
- Operates on a single table: `telemetry_events`.
- Current queries (`packages/data/src/queries/activity.ts`) execute simple `SUM(duration_ms)` queries without interval normalization or overlap clipping.
- Currently functions as an **in-memory analytical cache/buffer**, not yet an established permanent Parquet archival warehouse.

#### C. Canonical Telemetry Layer Decision (Option A vs. Option B)
- **Current Fact (Option A)**: `NormalizedActivity` is currently the persisted canonical telemetry history in PostgreSQL; raw daemon HTTP batches are transient ingestion payloads.
- **Long-Term Decision (Option B — Deferred to Phase 5)**: Preserving untouched, raw collector JSON payloads in DuckDB Parquet archival is designated as a future storage decision to be evaluated alongside empirical disk consumption benchmarks.

---

## 3. Canonical Records vs. Materialized Derived Projections

ProductiveHix explicitly adopts an **asymmetric architecture** separating canonical, authoritative records from versioned, materialized derived projections:

```text
┌────────────────────────────────────────────────────────────────────────┐
│                        CANONICAL PERSISTED RECORDS                     │
│                        (Source of Truth / Authoritative)               │
├───────────────────┬───────────────────┬────────────────────────────────┤
│ SENSOR TRUTH      │ USER INTENT       │ USER REFLECTION & RULES        │
├───────────────────┼───────────────────┼────────────────────────────────┤
│ • Normalized-     │ • DailyPlan       │ • CheckIn                      │
│   Activity        │ • DailyGoal       │ • UserActivityRule             │
│ • Proposed-       │ • Task            │ • UserActivityOverride         │
│   DeviceHeartbeat │ • WorkSession     │ • UserGapExplanation           │
│   (provisional)   │   (manual)        │ • LearningAssessment           │
└───────────────────┴───────────────────┴────────────────────────────────┘
                                    │
                         DETERMINISTIC EVALUATION
                         & RECOMPUTATION PIPELINE
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                     MATERIALIZED DERIVED PROJECTIONS                   │
│                     (Recomputable / Versioned Projections)             │
├───────────────────┬───────────────────┬────────────────────────────────┤
│ TEMPORAL TRACKS   │ SEMANTIC CLAIMS   │ INTENT & COVERAGE              │
├───────────────────┼───────────────────┼────────────────────────────────┤
│ • Temporal-       │ • SemanticClaim   │ • ActivityContextLink          │
│   ActivityBlock   │ • ClaimEvidence   │ • AttentionInference           │
│ • Block-          │                   │ • TelemetryCoverageGap         │
│   Observation     │                   │ • DailyRollupSummary           │
└───────────────────┴───────────────────┴────────────────────────────────┘
```

### 3.1 Canonical Persisted Records (Authoritative)
These records cannot be regenerated if deleted. They represent physical history, user planning, or explicit human judgment:
- **`NormalizedActivity`**: Deduplicated normalized observations.
- **`ProposedDeviceHeartbeat`**: Hardware availability, suspend, and wake events (provisional signal to be validated in Phase 3).
- **`DailyPlan`, `DailyGoal`, `Task`**: User declared intentions.
- **`WorkSession` (Manual)**: Intentional focus blocks initiated by the user.
- **`CheckIn`**: User reflections recorded at specific moments in time.
- **`UserActivityRule`**: Persistent user mapping rules.
- **`UserActivityOverride`**: Audit log of manual corrections.
- **`UserGapExplanation`**: User's account of offline time.
- **`LearningAssessment`**: Spaced retrieval responses and scores.

### 3.2 Materialized Derived Projections (Recomputable)
These records are deterministic projections generated by running analytical algorithms and semantic classification engines over canonical records:
- **`TemporalActivityBlock`**: Consolidated intervals on a device track.
- **`BlockObservation`**: Relational join connecting a temporal block to its constituent `NormalizedActivity` rows with exact contribution boundaries.
- **`SemanticClaim`**: Specific derived classification assertions (modality, context).
- **`ClaimEvidence`**: Citations linking claims to raw evidence.
- **`ActivityContextLink`**: Inferred or confirmed associations to tasks, goals, or projects.
- **`AttentionInference`**: Evaluated focus evidence states.
- **`TelemetryCoverageGap`**: Materialized missing telemetry spans.
- **`DailyRollupSummary`**: Aggregated daily statistics.

---

## 4. Observation-Backed Temporal Blocks & The Three Semantic Families

A major architectural principle of ProductiveHix is that temporal projection, functional classification, intention alignment, and focus inference are distinct epistemic concerns. We organize all derived semantics into **Three Semantic Families**, each anchored to observation-backed temporal blocks and sharing unified epistemic machinery.

```text
┌────────────────────────────────────────────────────────────────────────┐
│                        TEMPORAL ACTIVITY BLOCK                         │
│             (Materialized Projection over Normalized Events)           │
├────────────────────────────────────────────────────────────────────────┤
│ • id: UUID                                                             │
│ • observationSetFingerprint: hash(sorted contributing event IDs + span)│
│ • startTime, endTime                                                   │
│ • wallClockDurationMs: (endTime - startTime)                           │
│ • observedActiveDurationMs: sum(BlockObservation.contributionDuration) │
│ • pausedDurationMs: (wallClockDurationMs - observedActiveDurationMs)   │
│ • track: FOREGROUND | AMBIENT_AUDIO | BACKGROUND_PROCESS               │
│                                                                        │
│ DENORMALIZED PRESENTATION PROJECTIONS (Copied for query speed)         │
│ • primaryApplication, cleanTitle, domain, sanitizedUrl, sourceChannel  │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ 1
                 ┌──────────────────┼──────────────────┐
                 ▼ *                ▼ *                ▼ *
┌─────────────────────────┐┌─────────────────────────┐┌─────────────────────────┐
│ 1. CLASSIFICATION CLAIM ││ 2. INTENT ASSOCIATION   ││ 3. ATTENTION INFERENCE  │
│ (SemanticClaim)         ││ (ActivityContextLink)   ││ (AttentionInference)    │
├─────────────────────────┤├─────────────────────────┤├─────────────────────────┤
│ • claimType:            ││ • targetScope:          ││ • focusEvidenceState:   │
│   MODALITY_PRIMARY |    ││   TASK | GOAL | PROJECT ││   UNKNOWN |             │
│   MODALITY_SECONDARY |  ││ • taskId, goalId        ││   INSUFFICIENT |        │
│   TOPIC_CONTEXT |       ││ • relevance:            ││   SUPPORTED |           │
│   INFERRED_BEHAVIOR     ││   DIRECT | SUPPORTIVE | ││   CONTRADICTORY         │
│ • value: string         ││   TANGENTIAL | ...      ││ • confidence: Float?    │
│ • confidence: Float?    ││ • intentionRelationship:││ • authority:            │
│ • provenance:           ││   ALIGNED | DIVERGENT ..││   SYSTEM | USER         │
│   SENSOR_OBSERVED |     ││ • confidence: Float?    │└────────────┬────────────┘
│   USER_RULE | OVERRIDE..││ • authority:            │             │
│ • authority:            ││   SYSTEM | USER         │             │
│   SYSTEM | USER         │└────────────┬────────────┘             │
└────────────┬────────────┘             │                          │
             │                          │                          │
             └──────────────────────────┼──────────────────────────┘
                                        ▼ 1
                                ┌─────────────────┐
                                │ CLAIM EVIDENCE  │
                                │ (Citations)     │
                                └─────────────────┘
```

### 4.1 Temporal Durations Disambiguation & Semantic Definition
To avoid mathematical ambiguity, `TemporalActivityBlock` explicitly distinguishes three duration metrics:
1. **`wallClockDurationMs`**: Total elapsed span between `startTime` and `endTime`.
2. **`observedActiveDurationMs`**: True active time, calculated as the exact sum of contributing observation active slices ($\sum \text{contributionDurationMs}$).
3. **`pausedDurationMs`**: Internal carved silence or absorbed idle time ($\text{wallClockDurationMs} - \text{observedActiveDurationMs}$).

> [!IMPORTANT]
> **Semantic Definition of `observedActiveDurationMs`**:  
> `observedActiveDurationMs` represents the exact duration contributed by active telemetry observations ($\sum \text{contributionDurationMs}$). It denotes physical sensor window/tab event presence; it does **NOT** imply human cognitive attention, keyboard/mouse activity, cognitive engagement, focus, or productivity.

### 4.2 Explicit Primary and Secondary Modality
`ClaimType` relationally distinguishes primary from secondary modalities:
- `MODALITY_PRIMARY`: The principal functional modality (e.g. `reading_research`). At most one current primary claim exists per block.
- `MODALITY_SECONDARY`: Auxiliary concurrent modalities (e.g. `media_consumption` for video lecture, or `communication` for background chat). Multiple current secondary claims are permitted.
- `TOPIC_CONTEXT`: Subject matter or repository context (e.g. `ProductiveHix`).
- `INFERRED_BEHAVIOR`: Fine-grained operational behavior (e.g. `code_editing`, `documentation_reading`).

```sql
-- PostgreSQL Partial Unique Index for Primary Modality (Enforced in Phase 3A)
CREATE UNIQUE INDEX idx_semantic_claims_primary_modality_current
ON semantic_claims(block_id)
WHERE claim_type = 'MODALITY_PRIMARY' AND is_current = true;
```

### 4.3 Claim Evidence Integrity Invariant
Each `ClaimEvidence` row supports exactly one semantic assertion. The database schema enforces the invariant:
$$\text{countNonEmpty}(\text{claimId}, \text{linkId}, \text{inferenceId}) = 1$$

```sql
-- PostgreSQL CHECK Constraint for Single Target Enforcement (Enforced in Phase 3A)
ALTER TABLE claim_evidence
ADD CONSTRAINT chk_claim_evidence_single_target
CHECK (num_nonnulls(claim_id, link_id, inference_id) = 1);
```

### 4.4 Temporal Arithmetic Constraints & Integrity Invariants
To prevent impossible temporal states, the database and service layer enforce:
1. `wallClockDurationMs >= 0`, `observedActiveDurationMs >= 0`, `pausedDurationMs >= 0`.
2. `observedActiveDurationMs <= wallClockDurationMs`.
3. `pausedDurationMs = wallClockDurationMs - observedActiveDurationMs`.
4. In `BlockObservation`: `contributionDurationMs = contributionEnd - contributionStart`.
5. **Containment Invariant**: The contribution range `[contributionStart, contributionEnd]` must be strictly bounded within the source `NormalizedActivity` event window and the target `TemporalActivityBlock` window.

---

## 5. Recomputation-Resilient Identity Strategy

### 5.1 Why Generated Timestamps Fail
`startTime` and `endTime` are properties of the derived temporal block. If an aggregation threshold changes (e.g. absorbing 15s transient interruptions vs. 30s), block boundaries shift. Any user override or historical link keyed on a generated timestamp hash is orphaned.

### 5.2 The Observation-Backed Identity Model
Temporal activity blocks derive their identity from their **constituent canonical source observations and contribution boundaries**:

```text
[NormalizedActivity 1] (ID: ev_101) [09:00 - 09:30]
        │
        ├── Contributes [09:00 - 09:20] ──▶ BlockObservation 1 ──▶ [TemporalActivityBlock 1]
        │
        └── Contributes [09:20 - 09:30] ──▶ BlockObservation 2 ──▶ [TemporalActivityBlock 2]
```

1. **`BlockObservation` Join Table with Contribution Boundaries**:
   Records exactly which slice of a `NormalizedActivity` row contributed to a block:
   - `blockId`
   - `activityId`
   - `contributionStart`: Instant where contribution begins.
   - `contributionEnd`: Instant where contribution ends.
   - `contributionDurationMs`: Active duration contributed.
2. **`observationSetFingerprint`**:
   $$\text{observationSetFingerprint} = \text{SHA256}(\text{userId} \,\|\, \text{deviceId} \,\|\, \text{sorted}(\text{activityId} \,\|\, \text{contributionStart} \,\|\, \text{contributionEnd}))$$
3. **User Override Resilience**:
   `UserActivityOverride` targets:
   - `targetTimeWindowStart`, `targetTimeWindowEnd`.
   - `targetApplication`.
   - Optional `targetObservationSetFingerprint`.
   When recomputation runs, it performs an interval join against active overrides. If a newly partitioned block's underlying observations fall within the override window for that application, the user's manual correction is seamlessly applied with `authority = USER` and `provenance = USER_OVERRIDE`.

---

## 6. Intent Relationships: Explicit Associations, Not Temporal Accidents

A major defect identified in Phase 0/1 review is assuming that because a task was active during a time window, all activity in that window belongs to that task.

### 6.1 Separating Relevance from Intention Relationship
In `ActivityContextLink`, we strictly distinguish **where the activity is relevant** from **how it relates to declared intention**:

1. **Target**: Where is this work oriented?
   - `targetScope`: `TASK`, `GOAL`, `PROJECT`, `GENERAL_WORK`, `UNLINKED`.
   - `taskId`, `goalId`, `projectTag`.
2. **Context Relevance**: What kind of functional relationship exists between this activity and the objective?
   - `DIRECT`: Direct execution of task deliverables (e.g. writing code for a feature).
   - `SUPPORTIVE`: Necessary auxiliary work (e.g. reading library documentation, architectural research).
   - `TANGENTIAL`: Loosely related technical context.
   - `UNRELATED`: Has no bearing on the objective.
   - `UNKNOWN`: Insufficient evidence to determine.
3. **Intention Relationship**: How does this activity align with declared intent?
   - `ALIGNED`: Consistent with active goals/plans.
   - `DIVERGENT`: Conflicting with active goals/plans (e.g. entertainment during a scheduled work session).
   - `UNLINKED`: Neutral activity outside explicit focus windows.
   - `UNKNOWN`: Unassessed.

*Key Invariant*: An activity can be `targetScope = GOAL` with `goalId` populated while `taskId = NULL`, supporting daily goals that do not break down into formal tasks.

### 6.2 TargetScope Consistency Mapping Rules
To prevent contradictory or impossible association records, the following formal consistency mapping is enforced:
- **`TASK`**: `taskId` is required; `goalId` is optional (inherited from task or explicit); `projectTag` is optional.
- **`GOAL`**: `goalId` is required; `taskId` must be null.
- **`PROJECT`**: `projectTag` is required; `taskId` and `goalId` must be null.
- **`GENERAL_WORK`**: `taskId`, `goalId`, and `projectTag` must be null.
- **`UNLINKED`**: `taskId`, `goalId`, and `projectTag` must be null.

### 6.3 Cross-Tenant / Cross-User Ownership Consistency
ProductiveHix is fundamentally a user-scoped telemetry and reflection platform. A semantic association crossing users would be catastrophic. The system enforces the following mandatory ownership consistency invariants:
- `TemporalActivityBlock.userId == device.userId`
- `BlockObservation.activity.userId == block.userId`
- `UserGapExplanation.userId == gap.userId`
- `associatedTaskId.userId == block.userId == goal.userId`
These invariants are enforced via service-layer validation and composite foreign-key constraints where practical.

---

## 7. Focus & Distraction: Evidence-Based, Not Prematurely Rigid

Phase 1 explicitly warned against hardcoding rigid formulas or premature psychological vocabulary for cognitive focus.

### 7.1 Focus Evidence States (Not Psychological Enums)
Rather than asserting that the user is "fragmented" or "scattered" as a database enum, the system persists **Qualitative Evidence States**:

```prisma
enum FocusEvidenceState {
  UNKNOWN           // No signals available to evaluate attention
  INSUFFICIENT      // Signals present but inadequate duration or density
  SUPPORTED         // Continuous unbroken input, coherent window context
  CONTRADICTORY     // Mixed signals (e.g. active input during known leisure tab)
}
```

- Inferred attention is captured via `AttentionInference` referencing `TemporalActivityBlock`.
- Quantitative continuity formulas (e.g. `continuityScore`) are **provisional analytical outputs**, not hardcoded psychological scores in the domain schema.

### 7.2 Distraction as an Analytical Interpretation
- The database schema **does not contain a `distractionSignal` or `distractionIndicator` column**.
- "Distraction" is an analytical synthesis derived by comparing:
  1. Observed Modality (e.g. `media_consumption`).
  2. Intent Association (`intentionRelationship = DIVERGENT` vs. `relevance = SUPPORTIVE`).
  3. User Goal and Intentional State.
- An educational tutorial on YouTube is observed as `modality = reading_research` and linked as `relevance = SUPPORTIVE`. It is never branded a distraction by schema default.

---

## 8. Telemetry Coverage Gaps & Dual-Ledger Recovery (1:N Explanations)

Telemetry silence must not be assumed to be slacking or unobserved work. It begins as an uninterpreted **Telemetry Coverage Gap**.

```text
Telemetry Silence Detected Relative to Expected Tracking
                         │
                         ▼
             [TelemetryCoverageGap]
             start, end, durationSeconds
                         │
             Inspect Physical Evidence
                         │
         ┌───────────────┴───────────────┐
         ▼                               ▼
Machine Suspended / Offline      Machine Awake & AFK
(Power State / Sleep Signal)     (AW AFK Daemon Event)
         │                               │
         ▼                               ▼
[SYSTEM_SLEEP / POWER_OFF]        [SENSOR_AFK]
         │                               │
         └───────────────┬───────────────┘
                         ▼
             Reconciliation Evaluation
                         │
         ┌───────────────┴───────────────┐
         ▼                               ▼
No User Explanation Provided     User Submits Explanations (1:N)
         │                               │
         ▼                               ▼
reconciliationState = UNEXPLAINED   [UserGapExplanation 1] (12:00-12:45 Lecture)
                                    [UserGapExplanation 2] (12:45-13:15 Lunch)
                                         │
                                         ▼
                                    reconciliationState = EXPLAINED
```

### 8.1 Decoupling Gap State from 1:N User Explanations
A single telemetry gap (e.g. 12:00–14:00) can legitimately contain multiple human activities (e.g. a 45-minute lecture followed by a 30-minute lunch). ProductiveHix models this as a **1:N relationship**:

1. **`TelemetryCoverageGap` (System Truth)**:
   - `id`, `deviceId`, `startTime`, `endTime`, `durationSeconds`.
   - `coverageState`: `SYSTEM_SLEEP`, `POWER_OFF`, `COLLECTOR_DISCONNECTED`, `SENSOR_AFK`, `UNKNOWN_SILENCE`.
   - `reconciliationState`: `UNEXPLAINED`, `PENDING_PROMPT`, `EXPLAINED`, `DISMISSED`.

2. **`UserGapExplanation` (User Truth — 1:N)**:
   - `id`, `gapId` (foreign key to gap, non-unique), `userId`.
   - `startTime`, `endTime`: Bounded within `[gap.startTime, gap.endTime]`.
   - `explanationType`: `OFFLINE_WORK`, `STUDY_LECTURE`, `REST_BREAK`, `PERSONAL_ERRAND`, `TRAVEL`, `OTHER`.
   - `description`: User-provided text note.
   - `associatedTaskId`, `associatedGoalId`: Optional links to objectives.
   - *Note*: `wasOfflineWork` is derived dynamically from `explanationType` (`OFFLINE_WORK` or `STUDY_LECTURE`).

### 8.2 The Dual Ledger Presentation
The system maintains two parallel ledgers:
- **Sensor Observation Ledger (Ledger A)**: Reports verified active machine time and verified coverage gaps.
- **User Account Ledger (Ledger B)**: Reports verified active machine time plus user-explained offline work and reflections.
- Both metrics are displayed transparently in analytics without manufacturing fake telemetry.

### 8.3 Provisional Gap Attribution Rule for ProposedDeviceHeartbeat
In accordance with bounded recomputability:
- If a coverage gap occurs with **no telemetry and no heartbeat signal**, the gap's `coverageState` **must remain `UNKNOWN_SILENCE`**.
- It must **never** be automatically promoted to `POWER_OFF` or `SYSTEM_SLEEP` until the desktop daemon implementation proves that its OS power hook events are verified and reliably delivered.

---

## 9. Scoped Temporal Conservation & Source Composition

### 9.1 Scoped Conservation Invariants
The mathematical invariant:
$$\sum \text{Durations} \le \text{Wall-Clock Elapsed Time}$$
is **scoped strictly to a single device's foreground focus track**.

1. **Foreground Track**: At any given millisecond, a single device has at most one active foreground window.
2. **Multi-Device Timelines**: If a user runs code on a desktop while reading documentation on a tablet, the account-level timeline records both active tracks. They are **not** forced into an artificial single-device non-overlapping constraint.
3. **Ambient Tracks**: Background audio playback (`is_audible = true`) or background compile jobs are categorized under `track = AMBIENT_AUDIO` or `track = BACKGROUND_PROCESS`. They do not compete with or clip the foreground window duration.

### 9.2 Source Composition
The ambiguous scalar `source = "mixed"` is eliminated. Instead, `sourceChannel` explicitly models source attribution:
- `DESKTOP_WINDOW`: Pure desktop window watcher event.
- `BROWSER_TAB`: Pure browser extension active tab event.
- `COORDINATED_DESKTOP_WEB`: Coordinated integration where browser extension tab metadata enriched a desktop browser window event.

---

## 10. Database Architecture: PostgreSQL vs. DuckDB

### 10.1 Canonical Partitioning of Responsibilities

```text
┌───────────────────────────────────────┬───────────────────────────────────────┐
│ POSTGRESQL (OLTP)                     │ DUCKDB (OLAP)                         │
│ Authoritative Application Store       │ Analytical Execution Layer            │
├───────────────────────────────────────┼───────────────────────────────────────┤
│ • Canonical normalized observations   │ • Columnar execution of interval      │
│   (NormalizedActivity)                │   carving and feature extraction      │
│ • Authoritative user planning         │ • Rapid historical recomputation      │
│   (DailyPlan, DailyGoal, Task)        │   over millions of raw events         │
│ • User reflections & timers           │ • Longitudinal multi-week pattern     │
│   (WorkSession, CheckIn)              │   mining and baseline calculations    │
│ • User rules & overrides              │ • Fast analytical aggregation         │
│   (UserActivityRule, Override, Gap)   │   for daily summaries                 │
│ • Materialized active projections     │ • Parquet analytical archival         │
│   for fast web UI consumption         │   execution                           │
└───────────────────────────────────────┴───────────────────────────────────────┘
```

### 10.2 Provisional Policies (Deferred for Benchmarking)
The following operational details are explicitly designated as **provisional policies** to be calibrated through testing, not rigid architectural requirements:
- **PostgreSQL Pruning Window**: Retaining 30, 60, or 90 days of `NormalizedActivity` in PostgreSQL before relying solely on DuckDB Parquet storage is a provisional tuning parameter.
- **Compression Ratios & Speedups**: Columnar compression factors and recomputation benchmarks will be empirically validated in Phase 5.

---

## 11. Proposed Canonical Relational Schema Specification

Below is the complete, decoupled Prisma schema to be implemented in Phase 3.

```prisma
// ============================================================================
// PRODUCTIVEHIX PHASE 2 CANONICAL RELATIONAL SCHEMA SPECIFICATION
// ============================================================================

enum ActivityModality {
  development
  reading_research
  writing_documentation
  communication
  administration
  media_consumption
  gaming
  idle_away
  system_maintenance
  unknown
}

enum ClaimType {
  MODALITY_PRIMARY
  MODALITY_SECONDARY
  TOPIC_CONTEXT
  INFERRED_BEHAVIOR
}

enum ClaimProvenance {
  SENSOR_OBSERVED
  USER_RULE
  USER_OVERRIDE
  ACTIVE_SESSION_AFFINITY
  CONTEXT_HEURISTIC
  INFERRED
}

enum ClaimAuthority {
  SYSTEM
  USER
}

enum TargetScope {
  TASK
  GOAL
  PROJECT
  GENERAL_WORK
  UNLINKED
}

enum ContextRelevance {
  DIRECT
  SUPPORTIVE
  TANGENTIAL
  UNRELATED
  UNKNOWN
}

enum IntentionRelationship {
  ALIGNED
  DIVERGENT
  UNLINKED
  UNKNOWN
}

enum FocusEvidenceState {
  UNKNOWN
  INSUFFICIENT
  SUPPORTED
  CONTRADICTORY
}

enum TrackType {
  FOREGROUND
  AMBIENT_AUDIO
  BACKGROUND_PROCESS
}

enum CoverageState {
  SYSTEM_SLEEP
  POWER_OFF
  COLLECTOR_DISCONNECTED
  SENSOR_AFK
  UNKNOWN_SILENCE
}

enum ReconciliationState {
  UNEXPLAINED
  PENDING_PROMPT
  EXPLAINED
  DISMISSED
}

enum SourceChannel {
  DESKTOP_WINDOW
  BROWSER_TAB
  COORDINATED_DESKTOP_WEB
}

enum MachinePowerState {
  ACTIVE
  SLEEPING
  POWERED_OFF
  UNKNOWN
}

enum CollectorState {
  CONNECTED
  DISCONNECTED
}

enum InputState {
  ACTIVE
  AFK
}

// ----------------------------------------------------------------------------
// 1. TEMPORAL ACTIVITY BLOCK (Materialized Interval Projection)
// ----------------------------------------------------------------------------
model TemporalActivityBlock {
  id                        String              @id @default(uuid()) @db.Uuid
  userId                    String              @map("user_id") @db.Uuid
  deviceId                  String?             @map("device_id") @db.Uuid

  // Observation Set Identity (hash of contributing observations + contribution ranges)
  observationSetFingerprint String              @map("observation_set_fingerprint")

  // Temporal Bounds & Disambiguated Durations
  startTime                 DateTime            @map("start_time")
  endTime                   DateTime            @map("end_time")
  wallClockDurationMs       Int                 @map("wall_clock_duration_ms")
  observedActiveDurationMs  Int                 @map("observed_active_duration_ms")
  pausedDurationMs          Int                 @default(0) @map("paused_duration_ms")
  track                     TrackType           @default(FOREGROUND)

  // Denormalized Presentation Fields (Copied from observations for query efficiency)
  primaryApplication        String              @map("primary_application")
  cleanTitle                String              @map("clean_title")
  domain                    String?
  sanitizedUrl              String?             @map("sanitized_url")
  sourceChannel             SourceChannel       @default(DESKTOP_WINDOW) @map("source_channel")
  rawEventCount             Int                 @default(1) @map("raw_event_count")
  interactionDensity        Json?               @map("interaction_density")
  sourceComposition         Json?               @map("source_composition")

  // Versioning
  semanticVersion           String              @default("1.0.0") @map("semantic_version")

  createdAt                 DateTime            @default(now()) @map("created_at")
  updatedAt                 DateTime            @updatedAt @map("updated_at")

  // Relations
  user                      User                @relation(fields: [userId], references: [id], onDelete: Cascade)
  device                    DesktopDevice?      @relation(fields: [deviceId], references: [id], onDelete: SetNull)
  observations              BlockObservation[]
  claims                    SemanticClaim[]
  contextLinks              ActivityContextLink[]
  attentionInferences       AttentionInference[]

  @@index([userId, startTime, endTime])
  @@index([observationSetFingerprint])
  @@map("temporal_activity_blocks")
}

// ----------------------------------------------------------------------------
// 2. BLOCK OBSERVATION (Explicit Contributing Observations & Ranges)
// ----------------------------------------------------------------------------
model BlockObservation {
  id                    String              @id @default(uuid()) @db.Uuid
  blockId               String              @map("block_id") @db.Uuid
  activityId            String              @map("activity_id") @db.Uuid

  // Exact Contribution Boundaries
  contributionStart     DateTime            @map("contribution_start")
  contributionEnd       DateTime            @map("contribution_end")
  contributionDurationMs Int                @map("contribution_duration_ms")

  block                 TemporalActivityBlock @relation(fields: [blockId], references: [id], onDelete: Cascade)
  activity              NormalizedActivity    @relation(fields: [activityId], references: [id], onDelete: Cascade)

  @@unique([blockId, activityId, contributionStart])
  @@index([activityId])
  @@map("block_observations")
}

// ----------------------------------------------------------------------------
// 3. SEMANTIC CLAIM (Family 1: Classification Claims)
// ----------------------------------------------------------------------------
model SemanticClaim {
  id                    String              @id @default(uuid()) @db.Uuid
  blockId               String              @map("block_id") @db.Uuid

  claimType             ClaimType           @map("claim_type")
  value                 String              // e.g. "development", "ProductiveHix"
  confidence            Float?              // Calibrated signal strength (0.00 - 1.00), null if uncalibrated
  provenance            ClaimProvenance     @default(INFERRED)
  authority             ClaimAuthority      @default(SYSTEM)

  // Versioning & Explicit Self-Relation Supersession
  engineVersion         String              @map("engine_version")
  ruleSetVersion        String?             @map("rule_set_version")
  evaluatedAt           DateTime            @default(now()) @map("evaluated_at")
  inputFingerprint      String?             @map("input_fingerprint")
  isCurrent             Boolean             @default(true) @map("is_current")
  supersedesId          String?             @map("supersedes_id") @db.Uuid

  block                 TemporalActivityBlock @relation(fields: [blockId], references: [id], onDelete: Cascade)
  supersedes            SemanticClaim?        @relation("ClaimSupersession", fields: [supersedesId], references: [id], onDelete: SetNull)
  supersededBy          SemanticClaim[]       @relation("ClaimSupersession")
  evidence              ClaimEvidence[]

  @@index([blockId, isCurrent])
  @@index([claimType, value, isCurrent])
  @@index([provenance])
  @@map("semantic_claims")
}

// ----------------------------------------------------------------------------
// 4. CLAIM EVIDENCE (Relational Citations of Signal Sources)
// ----------------------------------------------------------------------------
model ClaimEvidence {
  id                    String              @id @default(uuid()) @db.Uuid
  claimId               String?             @map("claim_id") @db.Uuid
  linkId                String?             @map("link_id") @db.Uuid
  inferenceId           String?             @map("inference_id") @db.Uuid

  evidenceType          String              @map("evidence_type") // e.g. "USER_RULE", "PROCESS_NAME", "WINDOW_TITLE"
  evidenceReference     String              @map("evidence_reference") // e.g. "rule:usr_123", "title:React"
  weight                Float               @default(1.0)

  claim                 SemanticClaim?      @relation(fields: [claimId], references: [id], onDelete: Cascade)
  contextLink           ActivityContextLink? @relation(fields: [linkId], references: [id], onDelete: Cascade)
  attentionInference    AttentionInference?  @relation(fields: [inferenceId], references: [id], onDelete: Cascade)

  @@index([claimId])
  @@index([linkId])
  @@index([inferenceId])
  @@map("claim_evidence")
}

// ----------------------------------------------------------------------------
// 5. ACTIVITY CONTEXT LINK (Family 2: Intent Associations)
// ----------------------------------------------------------------------------
model ActivityContextLink {
  id                    String                @id @default(uuid()) @db.Uuid
  blockId               String                @map("block_id") @db.Uuid

  targetScope           TargetScope           @default(UNLINKED) @map("target_scope")
  taskId                String?               @map("task_id") @db.Uuid
  goalId                String?               @map("goal_id") @db.Uuid
  projectTag            String?               @map("project_tag")

  relevance             ContextRelevance      @default(UNKNOWN)
  intentionRelationship IntentionRelationship @default(UNKNOWN) @map("intention_relationship")

  confidence            Float?                // Calibrated confidence, nullable
  provenance            ClaimProvenance       @default(INFERRED)
  authority             ClaimAuthority        @default(SYSTEM)

  block                 TemporalActivityBlock @relation(fields: [blockId], references: [id], onDelete: Cascade)
  task                  Task?                 @relation(fields: [taskId], references: [id], onDelete: SetNull)
  goal                  DailyGoal?            @relation(fields: [goalId], references: [id], onDelete: SetNull)
  evidence              ClaimEvidence[]

  @@index([blockId])
  @@index([taskId])
  @@index([goalId])
  @@map("activity_context_links")
}

// ----------------------------------------------------------------------------
// 6. ATTENTION INFERENCE (Family 3: Attention Inference)
// ----------------------------------------------------------------------------
model AttentionInference {
  id                    String              @id @default(uuid()) @db.Uuid
  blockId               String              @map("block_id") @db.Uuid

  focusEvidenceState    FocusEvidenceState  @default(UNKNOWN) @map("focus_evidence_state")

  confidence            Float?
  provenance            ClaimProvenance     @default(INFERRED)
  authority             ClaimAuthority      @default(SYSTEM)

  block                 TemporalActivityBlock @relation(fields: [blockId], references: [id], onDelete: Cascade)
  evidence              ClaimEvidence[]

  @@index([blockId])
  @@map("attention_inferences")
}

// ----------------------------------------------------------------------------
// 7. TELEMETRY COVERAGE GAP (Materialized Coverage Inactivity Interval)
// ----------------------------------------------------------------------------
model TelemetryCoverageGap {
  id                    String              @id @default(uuid()) @db.Uuid
  userId                String              @map("user_id") @db.Uuid
  deviceId              String?             @map("device_id") @db.Uuid

  startTime             DateTime            @map("start_time")
  endTime               DateTime            @map("end_time")
  durationSeconds       Int                 @map("duration_seconds")

  coverageState         CoverageState       @default(UNKNOWN_SILENCE) @map("coverage_state")
  reconciliationState   ReconciliationState @default(UNEXPLAINED) @map("reconciliation_state")

  createdAt             DateTime            @default(now()) @map("created_at")
  updatedAt             DateTime            @updatedAt @map("updated_at")

  user                  User                @relation(fields: [userId], references: [id], onDelete: Cascade)
  device                DesktopDevice?      @relation(fields: [deviceId], references: [id], onDelete: SetNull)
  explanations          UserGapExplanation[]

  @@index([userId, startTime])
  @@map("telemetry_coverage_gaps")
}

// ----------------------------------------------------------------------------
// 8. USER GAP EXPLANATION (User Truth for Offline Time — 1:N)
// ----------------------------------------------------------------------------
model UserGapExplanation {
  id                    String              @id @default(uuid()) @db.Uuid
  gapId                 String              @map("gap_id") @db.Uuid
  userId                String              @map("user_id") @db.Uuid

  startTime             DateTime            @map("start_time")
  endTime               DateTime            @map("end_time")

  explanationType       String              @map("explanation_type") // "OFFLINE_WORK", "STUDY_LECTURE", "REST_BREAK"
  description           String
  offlineWorkContext    String?             @map("offline_work_context")

  associatedTaskId      String?             @map("associated_task_id") @db.Uuid
  associatedGoalId      String?             @map("associated_goal_id") @db.Uuid

  createdAt             DateTime            @default(now()) @map("created_at")

  gap                   TelemetryCoverageGap @relation(fields: [gapId], references: [id], onDelete: Cascade)
  user                  User                @relation(fields: [userId], references: [id], onDelete: Cascade)
  task                  Task?               @relation(fields: [associatedTaskId], references: [id], onDelete: SetNull)
  goal                  DailyGoal?          @relation(fields: [associatedGoalId], references: [id], onDelete: SetNull)

  @@index([gapId])
  @@map("user_gap_explanations")
}

// ----------------------------------------------------------------------------
// 9. USER ACTIVITY RULE (Declarative Semantic Mapping Engine)
// ----------------------------------------------------------------------------
model UserActivityRule {
  id                    String              @id @default(uuid()) @db.Uuid
  userId                String              @map("user_id") @db.Uuid

  name                  String
  priority              Int                 @default(100) // Lower number = higher priority
  isEnabled             Boolean             @default(true) @map("is_enabled")

  // Matchers
  applicationPattern    String?             @map("application_pattern")
  domainPattern         String?             @map("domain_pattern")
  titlePattern          String?             @map("title_pattern")
  urlPattern            String?             @map("url_pattern")

  // Assigned Semantics
  assignedModality      ActivityModality?   @map("assigned_modality")
  assignedContext       String?             @map("assigned_context")
  defaultRelevance      ContextRelevance?   @map("default_relevance")

  createdAt             DateTime            @default(now()) @map("created_at")
  updatedAt             DateTime            @updatedAt @map("updated_at")

  user                  User                @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, priority])
  @@map("user_activity_rules")
}

// ----------------------------------------------------------------------------
// 10. USER ACTIVITY OVERRIDE (Recomputation-Resilient Manual Correction)
// ----------------------------------------------------------------------------
model UserActivityOverride {
  id                    String              @id @default(uuid()) @db.Uuid
  userId                String              @map("user_id") @db.Uuid

  targetTimeWindowStart DateTime            @map("target_time_window_start")
  targetTimeWindowEnd   DateTime            @map("target_time_window_end")
  targetApplication     String              @map("target_application")
  targetObservationSetFingerprint String?   @map("target_observation_set_fingerprint")

  targetClaimFamily     String              @map("target_claim_family") // "CLASSIFICATION" | "INTENT_ASSOCIATION"
  targetClaimType       String              @map("target_claim_type")   // "MODALITY_PRIMARY" | "TOPIC_CONTEXT" | "RELEVANCE"
  overriddenValue       String              @map("overridden_value")
  associatedTaskId      String?             @map("associated_task_id") @db.Uuid
  reason                String?

  createdAt             DateTime            @default(now()) @map("created_at")
  user                  User                @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, targetTimeWindowStart, targetTimeWindowEnd])
  @@map("user_activity_overrides")
}

// ----------------------------------------------------------------------------
// 11. PROPOSED DEVICE HEARTBEAT (Hardware Availability & Power State Signal)
// [PROVISIONAL - Desktop daemon lifecycle hooks to be investigated in Phase 3]
// ----------------------------------------------------------------------------
model ProposedDeviceHeartbeat {
  id                    String              @id @default(uuid()) @db.Uuid
  userId                String              @map("user_id") @db.Uuid
  deviceId              String              @map("device_id") @db.Uuid

  timestamp             DateTime
  machinePowerState     MachinePowerState   @default(ACTIVE) @map("machine_power_state")
  collectorState        CollectorState      @default(CONNECTED) @map("collector_state")
  inputState            InputState          @default(ACTIVE) @map("input_state")
  batteryLevel          Float?              @map("battery_level")

  user                  User                @relation(fields: [userId], references: [id], onDelete: Cascade)
  device                DesktopDevice       @relation(fields: [deviceId], references: [id], onDelete: Cascade)

  @@index([deviceId, timestamp])
  @@map("proposed_device_heartbeats")
}
```

---

## 12. Implementation Roadmap: Phase 3 Milestones

To prevent coupled failures and ensure validation at each layer, Phase 3 execution is split into **six discrete engineering milestones**. **Phase 3A must be fully implemented, migrated, and verified before proceeding to Phase 3B.**

```text
┌────────────────────────────────────────────────────────────────────────┐
│                      PHASE 3 IMPLEMENTATION ROADMAP                    │
├───────────┬────────────────────────────────────────────────────────────┤
│ MILESTONE │ DELIVERABLES & VERIFICATION GATES                          │
├───────────┼────────────────────────────────────────────────────────────┤
│ Phase 3A  │ Data Model, Migration & DB Constraints (IMMEDIATE NEXT)    │
│           │ • Prisma schema migration and client generation            │
│           │ • PostgreSQL CHECK constraints (ClaimEvidence target)      │
│           │ • PostgreSQL partial unique index (MODALITY_PRIMARY)       │
│           │ • Shared TypeScript interfaces in @repo/types              │
│           │ • Temporal arithmetic & tenant consistency unit tests      │
├───────────┼────────────────────────────────────────────────────────────┤
│ Phase 3B  │ Observation → Temporal Block Pipeline                      │
│           │ • BlockObservation contribution range calculator           │
│           │ • Disambiguated duration math (wall-clock vs active vs gap)│
│           │ • observationSetFingerprint calculation                    │
├───────────┼────────────────────────────────────────────────────────────┤
│ Phase 3C  │ Initial Semantic Classification Engine                     │
│           │ • SemanticClaim & ClaimEvidence generation                 │
│           │ • Primary vs. secondary modality assignment                │
│           │ • Engine versioning & supersession relations               │
├───────────┼────────────────────────────────────────────────────────────┤
│ Phase 3D  │ Intent Associations Engine                                 │
│           │ • ActivityContextLink resolution                           │
│           │ • Decoupled relevance vs. intention relationship           │
│           │ • TargetScope formal mapping validation rules              │
│           │ • Task & goal independent alignment tests                  │
├───────────┼────────────────────────────────────────────────────────────┤
│ Phase 3E  │ Rules & Overrides Engine                                   │
│           │ • UserActivityRule matcher & priority resolution           │
│           │ • Recomputation-resilient UserActivityOverride engine      │
│           │ • Overlap joins against recomputed temporal blocks         │
├───────────┼────────────────────────────────────────────────────────────┤
│ Phase 3F  │ Coverage Gaps & Dual-Ledger Reconciliation                 │
│           │ • TelemetryCoverageGap detection algorithm                 │
│           │ • 1:N UserGapExplanation ingestion & validation            │
│           │ • Dual-ledger API endpoints (Sensor vs. User coverage)     │
└───────────┴────────────────────────────────────────────────────────────┘
```

### 12.1 Explicitly Deferred Scope
- **Phase 4**: Timeline UI redesign (4-facet drawers, dual-ledger timeline visualization, gap explanation prompt modals).
- **Phase 5**: Parquet long-term archival automation, vectorized feature extraction in DuckDB, empirical retention benchmarking.
- **Phase 6**: LLM synthesis, reflective prompts, pattern-to-insight generation.
- **Phase 7**: Real-time cross-device concurrent arbitration.

---

## 13. Phase 2 Specification & Phase 3A Enforcement Requirements

| Architectural Invariant | Specification Status | Phase 3A Implementation Enforcement Target |
|---|---|---|
| **`ClaimEvidence` Single Target** | Architecturally Specified | PostgreSQL `CHECK (num_nonnulls(claim_id, link_id, inference_id) = 1)` |
| **Primary Modality Uniqueness** | Architecturally Specified | PostgreSQL Partial Unique Index on `(block_id)` WHERE `claim_type = 'MODALITY_PRIMARY' AND is_current = true` |
| **Duration Arithmetic Consistency** | Architecturally Specified | Validation/DB checks: `observedActiveDurationMs <= wallClockDurationMs`, `paused = wallClock - active` |
| **Contribution Range Containment** | Architecturally Specified | Service invariant & unit test: `contributionStart >= block.start AND contributionEnd <= block.end` |
| **TargetScope Consistency Mapping** | Architecturally Specified | Service-layer validation in Phase 3D enforcing formal `targetScope` entity mapping rules |
| **Cross-Tenant Ownership Consistency** | Architecturally Specified | Service-layer validation & composite checks ensuring zero cross-tenant entity linkage |
| **Provisional Heartbeat Silence Rule** | Architecturally Specified | Algorithm invariant: `no telemetry + no heartbeat = UNKNOWN_SILENCE` (never auto-promoted to `POWER_OFF`) |

This document represents the frozen, canonical Phase 2 specification. Implementation begins strictly with **Phase 3A**.
