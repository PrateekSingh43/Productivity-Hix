# ProductiveHix Analytics & Evidence Model

## 1. Purpose

ProductiveHix is not a passive time tracker or raw telemetry logger. It is a closed-loop behavioral analytics and cognitive performance system designed to answer five core questions:
1. *What did I intend to do?* (`Intention`)
2. *What did the system observe?* (`Observation`)
3. *What did I report/experience?* (`Report` / `Reflection`)
4. *What outcome occurred?* (`Outcome`)
5. *What was learned/retained?* (`Retention`)

To maintain epistemic integrity across the analytics lifecycle, the system enforces a strict epistemic principle:

```text
observation
≠ classification
≠ context
≠ alignment
≠ attention
≠ analytics
≠ insight
```

These are progressively derived interpretations, not interchangeable facts. In particular:
- **Unknown is not zero**: The absence of sensor events does not indicate lack of activity or idle time.
- **Unobserved is not automatically idle**: Machine availability issues or unmonitored work are not slacking.
- **Telemetry is not self-report**: Physical sensor recordings (`authority: "SYSTEM"`) and user assessments (`authority: "USER"`) corroborate each other without one overwriting or contaminating the other.
- **Association is not causation**: Statistical correlation between activity and outcomes does not establish causal efficacy.

---

## 2. System Architecture

The ProductiveHix analytics pipeline is organized into strict unidirectional layers:

```text
PostgreSQL (Durable Authoritative Truth)
    ↓
DuckDB Analytical Projection (Derived Analytical Cache)
    ↓
Canonical Analytics & Features (@repo/analytics)
    ↓
Evidence & Observation Model (Temporal Evidence Blocks)
    ↓
Behavioral Pattern Detection (Phase 4 — Future Canonical Detectors)
    ↓
Insight Generation (Phase 5 — Future)
    ↓
Periodic Synthesis & AI Interpretation (Phase 6 & 7 — Future)
```

### Authority Boundaries
- **PostgreSQL**: Sole durable source of truth. Telemetry batches, user check-ins, work sessions, task completions, and gap explanations are committed durably to PostgreSQL before any downstream analytical processing.
- **DuckDB**: In-process, persistent, user-isolated analytical cache. It accelerates aggregation, ranking, and windowing. DuckDB is strictly derived: it holds no durable state that cannot be reconstructed from PostgreSQL.
- **EvidenceTimeline**: Pure derived analytical projection constructed in memory on-demand from authoritative inputs. It is not persisted as a competing source of truth.
- **AI / LLMs**: Downstream interpretation, synthesis, and coaching layer. AI is strictly decoupled and **never** the source of fundamental metrics. AI prompts never receive unaggregated raw telemetry events.

---

## 3. DuckDB Readiness and Consistency

### Synchronization & Readiness Gating
1. **Startup Synchronization**: On server initialization, [`apps/api/src/server.ts`](../apps/api/src/server.ts) executes `ensureDuckDBSynchronized()`. If synchronization fails, the HTTP server listener does not start.
2. **Readiness Flag (`isSynchronized`)**: A module-level flag in [`apps/api/src/services/data/duckdb.ts`](../apps/api/src/services/data/duckdb.ts) tracks whether the analytical projection is verified and ready.
3. **Projection Failure Invalidation**: If DuckDB projection fails during live telemetry ingestion or updates in [`apps/api/src/routes/telemetry.ts`](../apps/api/src/routes/telemetry.ts), `invalidateDuckDBSynchronization()` sets `isSynchronized = false`. PostgreSQL commits are preserved while analytical readiness is revoked.
4. **Analytics 503 Gating**: All analytical endpoints in [`apps/api/src/routes/analytics.ts`](../apps/api/src/routes/analytics.ts) enforce `assertDuckDBReady()`. If DuckDB is rebuilding or invalidated, endpoints throw `DuckDBNotReadyError` returning `HTTP 503 Service Unavailable` rather than serving stale, corrupted, or synthetic data.
5. **Rebuildability**: If DuckDB schema changes or telemetry parity diverges, `rebuildDuckDBFromPostgres()` resets the DuckDB schema and re-ingests all user telemetry events from PostgreSQL.

### Nature of Synchronization Check
The synchronization check performed by `ensureDuckDBSynchronized()` is a **conservative aggregate parity heuristic**:
- Row count parity: `COUNT(*)` in DuckDB matches PostgreSQL count.
- Duration sum parity: `COALESCE(SUM(duration_ms), 0)` in DuckDB matches PostgreSQL sum within a 0.5s tolerance.
- Max timestamp parity: `MAX(timestamp)` in DuckDB matches PostgreSQL within a 1.0s tolerance.

> [!NOTE]
> This is a conservative aggregate synchronization check, not a cryptographic or exact row-by-row projection verification. It guards against dropped batches, in-place update desynchronization, and timestamp drift without prohibitive startup latency.

---

## 4. Evidence Model

The Evidence Model normalizes raw telemetry, user self-reports, intentions, and outcomes into structured, non-overlapping temporal units:

- **Observation (`ObservationEvidence`)**:
  - *Definition*: Objective machine telemetry recorded by desktop or browser watchers (`application`, `title`, `cleanTitle`, `domain`, `category`, `isAfk`, `rawEventCount`).
  - *Authority*: `SYSTEM`.
  - *Constraint*: Must NOT be used to infer user intent, productivity, or subjective focus.
- **Report (`ReportEvidence`)**:
  - *Definition*: Subjective user self-assessment or gap explanation (`source`, `reportingWindow`, `assessment`, `alignment`, `energy`, `focus`, `note`, `reasons`, `gapReason`, `offlineWorkContext`).
  - *Authority*: `USER`.
  - *Constraint*: Must NOT be used to mutate or overwrite physical telemetry categories.
- **Intention (`IntentionEvidence`)**:
  - *Definition*: Declared task or goal target (`targetScope`, `taskId`, `taskTitle`, `goalId`, `goalTitle`, `linkType: "EXPLICIT"`).
  - *Authority*: `USER` or explicit session link.
  - *Constraint*: Must NOT be guessed via heuristic title matching or time proximity.
- **Outcome (`OutcomeEvidence`)**:
  - *Definition*: Recorded task completion or goal achievement milestone (`taskId`, `taskStatus`, `taskCompletedAt`, `goalId`, `goalOutcome`).
  - *Authority*: `USER` / milestone event.
  - *Constraint*: Must NOT be inferred as proof of effort, focus, or productivity during preceding activity.
- **Provenance (`EvidenceProvenance`)**:
  - *Definition*: Source-level identities recording which systems corroborated the interval (`source`, `authority`).
  - *Authority*: `SYSTEM` or `USER`.
  - *Constraint*: Preserves source-level provenance only; does NOT claim raw event lineage or individual collector metadata in `EvidenceTimeline`.
- **Coverage (`EvidenceCoverageState`)**: Canonical epistemic state covering the interval.
- **Temporal Evidence Block (`TemporalEvidenceBlock`)**: A disjoint half-open interval `[startTime, endTime)` with uniform coverage and semantic dimensions.
- **Evidence Timeline (`EvidenceTimeline`)**: Complete sequence of contiguous, non-overlapping evidence blocks covering `[windowStart, windowEnd]`, accompanied by mathematical duration metrics.

Related source files:
- [`packages/types/src/evidence.ts`](../packages/types/src/evidence.ts)
- [`packages/analytics/src/evidence/builder.ts`](../packages/analytics/src/evidence/builder.ts)
- [`packages/analytics/src/evidence/slicing.ts`](../packages/analytics/src/evidence/slicing.ts)

---

## 5. Coverage States

Every temporal evidence block has exactly one canonical `EvidenceCoverageState`:

| State | Meaning | Concrete Example |
|---|---|---|
| `OBSERVED` | Telemetry exists, no user report | ActivityWatch records 20 min in VS Code. |
| `REPORTED` | User report exists, no telemetry | Check-in logged while laptop was asleep during a meeting. |
| `OBSERVED_REPORTED` | Both telemetry and user report exist | 30 min browser research accompanied by an hourly check-in. |
| `EXPLAINED_GAP` | Telemetry missing, but accounted for by user gap explanation | 45 min telemetry absence explained as "Went to doctor". |
| `UNKNOWN` | Neither telemetry nor report exists | 30 min machine suspend with no explanation. |

> [!CAUTION]
> **UNKNOWN ≠ IDLE, UNKNOWN ≠ BREAK, UNKNOWN ≠ DISTRACTION, UNKNOWN ≠ ZERO.**
> Absence of telemetry must never be classified as idle time, break, or distraction. The system does not invent synthetic zero baselines or assume the user was slacking when sensors were unavailable.
> Explicit AFK telemetry (sensor state `isAfk: true`) is fundamentally distinct from an unexplained absence of telemetry (`UNKNOWN`).

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
       Specifically explaining missing telemetry (UserGapExplanation)?
          YES → EXPLAINED_GAP
          NO  → REPORTED

       NO
          ↓
    UNKNOWN
```

---

## 7. Observation versus Report

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

The user's self-assessment does **not** change the sensor observation category to `"distracted"`, nor does the sensor category invalidate the user's subjective report of feeling distracted. Both survive simultaneously.

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

Offline periods, lectures, meetings, phone calls, and offline work with user explanations are represented as `EXPLAINED_GAP`. They are **never** automatically labeled `"idle"`, `"distracted"`, or `"unproductive"`.

---

## 9. Task Attribution

Task and goal attribution in Phase 3 follows a strict explicit-only guardrail:
- **`linkType: "EXPLICIT"`**: Assigned only when an authoritative link exists (`WorkSession.taskId`, `CheckIn.taskId`, `UserGapExplanation.associatedTaskId`).
- **`intention: null`**: Assigned when no explicit link exists.

Phase 3 does **not** perform heuristic task attribution based on application name, window title string matching, semantic classification, or temporal proximity.

---

## 10. Outcomes

What the user did, what the user felt, and what outcome occurred are separate signals:
- **Observation**: 45 minutes spent in VS Code.
- **Report**: Check-in declaring high energy and focus.
- **Outcome**: Task completion recorded at 10:45 (`taskStatus = "done"`).

Task completion is an outcome milestone. It does not retroactively establish how focused the user was, whether the preceding activity was productive, or why the task succeeded. Those require separate analytical evaluation.

---

## 11. Temporal Slicing

To handle arbitrary overlaps between telemetry, check-ins, work sessions, gap explanations, and task completions, the timeline uses atomic boundary slicing:

```text
1. Collect all boundary timestamps (starts, ends, completions) across all input classes.
2. Sort unique timestamps to create contiguous disjoint atomic intervals [start, end).
3. Evaluate evidence precedence and attach dimensions for each atomic interval.
4. Merge adjacent contiguous blocks only if all semantic fingerprints are identical.
```

Intervals use half-open semantics `[start, end)` so boundary events do not cause double-counting.

### Concrete Example:
- Telemetry: 10:00–10:20 (observed), 10:20–10:40 (no telemetry), 10:40–11:00 (observed).
- Check-In: 10:00–11:00 (user report covering the whole hour).

Resulting blocks after atomic slicing and evaluation:
1. `10:00–10:20`: `OBSERVED_REPORTED`
2. `10:20–10:40`: `REPORTED`
3. `10:40–11:00`: `OBSERVED_REPORTED`

---

## 12. Determinism

The evidence engine is strictly deterministic: identical authoritative inputs in any array order produce identical output timelines.

### Telemetry Primary Selection (7-Tier Total Ordering):
When multiple telemetry segments overlap an atomic interval:
1. Largest overlap duration
2. Canonical source priority: `desktop` (1) > `browser` (2) > `unknown` (3)
3. Earliest start timestamp
4. Earliest end timestamp
5. Application name (`localeCompare`)
6. Window title (`localeCompare`)
7. Segment ID (`localeCompare`)

### Competing Secondary Evidence Records Total Ordering:
- **Check-ins**: `windowStart` → `windowEnd` → `id`
- **Gap explanations**: `startTime` → `endTime` → `id`
- **Work sessions**: `startedAt` → resolved `endedAt` → `id`
- **Task outcomes**: `completedAt` → `id`

Array order never affects which record is selected. Stable database identifiers are utilized as final deterministic tie-breakers.

---

## 13. Provenance

The Evidence Model preserves **source-level provenance** for overlapping evidence sources:

### Telemetry Provenance Mapping:
- `desktop` → `desktop_telemetry`
- `browser` → `browser_telemetry`
- `unknown` → `unknown_telemetry`

### Secondary Evidence Provenance:
- `user_gap_explanation` (authority: `USER`)
- `user_check_in` (authority: `USER`)
- `work_session` (authority: `SYSTEM`)

### Multi-Source Representation:
When desktop and browser telemetry concurrently overlap an interval:
- **Primary Observation**: One canonical dominant segment is selected via 7-tier total ordering.
- **Concurrent Source Provenance**: All overlapping source classes are preserved in `provenance: EvidenceProvenance[]` (e.g. both `desktop_telemetry` and `browser_telemetry`).

> [!IMPORTANT]
> **Source-Level vs Lineage**: The current Evidence Model preserves source-level provenance. It does **not** retain raw telemetry event IDs or collector metadata in `EvidenceTimeline`. Do not claim complete raw event lineage exists in the timeline blocks.

---

## 14. Semantic Merge

Contiguous adjacent blocks merge if and only if **all** semantic dimensions are equivalent.

Canonical fingerprints are implemented in [`packages/analytics/src/evidence/slicing.ts`](../packages/analytics/src/evidence/slicing.ts):
1. `coverage` state is equal.
2. `observationFingerprint`: `[application, title, cleanTitle, domain, sanitizedUrl, category, isAfk]`.
3. `reportFingerprint`: `[source, reportingWindow.start, reportingWindow.end, assessment, alignment, energy, focus, note, reasons, gapReason, offlineWorkContext, authority]`.
4. `intentionFingerprint`: `[targetScope, taskId, taskTitle, goalId, goalTitle, linkType, confidence]`.
5. `outcomeFingerprint`: `[taskId, taskStatus, taskCompletedAt, goalId, goalOutcome]`.

> [!NOTE]
> Provenance is not a merge-breaking semantic field. When adjacent blocks are semantically equivalent across observation, report, intention, and outcome, their provenance entries are combined and deduplicated via `deduplicateProvenance()`.

---

## 15. AFK versus Screen Lock versus Missing Telemetry

The system distinguishes three separate conditions:
- **Explicit AFK Signal**: Established only by explicit OS AFK watcher signals (`isAfk: true` or `application === "Away from Keyboard"` or `watcher === "afk"`). Sets `observation.isAfk = true`.
- **Screen Lock**: Activity classified as `"break"` due to screen lock (`LockApp.exe`) retains `category = "break"`, but strictly keeps `isAfk = false`.
- **Missing Telemetry**: Absence of telemetry produces `UNKNOWN`, never AFK or break.

```text
break classification ≠ AFK sensor state ≠ missing telemetry
```

Related source files:
- [`packages/types/src/timeline.ts`](../packages/types/src/timeline.ts)
- [`packages/analytics/src/activity/segments.ts`](../packages/analytics/src/activity/segments.ts)
- [`packages/analytics/src/evidence/builder.ts`](../packages/analytics/src/evidence/builder.ts)

---

## 16. Recomputability

Derived evidence blocks are pure, deterministic projections of authoritative PostgreSQL records:
```text
same authoritative inputs + same code/version = same evidence timeline
```

An evidence timeline can be recomputed at any time from raw events and user reports without state drift. Evidence timelines are derived analytical views, never independent durable sources of truth or persisted ledgers.

---

## 17. Existing Legacy Analytics

The new canonical Phase 4 behavioral-pattern architecture is not yet implemented or frozen.

A legacy `productivityPatterns()` compatibility path currently exists in `@repo/analytics` and is consumed by `apps/api/src/services/analytics/service.ts` to satisfy backward-compatibility requirements for legacy UI consumers.

This legacy path remains completely separate from the Phase 3 Evidence Model and must not become a competing semantic source of truth for future canonical detectors.

---

## 18. Phase Boundaries

| Phase | Description | Status |
|---|---|---|
| **Phase 1** | Analytics Primitive Correctness (segment aggregation, app normalization, window title sanitization) | **Completed** |
| **Phase 2** | Behavioral Feature Model (session derivation, day features, check-in features, task features) | **Completed** |
| **Foundation Hardening** | PostgreSQL-authoritative DuckDB persistent projection, user isolation, rebuildability, startup gating | **Completed** |
| **Phase 3** | Evidence & Observation Model (atomic boundary slicing, 5-state precedence tree, semantic merge fingerprints, deterministic tie-breaking, unknown source provenance) | **Completed & Frozen** |
| **Phase 4** | Canonical Behavioral Pattern Detection (context switches, hyperfocus, fatigue curves, schedule variance) | *Future* |
| **Phase 5** | Insight Generation (causal correlation between patterns and outcomes) | *Future* |
| **Phase 6+** | Analytical Daily/Periodic Synthesis, AI Interpretation & Retention Engine | *Future* |

---

## 19. Future Developer Prohibitions

> [!CAUTION]
> **Inviolable Invariants:**
> 1. **Do NOT interpret missing telemetry as idle or break.** Missing telemetry is `UNKNOWN`.
> 2. **Do NOT overwrite telemetry classification with self-report.** Keep `observation` and `report` decoupled.
> 3. **Do NOT convert user explanations into causal labels** like `"distraction"` or `"unproductive"`.
> 4. **Do NOT fabricate task attribution.** Only explicit links produce `linkType: "EXPLICIT"`.
> 5. **Do NOT interpret task completion as proof of productivity.** Outcome is an objective signal decoupled from activity.
> 6. **Do NOT introduce a second competing timeline abstraction.** All downstream analytics must build on `TemporalEvidenceBlock`.
> 7. **Do NOT bypass the Evidence Model with raw telemetry in future canonical detectors.**
> 8. **Do NOT add AI reasoning before evidence and analytics features are established.**
> 9. **Do NOT treat DuckDB as the durable source of truth.** PostgreSQL is authoritative.
> 10. **Do NOT weaken DuckDB readiness gating.** Analytical routes must return HTTP 503 if DuckDB is not synchronized.
> 11. **Do NOT label unknown telemetry as desktop provenance.** Use `unknown_telemetry`.
> 12. **Do NOT claim complete raw event lineage when only source-level provenance is preserved.**
> 13. **Do NOT treat legacy `productivityPatterns()` as the canonical Phase 4 detector.**

---

## 20. Related Source Files

- [`packages/types/src/evidence.ts`](../packages/types/src/evidence.ts): Core type contracts (`TemporalEvidenceBlock`, `EvidenceTimeline`, `EvidenceCoverageState`).
- [`packages/types/src/semantic-timeline.ts`](../packages/types/src/semantic-timeline.ts): `UserGapExplanation` and semantic timeline types.
- [`packages/types/src/timeline.ts`](../packages/types/src/timeline.ts): `TimelineSegment` with explicit `isAfk` and `source`.
- [`packages/analytics/src/evidence/builder.ts`](../packages/analytics/src/evidence/builder.ts): `buildEvidenceTimeline()` implementation with deterministic total ordering and `telemetryProvenanceSource()`.
- [`packages/analytics/src/evidence/slicing.ts`](../packages/analytics/src/evidence/slicing.ts): Boundary collection, atomic intervals, and canonical dimension fingerprints.
- [`packages/analytics/src/evidence/types.ts`](../packages/analytics/src/evidence/types.ts): Options and parameters for evidence timeline construction.
- [`packages/analytics/src/evidence/evidence.test.ts`](../packages/analytics/src/evidence/evidence.test.ts): Invariant and regression test suite.
- [`packages/analytics/src/activity/segments.ts`](../packages/analytics/src/activity/segments.ts): Raw telemetry event consolidation into human-scale segments.
- [`packages/analytics/src/activity/sessions.ts`](../packages/analytics/src/activity/sessions.ts): Work session derivation logic.
- [`packages/analytics/src/features/`](../packages/analytics/src/features/): Canonical feature extractors (check-in, day, session, task).
- [`packages/data/src/`](../packages/data/src/): DuckDB persistent analytical projection, user isolation, and event ingestion.
- [`apps/api/src/services/data/duckdb.ts`](../apps/api/src/services/data/duckdb.ts): DuckDB connection manager, startup synchronization, and readiness assertion.
- [`apps/api/src/routes/analytics.ts`](../apps/api/src/routes/analytics.ts): Analytics endpoints with DuckDB readiness gating.
- [`apps/api/src/routes/telemetry.ts`](../apps/api/src/routes/telemetry.ts): PostgreSQL-authoritative telemetry ingestion with DuckDB projection invalidation.
- [`apps/api/src/services/analytics/service.ts`](../apps/api/src/services/analytics/service.ts): Daily analytics service consuming canonical feature extractors and legacy patterns.
- [`apps/api/src/server.ts`](../apps/api/src/server.ts): Server bootstrap enforcing startup DuckDB synchronization.
- [`apps/api/src/services/activity/`](../apps/api/src/services/activity/): Activity aggregation services.

---

## 21. Tests Reference

[`packages/analytics/src/evidence/evidence.test.ts`](../packages/analytics/src/evidence/evidence.test.ts) provides 22 invariant and regression tests protecting the Evidence Model:

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
20. **Test E (Unknown Telemetry Source Provenance)**: Segments with `source: "unknown"` map to `unknown_telemetry`, never falsely to `desktop_telemetry`.
21. **Test F (Provenance Order Invariance with Unknown Source)**: Desktop and unknown overlapping segments produce identical output under input reversal and preserve both source classes.
22. **Test G (Three-Source Provenance)**: Concurrent desktop, browser, and unknown segments preserve all three source-level identities under input permutations.
