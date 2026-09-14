# ProductiveHix — Phase 4: Behavioral Pattern Detection Architecture & Design Specification

```text
Document Status: FINAL DESIGN SPECIFICATION
Phase 4 Implementation Status: NOT STARTED
Phase 3 Dependency: FROZEN (docs/analytics-evidence-model.md)
Code Changes in This Task: NONE
```

> [!NOTE]
> **Specification Finality Notice**: The architectural boundaries, data flow, epistemic contracts, detector interfaces, orchestration lifecycles, and mathematical formulas in this document are **final**. Numerical thresholds marked `CANDIDATE` or `TBD — REQUIRES EMPIRICAL CALIBRATION` are intentionally open configuration parameters that must be calibrated against longitudinal telemetry fixtures prior to production enablement, and must not be arbitrarily invented during implementation.

---

## 1. Purpose & Architectural Role

Phase 4 is responsible for detecting **recurring, measurable behavioral patterns** and **canonical behavioral episodes** across validated evidence timelines and canonical analytical features.

Phase 4 does **not** evaluate raw ActivityWatch telemetry, does **not** generate coaching narratives, does **not** prescribe behavioral interventions, does **not** make psychological diagnoses, and does **not** build predictive machine-learning models. Its sole role is **statistical detection with deterministic output contracts** and quantification of behavioral patterns from validated upstream representations.

### Architectural Pipeline
```text
Authoritative Data Layer (PostgreSQL)
      ↓
Analytical Projection Layer (DuckDB persistent cache)
      ↓
Phase 1 Primitives Layer (@repo/analytics — segments, apps, titles)
      ↓
Phase 2 Canonical Features Layer (@repo/analytics — sessions, days, tasks, check-ins)
      ↓
Phase 3 Evidence & Observation Model (@repo/analytics — EvidenceTimeline, atomic slicing)
      ↓
Phase 4 Behavioral Pattern Detection (FINAL SPECIFICATION — episodes & recurring patterns)
      │
      ├── TIER 1 — EPISODE MEASUREMENT (single bounded behavioral instances)
      └── TIER 2 — PATTERN DETECTION (recurring relationships across episodes/days)
      ↓
Phase 5 Insight Generation (Future — causal hypotheses between patterns and outcomes)
      ↓
Phase 6+ Periodic Synthesis, AI Interpretation & Closed-Loop Retention (Future)
```

> [!IMPORTANT]
> **Core Architectural Rule**: Phase 4 detects and quantifies patterns; it does not generate coaching narratives or recommendations. Pattern detection produces structured, evidence-backed pattern objects that Phase 5 (Insights) and Phase 6/7 (Synthesis/AI) interpret.

---

## 2. Epistemic Hierarchy & Strict Non-Goals

Phase 4 preserves all epistemic separations established across the ProductiveHix architecture:

```text
observation
≠ classification
≠ context
≠ alignment
≠ attention
≠ analytics
≠ episode
≠ pattern
≠ explanation
≠ cause
≠ recommendation
≠ diagnosis
```

### Core Epistemic Invariants
- **Episode ≠ Pattern**: An episode-level measurement is a single bounded behavioral instance. It does not automatically become a pattern-level detection. A single episode can **never** produce `level: "PATTERN"` or pattern execution status `executionStatus: "DETECTED"` without satisfying pattern qualification rules.
- **Statistic ≠ Pattern**: A statistical primitive (such as a rank correlation or median) provides a quantitative measurement. It does not automatically become a behavioral pattern without qualifying evidence, baseline contrast, and recurrence.

### Inviolable Telemetry Axioms
- **`UNKNOWN ≠ IDLE`**: Absence of telemetry is strictly unmonitored time. It must never be treated as zero activity, a break, or distraction.
- **`UNKNOWN ≠ BREAK`**: A machine suspend or unrecorded interval is not a restorative break.
- **`UNKNOWN ≠ ZERO`**: A detector must never manufacture a zero baseline or claim zero switches across missing telemetry.
- **`UNKNOWN ≠ DISTRACTION`**: Unmonitored time cannot be labeled as procrastination or off-task behavior.

### Phase 4 Strict Non-Goals
To prevent architectural scope creep, Phase 4 strictly excludes:
1. **No Natural Language Coaching**: Does not generate conversational advice, tips, or motivational prose.
2. **No Prescriptive Recommendations**: Does not tell the user to adopt techniques (e.g. Pomodoro), block websites, or adjust their schedule.
3. **No Psychological Diagnoses**: Does not diagnose ADHD, burnout, executive dysfunction, depression, or anxiety.
4. **No Causal Assertions**: Does not assert why a user behaved in a certain way or claim behavior *caused* an outcome.
5. **No Raw Telemetry Re-Parsing**: Does not bypass the Evidence Model to inspect raw ActivityWatch event JSONs.
6. **No Fake Precision**: Does not output uncalibrated statistical significance figures or arbitrary confidence percentages.
7. **No Predictive Modeling**: Does not claim out-of-sample prediction ($R^2$, machine learning classifiers) until an explicit predictive methodology with temporal train/test validation is established.
8. **No Overwriting Upstream Data**: Does not modify evidence blocks, feature records, or database rows.
9. **No Replacement of User Reflection**: Does not override user self-assessments or gap explanations.

---

## 3. Statistical Detection with Deterministic Output Contracts

Phase 4 does **not** require fixed-threshold deterministic methodology. Detectors may utilize:
- Robust order-statistic measures (e.g. median, interquartile range);
- Rank statistics (e.g. Kendall $\tau_b$);
- Recurrence fractions and proportions;
- Baseline comparisons (e.g. delta ratios against personal historical distributions);
- Calibrated empirical thresholds;
- Explicitly approved statistical primitives.

What must remain deterministic is the **semantic output contract**.

### Semantic Determinism Contract
For identical:
```text
authoritative inputs
+
detector configuration
+
baseline data
+
detector version
```
the detector must produce identical semantic output regardless of input array ordering.

Semantic determinism strictly governs:
- Evaluation Identity (`evaluationId`);
- Metric values and statistical results;
- Evidence references and bounding windows;
- Baseline values and delta ratios;
- Reliability tier and evidence quality factors;
- Execution status (`executionStatus`);
- Trajectory results and calculation statuses.

**Canonical Array Ordering Invariant**:
All order-sensitive output arrays (e.g., `evidenceReferences.contributingSessionIds`, `contributingTaskIds`, `epistemicCaveats`) **MUST** be sorted in a canonical deterministic order (e.g., alphabetically ascending by ID or string value) prior to hashing or output. This guarantees stable serialization and `deepEqual` parity.

### Evaluation Identity vs Result Snapshot & Mandatory Audit Reconstruction
The architecture explicitly decouples the identity of the evaluation from its mutable semantic result:
- **`evaluationId`**: Represents the **deterministic identity of the detector evaluation for a given temporal window, configuration, and baseline strategy** (Evaluation Identity). To prevent string concatenation collisions, `evaluationId` MUST be generated by hashing an unambiguous canonical JSON structured serialization (fixed property ordering, canonical UTF-8, no insignificant whitespace) of: `userId`, `detectorIdentity`, `windowStartUTC`, `windowEndUTC`, `detectorVersion`, `configurationVersion`, `baselineStrategy`, `attributionMode`. All timestamps must be strictly ISO 8601 UTC strings.
- **`configurationVersion`**: Identifies the complete canonical semantic configuration used by the detector. Any change to a threshold, boundary, attribution rule, gap rule, baseline rule, or other behavior-affecting parameter MUST produce a new configuration version.
- **Authoritative Result & Supersession**: The current semantic result is authoritative for downstream consumption (Phase 5 Insights). Within the operational pattern store, the latest evaluated semantic result **supersedes** prior results for the same `evaluationId` (in-place revision upon reevaluation).
- **Mandatory Audit Reconstruction**: The system **MUST maintain an append-only evaluation audit log (`PatternEvaluationLog`)** recording each supersession event:
  - `evaluationId`;
  - `previousGeneratedAt` and `newGeneratedAt`;
  - `supersessionCause` (e.g. `NEW_TELEMETRY_ARRIVED`, `TASK_LINK_MODIFIED`, `BASELINE_RECOMPUTED`, `DETECTOR_VERSION_BUMP`);
  - Triggering entity reference ID(s);
  - Previous metric snapshot and execution status.
  - **Canonical Serialization Rule**: Canonicalization applies to arrays, ID arrays, evidence references, triggering entity IDs, and nested result collections within the audit snapshot. Object property ordering MUST also use a canonical serialization strategy if the snapshot participates in hashing or comparison.
- **Operational Metadata**: Physical execution timestamps such as `generatedAt` or `computedAt` are operational metadata and are **explicitly excluded** from `evaluationId` hashing and deterministic `deepEqual` equality tests.

---

## 4. Approved Statistical Primitives & Zero-Denominator Rules

> [!IMPORTANT]
> **Statistical Primitive ≠ Behavioral Pattern**  
> A statistical primitive provides a quantitative measurement used inside a detector. A behavioral pattern requires a detector-specific unit of analysis, evidence qualification, data sufficiency, recurrence or comparison criteria, baseline rules, and reliability assessment. Phase 4 is **not** a generic correlation engine; generic correlation discovery across arbitrary features is strictly prohibited.

The approved statistical primitives for Phase 4 production detectors are:

### 1. Deterministic Percentile Convention & Median
- **Deterministic Percentile Convention**: All percentiles in Phase 4 (including median, IQR boundaries, and historical duration percentiles) are calculated via standard linear interpolation between closest ranks (NIST / Hyndman-Fan Method 7 / NumPy default):
  For an ordered ascending sequence $x_1 \le x_2 \le \dots \le x_N$ with 1-based indexing, the virtual position for percentile $p \in [0, 1]$ is:
  $$h = 1 + (N - 1)p$$
  Let $i = \lfloor h \rfloor \in \{1, \dots, N\}$ and fractional component $f = h - i \in [0, 1)$. The interpolated percentile value is:
  $$P_p = (1 - f)x_i + f x_{i+1}\quad (\text{with } P_p = x_N \text{ when } h = N)$$
  - **Deterministic Tie-Breaking**: Identical numerical observations preserve stable index ordering; percentile ranks are strictly deterministic.
- **Median**: Calculated as the 50th percentile ($p = 0.50$) of the ordered observation sequence via the deterministic percentile convention above.

### 2. Interquartile Range (IQR)
- **Definition**: $\text{IQR} = Q_3 - Q_1$, the difference between the 75th percentile ($p = 0.75$) and 25th percentile ($p = 0.25$) of the ordered observation sequence computed via the deterministic percentile convention.
- **Application**: Robust order-statistic measure of statistical dispersion that does not require specifying a parametric distribution for its basic calculation.

### 3. Delta Ratio
- **Definition**: Relative deviation of an observed metric from a baseline reference:
  $$\text{deltaRatio} = \frac{\text{currentValue} - \text{baselineValue}}{\text{baselineValue}}$$
- **Denominator & Zero Rule**: If $\text{baselineValue} \le 0$ or is `null`, $\text{deltaRatio} = \text{null}$ with comparison status `comparisonStatus = "UNDEFINED_ZERO_BASELINE"`. No `Infinity`, `NaN`, or silent coercion is permitted.
- **Applicability Boundary**: Relative `deltaRatio` is populated **only** when the detector's baseline strategy authorizes relative delta-ratio comparison on **strictly positive unsigned magnitude metrics** (e.g. `switchesPerHour`). It must **never** be applied to signed deviation metrics (such as `startDeltaMinutes`), distributional tolerances, recurrence frequencies, or percentile ranks; in those contexts, `deltaRatio = null`.

### 4. Proportions & Recurrence Fractions
- **Definition**: The fraction of qualifying observation units (e.g. qualifying workdays) that satisfy an operational criterion:
  $$\text{recurrenceFraction} = \frac{N_{\text{qualifying satisfying criterion}}}{N_{\text{total qualifying in window}}}$$
- **Denominator Rule**: If $N_{\text{total qualifying in window}} = 0$, $\text{recurrenceFraction} = \text{null}$, and the detector emits `executionStatus = "INSUFFICIENT_EVIDENCE"`.
- **Application**: Quantification of **recurrence frequency** (the proportion of qualifying observation units satisfying an operational criterion) over rolling longitudinal windows. (Note: Recurrence frequency measures the proportion of qualifying units; it does not assume continuous temporal persistence).

### 5. Kendall's Tau-b ($\tau_b$)
- **Definition**: A non-parametric rank correlation coefficient measuring monotonic association between two ordered variables ($X, Y$):
  $$\tau_b = \frac{P - Q}{\sqrt{(P + Q + T_X)(P + Q + T_Y)}}$$
  Where:
  - $P$ = number of concordant pairs: $(x_i - x_j)(y_i - y_j) > 0$
  - $Q$ = number of discordant pairs: $(x_i - x_j)(y_i - y_j) < 0$
  - $T_X$ = number of pairs tied only on $X$: $x_i = x_j \text{ and } y_i \neq y_j$
  - $T_Y$ = number of pairs tied only on $Y$: $x_i \neq x_j \text{ and } y_i = y_j$
- **Tie Accounting & All-Tied Degeneracy**: Kendall's $\tau_b$ **explicitly accounts for ties through the tau-b formulation**. If all observations on $Y$ are identical (all sessions tied), $P = Q = 0$, the denominator is $0$, and $\tau_b = \text{null}$ with `calculationStatus = "ALL_TIED"`, `trendStatus = "STABLE"`, and `direction = "NO_TREND"`. It must never divide by zero or emit `NaN`.
- **Application**: Canonical trend statistic for ordered intra-day session degradation (Detector 7).

### 6. Endpoint Ratio ($R_{\text{endpoint}}$)
- **Definition**: The ratio of the final observation metric to the initial observation metric in an ordered sequence:
  $$R_{\text{endpoint}} = \frac{S_K}{S_1}$$
  Where $S_1$ is the metric value of the first qualifying session and $S_K$ is the metric value of the last qualifying session.
- **Zero & Undefined Denominator Rules**:
  - If $S_1 == 0$ and $S_K == 0 \implies R_{\text{endpoint}} = 1.0$ (no endpoint shift observed).
  - If $S_1 == 0$ and $S_K > 0 \implies R_{\text{endpoint}} = \text{null}$ with `endpointStatus = "UNDEFINED_ZERO_BASELINE"`.
  - If $S_1 > 0$ and $S_K == 0 \implies R_{\text{endpoint}} = 0.0$ (complete reduction).
  - If either $S_1$ or $S_K$ is `null` $\implies R_{\text{endpoint}} = \text{null}$.
  - No `Infinity`, `NaN`, or unhandled language-level divide-by-zero exceptions may be emitted.
- **Null Endpoint Ratio Rule**: When $R_{\text{endpoint}} = \text{null}$, endpoint-based classification checks are marked unavailable, and the detector falls back strictly to rank trend criteria ($\tau_b$). Numeric threshold comparisons against `null` are strictly prohibited.

---

## 5. Longitudinal Dependence, Inferential Boundaries & Statistical Significance

### Repeated Measurements & Longitudinal Dependence Boundary
Observations gathered from the same user across hours, sessions, and calendar days are **repeated measurements** from a single individual. They are inherently subject to serial correlation, circadian rhythms, habituation, and day-of-week effects.

**Inviolable Specification Boundaries**:
1. **No Silent Independence Assumptions**: Ordinary cross-sectional statistical assumptions (such as independent and identically distributed observations) must **not** be applied to within-user longitudinal telemetry.
2. **Longitudinal Dependence Boundary**: As established in NIST methodological guidance on uncertainty and time-series analysis, serial autocorrelation violates the independence assumptions underlying conventional standard errors and uncertainty calculations. Repeated autocorrelated measurements require specialized time-series treatment.
3. **Missingness Remains Missing**: Missing telemetry (`UNKNOWN`) is never imputed with synthetic values. Missing observations directly reduce sample size.
4. **Descriptive Rank Statistics Preferred**: Descriptive rank statistics (e.g. Kendall $\tau_b$) are preferred over parametric inferential models until a formally validated longitudinal methodology is approved.
5. **OLS / $R^2$ Rejection Rationale**: Ordinary Least Squares (OLS) regression and $R^2$ predictive claims are not approved for current Phase 4 production detectors because the present objectives do not require them and the relevant longitudinal dependence / model assumptions have not been validated.

### Trend Statistic ≠ Inferential Significance
Phase 4 formally decouples four distinct concepts:
1. **Trend / Effect Statistic**: The calculated numeric magnitude of association (e.g. $\tau_b = -0.65$ or $\text{deltaRatio} = +0.80$).
2. **Evidence Sufficiency**: Whether the observation sample meets structural minimums (episode counts, day counts, active duration, telemetry coverage).
3. **Reliability**: The evidence-quality classification tier (`HIGH`, `MODERATE`, `LOW`, `PROVISIONAL`).
4. **Inferential Significance**: Rejection of a null hypothesis under an explicit distributional model ($p < \alpha$).

> [!CAUTION]
> **No Uncalibrated P-Values**: Kendall $\tau_b$ is exposed strictly as a **descriptive effect statistic**. It must **never** be presented as a probability that a behavioral assertion is true. Uncalibrated $p$-values must **not** be used as a gate for `DETECTED` status. If formal inferential hypothesis testing is introduced in a future revision, that revision must explicitly specify null and alternative hypotheses, serial dependence corrections, multiple-testing adjustments, and validation methodology. No alpha threshold may be invented during implementation.

### Rejection of Cross-Window Tau Misuse
Evaluating an aggregate metric across different window sizes (e.g. a 14-day aggregate value vs a 120-day aggregate value) produces exactly two data points. Two aggregated observations are insufficient for the intended longitudinal habit trend interpretation.

> [!WARNING]
> **Misuse Prohibited**: "14-day $\tau$ vs 120-day $\tau$" must **never** be described or implemented as a canonical per-user habit-stability statistic. A within-user rank trend requires an ordered series of discrete qualifying observation units (e.g. session ordinals $k = 1, \dots, K$). Cross-user aggregate comparisons remain research tools and are strictly excluded from Phase 4 production detectors.

### Binary Association Statistics
While Kendall $\tau_b$ handles discrete and tied values, it is not universally optimal for all binary coincidence questions. Binary overlap/agreement questions (e.g. task completion vs intention matching) may in future research warrant Cohen's kappa ($\kappa$) or Jaccard similarity. However, these are **not** part of Phase 4 production scope and must not be introduced ad hoc during implementation.

---

## 6. Episode-to-Pattern Promotion & Shared Sufficiency Contract

### Canonical Promotion Flow
An episode observation never directly triggers a pattern detection. Phase 4 strictly enforces this five-step promotion pipeline:

```text
Episode measurements (Tier 1 bounded instances)
    ↓
Qualifying episodes (evaluated against episode-level data quality filters)
    ↓
Detector-specific aggregation / recurrence / trend (across qualifying episodes)
    ↓
Baseline comparison (against historical non-overlapping personal baseline)
    ↓
Pattern qualification (evaluated against PatternSufficiency contract)
    ↓
Semantic Output (DETECTED / NO_PATTERN / INSUFFICIENT_*)
```

> [!IMPORTANT]
> **Promotion Invariant**: A Tier-2 pattern can **never** be `DETECTED` merely because a single episode crosses a threshold. Each detector must define its pattern-level aggregation method. Numerical minimums remain `CANDIDATE` or `TBD — REQUIRES EMPIRICAL CALIBRATION`.

### Shared Pattern Sufficiency Contract
To prevent arbitrary, per-file sufficiency logic, Tier 2 pattern detectors share a common architectural contract with **optional, detector-governed dimensions**:

```typescript
export interface PatternSufficiency {
  minimumQualifyingEpisodes?: number | null;
  minimumDistinctCalendarDays?: number | null;
  minimumUsableCoverage?: number | null;          // e.g. 0.85 (85%)
  minimumBaselineMaturityDays?: number | null;     // e.g. 14 or 30 days
  detectorSpecificRecurrenceRequirement?: number | null; // e.g. recurrenceFraction >= 0.60
  requiredEvidenceQuality: {
    allowReportedOnly: boolean;           // Always false for physical telemetry
    allowExplainedGap: boolean;           // Context-dependent
    maxUnknownFraction: number;           // e.g. 0.15 (15%)
  };
  unknownHandling: "INTERRUPT_CONTINUITY" | "TERMINATE_EPISODE" | "INDETERMINATE_IF_EXCEEDED";
}
```

> [!NOTE]
> **Detector-Applicable Dimensions**:
> - Numeric value: The dimension is **actively enforced** as a detector-specific override.
> - `null`: The dimension is **not applicable** to this detector and actively disables that dimension for the detector.
> - Omitted field: Inherit the global default.
> 
> The shared contract standardizes conceptual evaluation dimensions across detectors without forcing every detector into an identical scalar shape:
> - Detector 6 enforces `minimumDistinctCalendarDays` and `detectorSpecificRecurrenceRequirement` (recurrence frequency).
> - Detector 7 enforces ordered session count within a single day without requiring multi-day counts.
> - Detector 4 enforces repeated task instance sample size.
> - Detector 1 enforces minimum qualifying session duration and coverage.

---

## 7. Personal Baseline Architecture, Temporal Boundaries & Lifecycle

Baseline comparison is a first-class detector input:
$$\text{Current Qualifying Evidence} + \text{Historical Personal Baseline} \longrightarrow \text{Detector Comparison}$$

### Temporal Boundaries & Strict Anti-Leakage Invariant
> [!IMPORTANT]
> **Global Anti-Leakage Invariant**: The current evaluation window $[T_{\text{eval\_start}}, T_{\text{eval\_end}})$ **MUST NEVER** contribute observations to the historical baseline against which that same evaluation is judged.
> The historical baseline window $[T_{\text{base\_start}}, T_{\text{base\_end}})$ must strictly precede the evaluation window:
> $$T_{\text{base\_end}} \le T_{\text{eval\_start}}$$
> Contemporaneous or subsequent data entering the baseline constitutes statistical leakage and is strictly prohibited.
> 
> **Pattern-Level vs Instance-Level Chronology**:
> - **Tier 2 Pattern-Level Baseline**: When evaluating a recurring behavioral pattern across a window $[T_{\text{eval\_start}}, T_{\text{eval\_end}})$, the baseline population consists exclusively of qualifying observations completed strictly before $T_{\text{eval\_start}}$. An earlier task instance occurring inside the current window (e.g. on Day 4 of a 14-day window) **MUST NEVER** enter the baseline used to evaluate the 14-day recurring pattern.
> - **Tier 1 Episode-Level Baseline**: An individual episode or task instance measurement may be compared against historical instances completed strictly prior to that specific episode's start timestamp.

### Baseline Temporal Specification per Detector
All calendar-day boundaries are defined using canonical half-open interval notation $[T_{\text{start}}, T_{\text{end}})$ interpreted strictly in the **authoritative user local timezone** (`user.timezone`). The default rolling evaluation window includes the current live day. Because the evaluation window includes the current day, the result can change during the day; pattern evaluation is not necessarily final until the orchestration lifecycle marks the day/window as finalized.

| Detector | Evaluation Window | Baseline Window | Temporal Relationship | Baseline As-Of Time | Compared Metric & Method |
|---|---|---|---|---|---|
| **1. Context Switching** | $[D-13\text{ 00:00}, D+1\text{ 00:00})_{\text{local}}$ | $[D-43\text{ 00:00}, D-13\text{ 00:00})_{\text{local}}$ | Immediately preceding non-overlapping 30-day window | $D-13\text{ 00:00}_{\text{local}}$ | `switchesPerHour` median across all qualifying sessions via `deltaRatio` |
| **2. Task Fragmentation** | Episode: Bounded task episode<br>Pattern: $[D-13\text{ 00:00}, D+1\text{ 00:00})_{\text{local}}$ | Historical completed task episodes strictly before $T_{\text{eval\_start}}$ | Preceding completed task episodes strictly before evaluation window start | $T_{\text{eval\_start}}$ (Pattern) / `episode.startTime` (Episode) | `wallClockFragmentationRatio` median comparison (absolute contrast) |
| **3. Continuous Activity** | Bounded continuous interval (Tier 1 Episode) | Historical lookback of continuous episodes $[D-30\text{ 00:00}, D\text{ 00:00})_{\text{local}}$ | Preceding episodes strictly before continuous episode start | `episode.startTime` | `continuousDurationMinutes` percentile rank against historical distribution (Model B) |
| **4. Schedule Variance** | Scheduled tasks in $[D-13\text{ 00:00}, D+1\text{ 00:00})_{\text{local}}$ | Historical completed scheduled tasks strictly before $T_{\text{eval\_start}}$ | Preceding scheduled tasks strictly before evaluation window start | $T_{\text{eval\_start}}$ | `startDeltaMinutes` distributional variance against historical baseline tolerance (NOT deltaRatio) |
| **5. Task Start Friction** | Committed tasks in $[D-13\text{ 00:00}, D+1\text{ 00:00})_{\text{local}}$ | Historical committed tasks in same duration class strictly before $T_{\text{eval\_start}}$ | Preceding committed tasks strictly before evaluation window start | $T_{\text{eval\_start}}$ | `latencyMinutes` median ratio (`frictionRatio`) |
| **6. Sustained Focus** | $[D-13\text{ 00:00}, D+1\text{ 00:00})_{\text{local}}$ | $[D-27\text{ 00:00}, D-13\text{ 00:00})_{\text{local}}$ | Strictly non-overlapping preceding 14-day window | $D-13\text{ 00:00}_{\text{local}}$ | `recurrenceFraction` absolute qualification + baseline-informed subtyping |
| **7. Stability Shift** | Ordered session series within day $D$ | First qualifying session of day $D$ ($S_1$) | Earliest session strictly preceding subsequent sessions ($S_2 \dots S_K$) | $S_1.\text{endTime}$ | Descriptive `dwellCompressionRatio` ($S_K / S_1$) in metrics; `deltaRatio` ($(S_K - S_1) / S_1$) in baseline |

### Authoritative Timezone Governance
Calendar-day windows ($D$, $D-13$, midnight boundaries, day-close) are evaluated strictly according to the **authoritative user/application timezone configured in the upstream user profile or temporal settings** (`user.timezone`). Phase 4 does **not** independently reinterpret timestamps or default to UTC midnight. If no timezone is configured, the system falls back to the authoritative repository default timezone.

### Baseline Lifecycle Concepts
1. **Cold Start**: The initial period where a user has insufficient historical observations to compute a reliable personal baseline. Detectors requiring baselines must emit `INSUFFICIENT_BASELINE_DATA` during cold start. (Exception: Tier-1 Episode Detectors like Detector 3 qualify continuous episodes via candidate absolute duration floors during cold start, reporting `comparisonStatus = "INSUFFICIENT_BASELINE_DATA"` for historical ranking without blocking episode qualification).
2. **Minimum Baseline Maturity**: The minimum quantity of qualifying historical observations required before a baseline is eligible for comparison (e.g. $\ge 14$ days with $\ge 5$ qualifying sessions for Detector 1, *CANDIDATE*).
3. **Update Policy**: Baselines are recomputed periodically (e.g. daily reconciliation in DuckDB) or event-driven upon episode finalization. Baseline updates occur independently from detector evaluations.
4. **Regime Change / Baseline Reset**: Structural life events (e.g. vacation, role change, illness) shift behavioral baselines. The architecture permits future explicit baseline reset markers.

---

## 8. Phase 4 Two-Tier Architecture: Episode vs Pattern

```text
                 PHASE 4 ARCHITECTURE
                          │
        ┌─────────────────┴─────────────────┐
        │                                   │
   TIER 1: EPISODES                    TIER 2: PATTERNS
        │                                   │
Single bounded behavioral instance    Recurring relationship/trend
evaluated over one window/session     verified across multiple episodes & days
        │                             (or multi-session intra-day sequence)
        │                                   │
  Episode Metric Output               Behavioral Pattern Output
```

### 1. Episode Level (`level: "EPISODE"`)
An evaluation of a single bounded behavioral instance spanning a defined temporal interval $[start, end)$:
- *Definition*: Measures what occurred during one continuous work session, one task execution attempt, or one continuous activity interval.
- *Rule*: **An episode observation is never a pattern.** A single session with 25 switches/hr is a high-switching episode, not a behavioral trait.
- *Execution Status*: Emits `EpisodeExecutionStatus` (`"QUALIFIED" | "NOT_QUALIFIED" | "INSUFFICIENT_EVIDENCE" | "INDETERMINATE_COVERAGE"`). `QUALIFIED` describes an individual Tier-1 episode satisfying that detector's episode qualification criteria. `DETECTED` describes a Tier-2 behavioral pattern satisfying recurrence/pattern criteria over a population or window. Neither status implies the other. An episode can **never** emit `"DETECTED"`.
- *Output Contract*: Produces `EpisodeMeasurementOutput`.

### 2. Pattern Level (`level: "PATTERN"`)
A measurable recurring relationship, structural tendency, or temporal shift verified against a personal baseline:
- *Definition*: Measures whether a behavioral dynamic consistently recurs across multiple independent episodes and days (or across an ordered multi-session sequence within a day).
- *Intra-Day Pattern Exception (Detector 7)*: Detector 7 is an explicit intra-day pattern exception (`scale: "INTRA_DAY"`). Unlike longitudinal recurring patterns, its unit of analysis is a single calendar day containing an ordered sequence of multiple independent sessions ($\ge 3$ sessions). Pattern qualification requires ordered multi-session degradation within that day rather than calendar-day recurrence.
- *Execution Status*: Emits `PatternExecutionStatus` (`"DETECTED" | "NO_PATTERN" | "INSUFFICIENT_EVIDENCE" | "INSUFFICIENT_BASELINE_DATA" | "INDETERMINATE_COVERAGE"`).
- *Output Contract*: Produces `BehavioralPatternOutput`.

### Classification of the Seven Canonical Detectors

| Detector | Operational Level | Primary Unit of Analysis | Output Mode |
|---|---|---|---|
| **1. Context Switching** | Episode Metric $\rightarrow$ Pattern | Session $\rightarrow$ 14-day rolling window | `GENERAL` or `TASK_LINKED` |
| **2. Task Execution Fragmentation** | Episode Metric $\rightarrow$ Pattern | Task episode $\rightarrow$ Multi-task window | `TASK_LINKED` (primary) |
| **3. Extended Continuous Observed Activity** | Episode Detector | Individual continuous interval | `GENERAL` |
| **4. Schedule Variance** | Task Instance $\rightarrow$ Pattern | Planned task $\rightarrow$ Multi-task window | `TASK_LINKED` |
| **5. Task Start Friction** | Task Instance $\rightarrow$ Pattern | Commitment window $\rightarrow$ Multi-task window | `TASK_LINKED` |
| **6. Sustained Focus Pattern** | Recurring Pattern | 14-day rolling window | `GENERAL` or `TASK_LINKED` |
| **7. Behavioral Stability Shift** | Intra-Day Pattern Exception | Ordered sequential sessions within a day | `GENERAL` |

---

## 9. Task Attribution Modes: TASK_LINKED vs GENERAL

A detector must explicitly declare its operational attribution mode. It cannot dynamically or silently switch modes during evaluation.

### TASK_LINKED Mode
- **Requirement**: Evaluates evidence blocks where `intention.linkType === "EXPLICIT"`.
- **Valid Authoritative Links**:
  - `WorkSession.taskId`
  - `CheckIn.taskId`
  - `UserGapExplanation.associatedTaskId`
- **Behavior with Unlinked Evidence**: Evidence blocks with `intention === null` are strictly excluded from task-specific metrics.
- **Rule**: Phase 4 does not perform heuristic, keyword, or window-title task matching.
- **Intentional Epistemic Trade-Off**: Task-linked detectors may have lower activation coverage for users who do not create explicit task associations. This is an intentional epistemic trade-off rather than a signal to weaken attribution requirements. Any future inferred attribution mechanism must be separately specified as an upstream contract.

### GENERAL Mode
- **Requirement**: Evaluates behavioral dynamics across wall-clock sessions regardless of task attribution.
- **Behavior**: Evaluates physical activity represented by qualifying Phase 3 evidence (transitions, continuous dwell times, or stability shifts across all qualifying active telemetry, independent of declared goals).

---

## 10. Authoritative Planned Start & Commitment Semantics

Detectors measuring schedule deviation or start latency require an authoritative planned or commitment timestamp.

### Audit of Existing Repository Models (`packages/types` & `schema.prisma`)
The current repository entities provide:
- **`Task`**: `createdAt`, `updatedAt`, `dueAt`, `completedAt`, `plannedDurationMinutes`, `productiveDate`.
  - ⚠️ `Task` has **NO** `plannedStart` timestamp.
  - ⚠️ `Task` has **NO** `commitmentTime` timestamp.
  - ⚠️ `dueAt` is a completion deadline, **not** a scheduled start time.
  - ⚠️ `productiveDate` is a calendar date (`YYYY-MM-DD`), **not** a timestamp.
- **`WorkSession`**: `startedAt`, `endedAt`, `durationSeconds`, `targetDurationMinutes`.
  - ⚠️ `WorkSession` records actual execution start (`startedAt`), **not** a planned future start target.

### Canonical Prerequisite Matrix per Detector
To prevent coupling un-scheduled tasks to scheduling concepts, prerequisites are decoupled:

| Detector | Required Authoritative Source | Prohibited Substitutions | Status |
|---|---|---|---|
| **Detector 4 (Schedule Variance)** | `plannedStart` timestamp on Task | `Task.createdAt`, `Task.dueAt`, check-in timestamp | ⚠️ **BLOCKED** from production awaiting schema `plannedStart` |
| **Detector 5 (Task Start Friction)** | `commitmentTime` timestamp or commitment event | `Task.createdAt`, `Task.dueAt`, first activity timestamp | ⚠️ **BLOCKED** from production awaiting schema `commitmentTime` |

---

## 11. Canonical Context Identity & Terminal Dwell Rules

### Canonical Context Key Definition
To avoid ambiguity across browser domains, window titles, and desktop applications, context identity is normalized via a strict canonical key:
1. **Browser Telemetry** (`observation.category === "browser"` or watcher is browser):
   - The canonical context key is strictly the web domain: `"browser:" + observation.domain` (e.g. `"browser:github.com"`).
   - Browser domain normalization is inherited from authoritative upstream representations (Phase 1 / Phase 2); Phase 4 does **not** invent additional ad hoc domain normalization.
   - Browser application differences (e.g. Chrome vs Firefox) navigating the same domain map to the identical context key.
2. **Non-Browser Telemetry**:
   - The canonical context key is strictly the application executable: `"app:" + observation.application` (e.g. `"app:Code.exe"`).
3. **Missing Context Identity as a Switch Boundary**:
   - Blocks where both `observation.application === null` and `observation.domain === null` **terminate the current switching sequence as a boundary**.
   - Example: `VS Code → missing context → Chrome` does **not** become a `VS Code → Chrome` switch; it is treated as a terminated sequence and a fresh start. Switches are **never** inferred across missing-context boundaries.
4. **Context Equality**:
   - Two contiguous segments share the same context if and only if their canonical context keys are identical. Transitions between segments sharing the identical key do not count as context switches.

### Terminal Dwell Inclusion Rule
In a sequence of contiguous context segments within an observation session (e.g. `VS Code 10m → Chrome 2m → VS Code 15m` *EXAMPLE*):
- There are $2$ context switches.
- **Dwell Interval Definition**: A dwell interval is defined as each contiguous context segment within the qualifying observation interval, **including the terminal segment**.
- In the example above, the dwell distribution evaluated for median and IQR is strictly:
  $$\text{Dwells} = [10\text{ min}, 2\text{ min}, 15\text{ min}]\quad (\text{EXAMPLE})$$
- *Rationale*: Excluding the terminal dwell artificially truncates the longest sustained periods, biasing the distribution toward short segments that ended in a switch.

---

## 12. Detector-by-Detector Specification

Every detector is defined through a formal 9-stage pipeline:
$$\text{INPUT} \rightarrow \text{ELIGIBILITY} \rightarrow \text{EPISODE FORMATION} \rightarrow \text{METRIC} \rightarrow \text{AGGREGATION} \rightarrow \text{BASELINE} \rightarrow \text{QUALIFICATION} \rightarrow \text{STATUS} \rightarrow \text{OUTPUT}$$

---

### Detector 1: Context Switching Detector
- **Identity**: `context_switching_density`
- **Taxonomy**: `context_dynamics`
- **Operational Level**: Episode Metric $\rightarrow$ Recurring Pattern
- **Mode**: `GENERAL` (default) or `TASK_LINKED`
- **Target**: Quantifies the rate and distribution of transitions between distinct software environments within active sessions.

#### 1. Unit of Analysis & Window Maturity vs Evidence Sufficiency
- **Episode Level**: A single bounded active `WorkSession` episode (derived via `deriveSessions()`).
- **Pattern Level**: A 14-day rolling window $[D-13\text{ 00:00}, D+1\text{ 00:00})_{\text{local}}$.
- **Window Maturity vs Evidence Sufficiency**:
  - **Window Maturity**: First pattern evaluation requires $\ge 14$ elapsed calendar days (*CANDIDATE*) of historical timeline since initial recording. `initialRecordingTime` is explicitly defined as the exact `startTime` of the earliest qualifying Phase-3 evidence block whose coverage state is `OBSERVED` or `OBSERVED_REPORTED`. If $< 14$ calendar days have elapsed, the rolling window is immature and cannot be evaluated.
  - **Evidence Sufficiency**: Within a mature 14-day window, requires $\ge 5$ qualifying sessions (*CANDIDATE*) across $\ge 3$ distinct calendar days (*CANDIDATE*).
  - **Status Rule**: If the window is mature ($\ge 14$ elapsed calendar days) but contains fewer than the required qualifying sessions or days, the detector emits `executionStatus = "INSUFFICIENT_EVIDENCE"` (not immature window).

#### 2. Qualifying Evidence & Complete Episode Metric Set
- **Qualifying Evidence**: `TemporalEvidenceBlock` intervals with `coverage === "OBSERVED"` or `"OBSERVED_REPORTED"` and valid canonical context key.
- **Continuity Interruption**: An `UNKNOWN` gap, break boundary, or missing context identity terminates the switch sequence.
- **Complete Episode Metric Set**:
  Every evaluated episode deterministically computes and outputs:
  1. **`switchesPerHour`** (Primary Density Metric, Mandatory):
     $$\text{switchesPerHour} = \frac{\text{switchCount}}{\text{qualifyingObservedActiveDurationHours}}$$
     Where $\text{qualifyingObservedActiveDurationHours}$ is the exact cumulative active duration of segments used to construct the switch sequence.
     - **Zero Denominator Rule**: If $\text{qualifyingObservedActiveDurationHours} \le 0 \implies \text{switchesPerHour} = \text{null}$, and the episode emits `executionStatus = "INSUFFICIENT_EVIDENCE"`.
  2. **`medianDwellSeconds`** (Distributional Central Tendency, Mandatory):
     Median duration across all contiguous context dwell segments in the session, calculated via the deterministic percentile convention (Section 4.1), strictly including the terminal dwell.
  3. **`interquartileDwellSeconds`** (Distributional Dispersion, Mandatory):
     $\text{IQR} = Q_3 - Q_1$ across all contiguous context dwell segments in the session, computed via the deterministic percentile convention.
  4. **`shortContextFraction`** (Distributional Tail, Auxiliary):
     $$\text{shortContextFraction} = \frac{N(\text{dwell segments with duration} < 30\text{ seconds (CANDIDATE)})}{N_{\text{total dwell segments in session}}}$$
     - Zero Denominator Rule: If $N_{\text{total dwell segments in session}} \le 0 \implies \text{shortContextFraction} = \text{null}$.

#### 3. Pattern Aggregation, Baseline & Formal Qualification Pipeline
Evaluation proceeds through this strict 5-stage qualification pipeline:
1. **Qualifying Evidence Sufficiency**:
   - Requires $\ge 5$ qualifying sessions (*CANDIDATE*) across $\ge 3$ distinct calendar days (*CANDIDATE*) in $[D-13\text{ 00:00}, D+1\text{ 00:00})_{\text{local}}$.
   - Each qualifying session must satisfy an active duration floor $\ge 30$ minutes (*CANDIDATE*) and usable telemetry coverage $\ge 85\%$ (*CANDIDATE*).
   - If not satisfied $\implies \text{executionStatus} = \text{"INSUFFICIENT_EVIDENCE"}$.
2. **Baseline Maturity & Anti-Leakage Boundary**:
   - Baseline population consists of all qualifying historical sessions completed in the immediately preceding non-overlapping 30-day window $[D-43\text{ 00:00}, D-13\text{ 00:00})_{\text{local}}$.
   - Requires $\ge 14$ days of baseline history (*CANDIDATE*) with $\ge 5$ qualifying historical sessions (*CANDIDATE*).
   - **Strict Anti-Leakage Rule**: Baseline population is evaluated across all qualifying historical sessions meeting the eligibility filters; it does **not** filter by subjective "comparable session durations". No session occurring on or after $D-13\text{ 00:00}_{\text{local}}$ may enter this baseline.
   - If baseline maturity is not satisfied $\implies \text{executionStatus} = \text{"INSUFFICIENT_BASELINE_DATA"}$.
   - Baseline reference value: $\text{baselineMedianSwitchesPerHour} = \text{median}(\text{switchesPerHour across all qualifying historical baseline sessions})$.
3. **Current-Window Metric Calculation & Coverage Aggregation**:
   - Compute $\text{currentMedianSwitchesPerHour}$ as the median of `switchesPerHour` across all qualifying sessions in $[D-13\text{ 00:00}, D+1\text{ 00:00})_{\text{local}}$.
   - **Telemetry Coverage Aggregation Formula**:
     $$\text{meanTelemetryCoverageRatio} = \frac{\sum_{i=1}^M \text{observedActiveSeconds}_i}{\sum_{i=1}^M \text{sessionDurationSeconds}_i}$$
     Where $i = 1, \dots, M$ indexes all qualifying sessions in the window.
   - If $\text{meanTelemetryCoverageRatio} < 0.85$ (*CANDIDATE 85%*) or cumulative active duration is $0 \implies \text{executionStatus} = \text{"INDETERMINATE_COVERAGE"}$.
4. **Calibrated Baseline Contrast & Zero-Baseline Guard**:
   $$\text{deltaRatio} = \frac{\text{currentMedianSwitchesPerHour} - \text{baselineMedianSwitchesPerHour}}{\text{baselineMedianSwitchesPerHour}}$$
   - **Zero-Baseline Rule**: If $\text{baselineMedianSwitchesPerHour} \le 0 \implies$ relative delta unavailable $\implies$ `comparisonStatus = "UNDEFINED_ZERO_BASELINE"`. Evaluate `absoluteElevatedSwitchThreshold` $\implies$ if threshold passes, contrast criterion passes $\implies$ continue normal recurrence/final decision logic. The detector **MUST NEVER** emit `INSUFFICIENT_BASELINE_DATA` for a mature zero baseline.
   - Contrast criterion:
     - If `comparisonStatus != "UNDEFINED_ZERO_BASELINE"`: $\text{deltaRatio} \ge \text{switchContrastThreshold}$ (*TBD*; candidate $+0.50$).
     - If `comparisonStatus == "UNDEFINED_ZERO_BASELINE"`: $\text{currentMedianSwitchesPerHour} \ge \text{absoluteElevatedSwitchThreshold}$ (*TBD*; candidate $6.0$ switches/hr).
5. **Recurrence Frequency Requirement**:
   $$\text{elevatedSessionFraction} = \frac{N(\text{qualifying sessions with switchesPerHour} > \text{comparisonThreshold})}{N_{\text{total qualifying sessions in window}}}$$
   - Where $\text{comparisonThreshold} = \text{baselineMedianSwitchesPerHour}$ (if $> 0$), else $\text{absoluteElevatedSwitchThreshold}$.
   - Recurrence criterion: $\text{elevatedSessionFraction} \ge \text{switchRecurrenceThreshold}$ (*TBD*; candidate $0.60$, ensuring at least 60% of sessions exhibit elevated switching).

**Deterministic Output Status Assignment**:
- `executionStatus: "DETECTED"`: Both Contrast Criterion (Step 4) and Recurrence Criterion (Step 5) are satisfied.
- `executionStatus: "NO_PATTERN"`: Steps 1–3 pass, but Contrast Criterion or Recurrence Criterion is not met (e.g. switching rate is within personal baseline bounds or elevated switching is an isolated single-session spike).
- `executionStatus: "INSUFFICIENT_BASELINE_DATA"`: Baseline fails Step 2.
- `executionStatus: "INSUFFICIENT_EVIDENCE"`: Current window fails Step 1.
- `executionStatus: "INDETERMINATE_COVERAGE"`: Excessive unmonitored time fails Step 3.

---

### Detector 2: Task Execution Fragmentation Detector
- **Identity**: `task_execution_fragmentation`
- **Taxonomy**: `context_dynamics`
- **Operational Level**: Episode Metric $\rightarrow$ Recurring Pattern
- **Mode**: `TASK_LINKED`
- **Target**: Measures whether execution of an explicit task is fractured across non-contiguous active blocks in wall-clock time within a bounded task episode.

#### 1. Bounded Task Execution Episode State Machine
A task execution episode is governed by an explicit state machine:
```text
Task-linked activity starts (linkType === "EXPLICIT")
      ↓
Non-task interval starts (interruption detected)
      ↓
Measure interruption gap duration (ΔT_interruption)
      ↓
ΔT_interruption <= continuationGapThreshold 
    → Same task episode continues (interruption accumulated in interveningGapSeconds)
ΔT_interruption > continuationGapThreshold (or task.completedAt, or calendar day-close)
    → Close previous task episode (finalize metrics and ratios)
    → Subsequent task work initiates a NEW task episode
```
- **Interruption vs Episode Boundary**: An intervening non-task interval is an *interruption*, which is measured. It does **not** automatically terminate the episode.
  - If $\Delta T_{\text{interruption}} \le \text{continuationGapThreshold}$ (*CANDIDATE* 2 hours), the episode remains **OPEN**; the interruption interval is classified and accumulated into `knownInterveningGapSeconds` or `unknownSeconds`.
  - If $\Delta T_{\text{interruption}} > \text{continuationGapThreshold}$, or if `task.completedAt` is recorded, or the user local calendar day closes $\implies$ the previous task execution episode is **CLOSED**, its metrics and `wallClockFragmentationRatio` are finalized, and any subsequent work on that task initiates a **NEW** task execution episode.
  - An interruption is therefore an observational event, not an episode boundary. The boundary occurs exclusively upon exceeding the continuation threshold, task completion, or day-close.
- **Prohibited Multi-Day Fragmentation**: Monday task fragments and Thursday task fragments can **never** be combined into a single task execution episode.
- **Daily Reconciliation Semantics**: The daily background reconciler inspects all currently open task episodes at local midnight or sleep window. If the elapsed gap since the last task-linked fragment exceeds $\text{continuationGapThreshold}$, or the calendar day has closed, the reconciler idempotently closes the episode and triggers reevaluation of affected Tier-2 windows. The daily reconciler creates no new semantic categories.

#### 2. Exact Gap Partition, UNKNOWN Separation & Conservation Invariant
Within a bounded task execution episode, the total wall-clock span is partitioned into mutually exclusive, collectively exhaustive intervals derived from Phase 3 atomic evidence blocks:

$$\text{wallClockSpanSeconds} = \text{activeTaskFragmentSeconds} + \text{knownInterveningGapSeconds} + \text{unknownSeconds}$$

Where:
- $\text{wallClockSpanSeconds} = \text{lastTaskFragment.endTime} - \text{firstTaskFragment.startTime}$
- $\text{activeTaskFragmentSeconds} = \sum_{i=1}^M \text{taskFragment}_i.\text{durationSeconds}$ (cumulative explicitly task-linked active duration)
- $\text{knownInterveningGapSeconds} = \text{break} + \text{otherExplicitTask} + \text{unattributedObserved} + \text{explainedGap}$
  - Every non-task atomic interval inside the bounded episode is assigned to **exactly one** of these four mutually exclusive known gap categories; no interval is double-counted.
- $\text{unknownSeconds} = \sum \text{duration of unmonitored intervals (UNKNOWN)}$ inside the bounded episode.

**UNKNOWN Semantics & Inviolable Epistemic Rules**:
- `unknownSeconds` contributes to `wallClockSpanSeconds`.
- `unknownSeconds` **NEVER** contributes to `activeTaskFragmentSeconds` or `knownInterveningGapSeconds`.
- `UNKNOWN` is **NOT** an observed interruption, break, distraction, or off-task behavior.
- `UNKNOWN` **cannot independently establish behavioral fragmentation**.
- **Coverage Qualification Rule**:
  $$\text{unknownFraction} = \frac{\text{unknownSeconds}}{\text{wallClockSpanSeconds}}\quad (\text{with zero guard: if } \text{wallClockSpanSeconds} \le 0 \implies \text{unknownFraction} = 0)$$
  - If $\text{unknownFraction} > \text{maxUnknownFraction}$ (*CANDIDATE* $0.20$, i.e. $> 20\%$ unmonitored), the episode cannot determinately establish fragmentation and emits:
    $$\text{executionStatus} = \text{"INDETERMINATE_COVERAGE"}$$
  - When $\text{unknownFraction} \le \text{maxUnknownFraction}$, fragmentation is determinate, and is computed strictly from verified known intervening gaps:
    $$\text{wallClockFragmentationRatio} = \frac{\text{knownInterveningGapSeconds}}{\text{wallClockSpanSeconds}} \in [0, 1]$$
    - **Zero Denominator Rule**: If $\text{wallClockSpanSeconds} \le 0 \implies \text{wallClockFragmentationRatio} = 0$.

#### 3. Pattern Aggregation, Baseline & Formal Qualification Pipeline
1. **Qualifying Evidence Sufficiency**:
   - Collect qualifying determinate bounded task episodes in $[D-13\text{ 00:00}, D+1\text{ 00:00})_{\text{local}}$ requiring $N_{\text{episodes}} \ge 3$ (*CANDIDATE*) across $\ge 2$ distinct calendar days (*CANDIDATE*).
   - If not satisfied $\implies \text{executionStatus} = \text{"INSUFFICIENT_EVIDENCE"}$.
2. **Baseline Maturity & Pattern-Level Anti-Leakage Boundary**:
   - Historical baseline population consists of completed task episodes of the same task type (or general tasks) occurring strictly before $T_{\text{eval\_start}}$ ($D-13\text{ 00:00}_{\text{local}}$), requiring $\ge 5$ baseline task episodes (*CANDIDATE*).
   - **Pattern-Level Anti-Leakage Rule**: When evaluating the recurring pattern for the 14-day window $[T_{\text{eval\_start}}, T_{\text{eval\_end}})$, the baseline population **MUST NOT** include any task episode initiated on or after $T_{\text{eval\_start}}$. An earlier task episode occurring inside the current window (e.g. on Day 5) can **never** serve as baseline for a later task episode (e.g. on Day 10) in computing the overall 14-day pattern.
   - If baseline maturity is not satisfied $\implies \text{executionStatus} = \text{"INSUFFICIENT_BASELINE_DATA"}$.
   - Baseline reference value: $\text{baselineMedianFragmentation} = \text{median}(\text{wallClockFragmentationRatio across qualifying historical baseline episodes})$.
3. **Current-Window Metric**:
   - Compute $\text{currentMedianFragmentation}$ across all qualifying determinate bounded task episodes in the 14-day window.
4. **Calibrated Baseline Contrast**:
   $$\text{deltaFragmentation} = \text{currentMedianFragmentation} - \text{baselineMedianFragmentation}$$
   - Contrast criterion: $\text{deltaFragmentation} \ge \text{fragmentationContrastThreshold}$ (*TBD — REQUIRES EMPIRICAL CALIBRATION*; candidate $+0.30$).
5. **Recurrence Frequency Requirement**:
   $$\text{elevatedEpisodeFraction} = \frac{N(\text{determinate episodes with ratio} > \text{baselineMedianFragmentation})}{N_{\text{total qualifying determinate episodes in window}}}$$
   - Recurrence criterion: $\text{elevatedEpisodeFraction} \ge \text{fragmentationRecurrenceThreshold}$ (*TBD — REQUIRES EMPIRICAL CALIBRATION*; candidate $0.60$).

**Deterministic Output Status Assignment**:
- `executionStatus: "DETECTED"`: Both Contrast Criterion (Step 4) and Recurrence Criterion (Step 5) are satisfied.
- `executionStatus: "NO_PATTERN"`: Steps 1–3 pass, but contrast or recurrence is not met.
- `exe### Detector 3: Extended Continuous Observed Activity Detector
- **Identity**: `extended_continuous_activity_episode`
- **Taxonomy**: `sustained_effort`
- **Operational Level**: Episode Detector (Single Continuous Interval)
- **Mode**: `GENERAL`
- **Target**: Detects an individual, unusually long, unbroken episode of observed physical computer activity.

#### 1. Exact Continuous Episode Interval Definition & Missing Context Semantics
A continuous activity episode is defined as a maximal contiguous time interval $[t_{\text{start}}, t_{\text{end}})$ composed entirely of `TemporalEvidenceBlock`s with `coverage === "OBSERVED"` or `"OBSERVED_REPORTED"`, containing:
- Zero `UNKNOWN` intervals;
- Zero blocks with `observation.category === "break"`;
- Zero blocks with `observation.isAfk === true`.

Any unmonitored interval, break, or AFK event definitively closes the continuous episode.

**Physical Continuity vs Context Identity Completeness (Phase 3 Semantics)**:
- Phase 4 does **not** infer physical interaction directly from raw ActivityWatch events.
- **Rule**: If the Phase 3 evidence block is explicitly classified as `OBSERVED` physical activity (`coverage === "OBSERVED"`), missing application/domain context (`observation.application === null` and `observation.domain === null`) does **not** by itself terminate physical continuity.
- However, missing-context intervals cannot be attributed to any canonical context key $c$.
- **Context Concentration Formula**:
  $$\text{contextConcentrationRatio} = \frac{\max_{c} (\text{activeSeconds in canonical context } c)}{\text{totalQualifyingActiveDurationSeconds}}$$
  Where $\text{totalQualifyingActiveDurationSeconds} = t_{\text{end}} - t_{\text{start}}$.
  - Missing context seconds cannot be attributed to any context key $c$, and unknown context is never classified as a separate application.
  - If $\frac{\text{missingContextActiveSeconds}}{\text{totalQualifyingActiveDurationSeconds}} > 0.20$ (*CANDIDATE* $20\%$), $\text{contextConcentrationRatio}$ is set to `null` with epistemic caveat `"MISSING_CONTEXT_EXCEEDS_TOLERANCE"`.
  - When determinate: concentration criterion requires $\text{contextConcentrationRatio} \ge 0.80$ (*CANDIDATE*).

#### 2. Episode Qualification & Cold-Start Semantics
1. **Input**: Bounded continuous episode duration $T_{\text{continuous}} = t_{\text{end}} - t_{\text{start}}$ (in minutes).
2. **Operational Level & Status Decoupling**:
   - Detector 3 is an **Episode Detector**; it operates exclusively at Tier 1. It **never** emits a pattern-level status (`"DETECTED"` or `"NO_PATTERN"`).
   - Episode qualification emits `EpisodeExecutionStatus`: `"QUALIFIED" | "NOT_QUALIFIED" | "INSUFFICIENT_EVIDENCE" | "INDETERMINATE_COVERAGE"`.
3. **Deterministic Historical Percentile Convention**:
   - Baseline distribution consists of all continuous activity episodes completed in the rolling 30-day lookback window $[t_{\text{start}} - 30\text{ days}, t_{\text{start}})_{\text{local}}$. A historical episode is eligible only if `episode.startTime >= baselineStart` and `episode.endTime <= evaluationStart` (no centroid semantics).
   - The historical 90th percentile (*TBD — REQUIRES EMPIRICAL CALIBRATION*) is calculated strictly via the deterministic percentile convention (Section 4.1, linear interpolation Method 7 / NIST).
4. **Cold-Start Semantics & Baseline Decoupling**:
   - Historical percentile comparison is a **comparative enhancement** (enrichment) and is **not** a mandatory gate for physical episode qualification.
   - **Mature Baseline Available** ($\ge 14$ baseline days with $\ge 5$ continuous episodes):
     - `executionStatus: "QUALIFIED"`: $T_{\text{continuous}}$ meets or exceeds the personal historical 90th percentile duration, subject to an absolute duration floor of $\ge 45$ minutes (*CANDIDATE*).
     - `baselineComparison`: Reports `strategy = "PERSONAL_30_DAY_PERCENTILE"`, `percentileRank`, and `comparisonStatus = "EVALUATED"`.
   - **Cold Start** ($< 14$ baseline days or $< 5$ baseline episodes):
     - The detector qualifies the episode using the configured absolute duration floor ($\ge 75$ minutes, *CANDIDATE*).
     - `executionStatus: "QUALIFIED"`: $T_{\text{continuous}} \ge 75$ minutes (*CANDIDATE*).
     - `baselineComparison`: Reports `comparisonStatus = "INSUFFICIENT_BASELINE_DATA"`, `percentileRank = null`.
     - *Epistemic Rule*: Cold-start absence of a historical baseline does **not** invalidate or prevent episode qualification; it merely indicates that historical comparative ranking is currently unavailable.

---

### Detector 4: Schedule Variance Detector
- **Identity**: `schedule_variance`
- **Taxonomy**: `schedule_fidelity`
- **Operational Level**: Task Instance Metric $\rightarrow$ Recurring Pattern
- **Mode**: `TASK_LINKED`
- **Target**: Quantifies timing deviations between declared schedule intentions and actual observed execution.
- **Production Status**: ⚠️ **BLOCKED** from production enablement until an authoritative `plannedStart` field exists on `Task`.

#### 1. Task Instance Metrics & Early-Start Semantics
- **Prerequisite**: Evaluates scheduled tasks with an authoritative `plannedStart` timestamp.
- **`actualStart`**: Earliest explicitly task-linked qualifying observed activity (including early starts).
- **Early-Start Semantics & Signed Start Delta**:
  $$\text{startDeltaMinutes} = \frac{\text{actualStart} - \text{plannedStart}}{60}$$
  - $\text{negative} (< 0)$: Early start.
  - $\text{zero} (= 0)$: Exactly on time.
  - $\text{positive} (> 0)$: Late start.
  - **Directional Lateness Rule**: Only positive deviation beyond the directional lateness tolerance contributes to delayed task counts. Early starts are **not** delayed starts.
  - **Signed Metric Invariant**: Relative `deltaRatio` is **strictly prohibited** on signed `startDeltaMinutes`. Start timing variance is evaluated strictly via absolute and distributional tolerances.
- **`startDeltaStatus`**: `"OBSERVED" | "NOT_OBSERVED" | "INDETERMINATE_COVERAGE"`.
- **`scheduleDeviationRatio`**: $\frac{|\text{observedActiveDurationMinutes} - \text{plannedDurationMinutes}|}{\text{plannedDurationMinutes}}$ (if $\text{plannedDurationMinutes} \le 0 \implies \text{null}$, `comparisonStatus = "UNDEFINED_ZERO_BASELINE"`).

#### 2. Formal Denominator Populations & Evidence Sufficiency
To eliminate ambiguity when tasks lack observed start times or telemetry coverage, four mutually exclusive and collectively exhaustive task populations are defined for the evaluation window $[D-13\text{ 00:00}, D+1\text{ 00:00})_{\text{local}}$:
1. `punctualStartTaskCount`: Qualifying scheduled tasks with verified observed execution start (`actualStart != null`) where $\text{startDeltaMinutes} \le \text{varianceToleranceMinutes}$.
2. `delayedStartTaskCount`: Qualifying scheduled tasks with verified observed execution start where $\text{startDeltaMinutes} > \text{varianceToleranceMinutes}$.
3. `notObservedTaskCount`: Scheduled tasks where no task-linked execution was observed prior to evaluation.
4. **`indeterminateStartTaskCount`**: Classified using an explicit `startAssessmentWindowMinutes` parameter (*CANDIDATE* 15 minutes).
   - $\text{startAssessmentInterval} = [\text{plannedStart} - \text{startAssessmentWindowMinutes}, \text{plannedStart} + \text{startAssessmentWindowMinutes})$.
   - $\text{unknownFraction} = \frac{\text{unknownSecondsInStartAssessmentInterval}}{\text{totalStartAssessmentIntervalSeconds}}$.
   - `startAssessmentInterval` is evaluated only for a scheduled task with a valid authoritative `plannedStart`; tasks lacking a valid `plannedStart` are outside this detector's scheduled-task population and must be assigned the detector-defined invalid/unsupported status rather than `NOT_OBSERVED`.
   - If $\text{unknownFraction} > 0.50 \implies \text{indeterminateStartTaskCount}$.
   - Else if qualifying `actualStart` exists $\implies \text{punctualStartTaskCount}$ or $\text{delayedStartTaskCount}$.
   - Else $\implies \text{notObservedTaskCount}$.

**Conservation Invariant**:
$$\text{scheduledTaskCount} = \text{punctualStartTaskCount} + \text{delayedStartTaskCount} + \text{notObservedTaskCount} + \text{indeterminateStartTaskCount}$$

**Denominator Rule & Non-Delayed Execution**:
$$\text{observedStartTaskCount} = \text{punctualStartTaskCount} + \text{delayedStartTaskCount}$$
$$\text{delayedStartFraction} = \frac{\text{delayedStartTaskCount}}{\text{observedStartTaskCount}}$$
- The denominator is **strictly the population of observed qualifying scheduled tasks** (`observedStartTaskCount`).
- Tasks with `NOT_OBSERVED` or `INDETERMINATE_COVERAGE` **MUST NEVER** silently count as punctual (non-delayed) execution.
- If $\text{observedStartTaskCount} < 5$ (*CANDIDATE*), the detector emits `executionStatus = "INSUFFICIENT_EVIDENCE"`.
- All population counts are deterministically reported in the output metadata `sample`.

#### 3. Recurring Pattern Aggregation, Baseline & Formal Qualification Pipeline
1. **Qualifying Evidence Sufficiency**:
   - Requires `observedStartTaskCount` $\ge 5$ (*CANDIDATE*) across $\ge 3$ distinct calendar days (*CANDIDATE*) in $[D-13\text{ 00:00}, D+1\text{ 00:00})_{\text{local}}$.
   - If not satisfied $\implies \text{executionStatus} = \text{"INSUFFICIENT_EVIDENCE"}$.
2. **Baseline Maturity & Pattern-Level Anti-Leakage Boundary**:
   - Baseline population consists of completed scheduled tasks whose authoritative `plannedStart` and execution timestamps occur strictly before $T_{\text{eval\_start}}$ ($D-13\text{ 00:00}_{\text{local}}$), requiring $\ge 10$ historical scheduled tasks (*CANDIDATE*) with observed `startDeltaMinutes`.
   - **Pattern-Level Anti-Leakage Rule**: No scheduled task occurring on or after $T_{\text{eval\_start}}$ may enter the baseline for the current evaluation window. Earlier current-window tasks (e.g. Day 3 task) **MUST NEVER** enter the baseline used to evaluate subsequent current-window tasks (e.g. Day 8 task) in computing the overall 14-day pattern.
   - If baseline maturity is not satisfied $\implies \text{executionStatus} = \text{"INSUFFICIENT_BASELINE_DATA"}$.
   - Baseline reference tolerance: $\text{varianceToleranceMinutes} = \max(k \times \text{IQR}_{\text{baseline}}, 15\text{ minutes})$ (candidate $k = 1.5$).
3. **Current-Window Metric**:
   - Compute $\text{delayedStartFraction} = \frac{\text{delayedStartTaskCount}}{\text{observedStartTaskCount}}$.
4. **Pattern Qualification**:
   - Recurrence criterion: $\text{delayedStartFraction} \ge \text{delayedStartFractionThreshold}$ (*TBD — REQUIRES EMPIRICAL CALIBRATION*; candidate $0.50$, i.e. at least 50% of observed scheduled tasks start beyond tolerance).

**Deterministic Output Status Assignment**:
- `executionStatus: "DETECTED"`: Steps 1–3 pass, and delayed start fraction meets threshold.
- `executionStatus: "NO_PATTERN"`: Steps 1–3 pass, but delayed start fraction is below threshold.
- `executionStatus: "INSUFFICIENT_EVIDENCE"`: Current window fails Step 1.
- `executionStatus: "INSUFFICIENT_BASELINE_DATA"`: Baseline fails Step 2.

---

### Detector 5: Task Start Friction Detector
- **Identity**: `task_start_friction`
- **Taxonomy**: `execution_friction`
- **Operational Level**: Task Instance Metric $\rightarrow$ Recurring Pattern
- **Mode**: `TASK_LINKED`
- **Target**: Quantifies execution latency between task commitment/scheduling and verifiable commencement of task-linked work.
- **Production Status**: ⚠️ **BLOCKED** from production enablement until an authoritative `commitmentTime` exists on `Task`.

#### 1. Task Instance Metrics, Temporal Invariant & Canonical Statuses
- **Prerequisite**: Evaluates latency from authoritative `commitmentTime` (completely decoupled from `plannedStart`).
- **Temporal Invariant & Negative Latency Guard**:
  $$\text{firstQualifyingExecution} \ge \text{commitmentTime}$$
  - If $\text{firstQualifyingExecution} < \text{commitmentTime}$ occurs, the task exhibits an impossible negative latency.
  - **Deterministic Guard**: The system **MUST NOT** clamp negative latency to zero or silently drop the timestamp. It deterministically assigns data-integrity status:
    $$\text{dataIntegrityStatus} = \text{"INVALID_TEMPORAL_ORDER"}$$
  - Tasks with `INVALID_TEMPORAL_ORDER` are strictly excluded from baseline statistics and latency medians, and are reported in `epistemicCaveats`.
  - `INVALID_TEMPORAL_ORDER` is clearly distinguished from `UNKNOWN`, `NOT_STARTED`, and `INDETERMINATE_UNMONITORED`.
- **Latency Calculation**:
  $$\text{latencyMinutes} = \frac{\text{firstQualifyingExecution} - \text{commitmentTime}}{60}\quad (\ge 0)$$
- **Canonical `frictionStatus` Assignment**:
  - `OBSERVED`: `commitmentTime` and `firstQualifyingExecution` both valid, temporal invariant satisfied, and latency gap has sufficient coverage ($> 50\%$ monitored).
  - `NOT_STARTED`: No qualifying task-linked execution observed as of evaluation timestamp (does not imply permanent non-start).
  - `INDETERMINATE_UNMONITORED`: Latency gap contains $> 50\%$ unmonitored time (`UNKNOWN`).

#### 2. Recurring Pattern Aggregation, Zero-Baseline Rules & Qualification Pipeline
1. **Qualifying Evidence Sufficiency**:
   - Collect committed tasks in $[D-13\text{ 00:00}, D+1\text{ 00:00})_{\text{local}}$ with observed latency, requiring $N_{\text{tasks}} \ge 5$ (*CANDIDATE*) across $\ge 3$ distinct calendar days (*CANDIDATE*).
   - If not satisfied $\implies \text{executionStatus} = \text{"INSUFFICIENT_EVIDENCE"}$.
2. **Baseline Maturity & Pattern-Level Anti-Leakage Boundary**:
   - Historical baseline consists of committed tasks in the same duration class committed strictly before $T_{\text{eval\_start}}$ ($D-13\text{ 00:00}_{\text{local}}$), requiring $\ge 10$ historical baseline tasks (*CANDIDATE*).
   - **Pattern-Level Anti-Leakage Rule**: Baseline population consists exclusively of tasks committed before $T_{\text{eval\_start}}$. An earlier task committed inside the current window **MUST NEVER** enter the baseline for that window.
   - If baseline maturity is not satisfied $\implies \text{executionStatus} = \text{"INSUFFICIENT_BASELINE_DATA"}$.
   - Baseline reference value: $\text{baselineMedianLatency} = \text{median}(\text{latencyMinutes across historical baseline tasks})$.
3. **Current-Window Metric**:
   - Compute $\text{currentMedianLatency}$ as median of `latencyMinutes` across qualifying committed tasks in $[D-13\text{ 00:00}, D+1\text{ 00:00})_{\text{local}}$.
4. **Calibrated Baseline Contrast & Zero-Baseline Guard**:
   $$\text{frictionRatio} = \frac{\text{currentMedianLatency}}{\text{baselineMedianLatency}}$$
   - **Zero-Baseline Rules**:
     - If $\text{baselineMedianLatency} \le 0 \implies \text{frictionRatio} = \text{null} \implies `comparisonStatus = "UNDEFINED_ZERO_BASELINE"`. Evaluate `absoluteFrictionFloor` $\implies$ if threshold passes, contrast criterion passes $\implies$ continue normal detection logic.
     - The detector **MUST NEVER** emit `INSUFFICIENT_BASELINE_DATA` or `NaN` for a mature zero baseline.
   - Contrast criterion:
     - If `comparisonStatus != "UNDEFINED_ZERO_BASELINE"`: $\text{frictionRatio} \ge \text{frictionRatioThreshold}$ (*TBD*; candidate $2.0$).
     - If `comparisonStatus == "UNDEFINED_ZERO_BASELINE"`: $\text{currentMedianLatency} \ge \text{absoluteFrictionFloor}$ (*TBD*; candidate $5.0$ minutes).
5. **Recurrence Frequency Requirement & Multiplicative Zero Guard**:
   $$\text{highLatencyFraction} = \frac{N(\text{tasks with latency} > \text{comparisonThreshold})}{N_{\text{total qualifying committed tasks in window}}}$$
   - Where $\text{comparisonThreshold} = 1.5 \times \text{baselineMedianLatency}$ (if $> 0$), else $\text{absoluteFrictionFloor}$.
   - Recurrence criterion: $\text{highLatencyFraction} \ge \text{frictionRecurrenceThreshold}$ (*TBD*; candidate $0.60$).

**Deterministic Output Status Assignment**:
- `executionStatus: "DETECTED"`: Both Contrast Criterion (Step 4) and Recurrence Criterion (Step 5) are satisfied.
- `executionStatus: "NO_PATTERN"`: Steps 1–3 pass, but contrast or recurrence is not met.
- `executionStatus: "INSUFFICIENT_EVIDENCE"`: Current window fails Step 1.
- `executionStatus: "INSUFFICIENT_BASELINE_DATA"`: Baseline window lacks the minimum required historical days or observations (fails Step 2).

---

### Detector 6: Sustained Focus Pattern Detector
- **Identity**: `sustained_focus_recurrence_pattern`
- **Taxonomy**: `sustained_effort`
- **Operational Level**: Recurring Pattern (14-Day Rolling Window)
- **Mode**: `GENERAL` or `TASK_LINKED`
- **Target**: Detects a recurring personal pattern of stable, low-transition focus episodes across multiple independent days.

#### 1. Operational Definition & Qualifying Workdays
- "Focus" is an operational taxonomy label for qualifying sustained low-transition observed activity ($\le 6.0$ switches/hr, $\ge 90\%$ coverage, no AFK, continuous duration $\ge 45$ min).
- **Qualifying Workday**: Calendar date in $[D-13\text{ 00:00}, D+1\text{ 00:00})_{\text{local}}$ with $\ge 120$ observed active minutes (*CANDIDATE*), usable telemetry coverage $\ge 80\%$ (*CANDIDATE*), and zero data-integrity failures.

#### 2. Absolute Recurrence Qualification + Baseline-Informed Subtyping
Evaluation proceeds through this strict 5-stage qualification pipeline:
1. **Qualifying Evidence Sufficiency**:
   - Requires $\ge 7$ qualifying workdays (*CANDIDATE*) in $[D-13\text{ 00:00}, D+1\text{ 00:00})_{\text{local}}$.
   - If not satisfied $\implies \text{executionStatus} = \text{"INSUFFICIENT_EVIDENCE"}$.
2. **Baseline Maturity & Anti-Leakage Boundary**:
   - Evaluated over the immediately preceding non-overlapping 14-day window $[D-27\text{ 00:00}, D-13\text{ 00:00})_{\text{local}}$ requiring $\ge 7$ qualifying workdays (*CANDIDATE*).
   - If not satisfied $\implies \text{executionStatus} = \text{"INSUFFICIENT_BASELINE_DATA"}$.
3. **Current Recurrence Frequency**:
   $$\text{recurrenceFraction} = \frac{\text{Qualifying Workdays with } \ge 1 \text{ Focus Episode}}{\text{Total Qualifying Workdays in Window}}$$
4. **Baseline Recurrence Frequency**:
   - Compute $\text{baselineRecurrenceFraction}$ over $[D-27\text{ 00:00}, D-13\text{ 00:00})_{\text{local}}$.
5. **Pattern Qualification & Deterministic Subtype Precedence**:
   - **Step 5A: Current Recurrence Qualification Gate**:
     - If $\text{recurrenceFraction} < 0.60$ (*TBD — REQUIRES EMPIRICAL CALIBRATION*) $\implies \text{executionStatus: "NO_PATTERN"}$.
   - **Step 5B: Deterministic Subtype Assignment** (when $\text{recurrenceFraction} \ge 0.60 \implies \text{executionStatus: "DETECTED"}$):
     Subtype classification follows an exhaustive, mutually exclusive priority order:
     1. **Priority 1 — Habit Erosion**:
        If $\text{baselineRecurrenceFraction} - \text{recurrenceFraction} \ge 0.20$ (*CANDIDATE*, significant decline from established high baseline):
        $\implies \text{executionStatus} = \text{"DETECTED"}$, $\text{subtype} = \text{"DECLINING_FOCUS_HABIT"}$, with epistemic caveat `"SIGNIFICANT_HABIT_EROSION_FROM_BASELINE"`.
        *(Rationale: Because current recurrence meets the $\ge 60\%$ detection floor, the pattern remains DETECTED, but the erosion is deterministically identified via subtype and caveat rather than silently suppressed or falsely labeled as stable).*
     2. **Priority 2 — Stable Focus Habit**:
        Else if $\text{baselineRecurrenceFraction} \ge 0.60$ (*CANDIDATE*):
        $\implies \text{executionStatus} = \text{"DETECTED"}$, $\text{subtype} = \text{"STABLE_FOCUS_HABIT"}$.
     3. **Priority 3 — Emerging Focus Habit**:
        Else if $\text{recurrenceShift} = \text{recurrenceFraction} - \text{baselineRecurrenceFraction} \ge +0.20$ (*CANDIDATE*):
        $\implies \text{executionStatus} = \text{"DETECTED"}$, $\text{subtype} = \text{"EMERGING_FOCUS_HABIT"}$.
     4. **Priority 4 — Moderate Focus Habit (Fallback)**:
        Else:
        $\implies \text{executionStatus} = \text{"DETECTED"}$, $\text{subtype} = \text{"MODERATE_FOCUS_HABIT"}$.

**Deterministic Output Status Assignment**:
- `executionStatus: "DETECTED"`: Step 5B satisfied (with deterministic subtype assigned above).
- `executionStatus: "NO_PATTERN"`: Qualifying workdays $\ge 7$, but $\text{recurrenceFraction} < 0.60$.
- `executionStatus: "INSUFFICIENT_EVIDENCE"`: Current window fails Step 1.
- `executionStatus: "INSUFFICIENT_BASELINE_DATA"`: Baseline fails Step 2.

---

### Detector 7: Behavioral Stability Shift Detector
- **Identity**: `behavioral_stability_shift`
- **Taxonomy**: `temporal_distribution`
- **Operational Level**: Intra-Day Pattern Exception (Ordered Multi-Session Sequence)
- **Mode**: `GENERAL`
- **Target**: Quantifies progressive within-day degradation or shift of behavioral stability metrics across sequential work sessions within a single calendar day.

#### 1. Unit of Analysis & Scope Clarification
- **Intra-Day Pattern Exception**: Evaluates an ordered sequence of work sessions within a single calendar day $D$. Unlike longitudinal multi-day patterns, its unit of qualification is a single day containing multiple independent sessions.
- **Sufficiency Criteria**:
  $$\text{qualifyingSessionCount} \ge 3\text{ sessions (CANDIDATE)}$$
  $$\text{daySpanHours} = \frac{S_K.\text{endTime} - S_1.\text{startTime}}{3600} \ge 5.0\text{ hours (wall-clock span, CANDIDATE)}$$
  $$\text{cumulativeActiveDurationHours} = \sum_{k=1}^K \text{sessionActiveHours} \ge 2.5\text{ hours (active duration, CANDIDATE)}$$
  *Epistemic Invariant*: Wall-clock span ($\ge 5.0$h from first session start to last session end) and cumulative active duration ($\ge 2.5$h) are independent requirements and must both be satisfied. Missing telemetry gaps between sessions contribute to `daySpanHours` but never to `cumulativeActiveDurationHours`.
- **Baseline Semantics & Non-Historical Comparison**:
  - The baseline reference for Detector 7 is strictly the first qualifying session of the day ($S_1$) under strategy `EARLY_SESSION_INTRA_DAY`.
  - Detector 7 does **not** require a historical personal baseline across preceding days.
  - If $S_1$ is absent, invalid, or fewer than 3 qualifying sessions occur within the day, the intra-day sequence itself is insufficient, and the detector emits `executionStatus = "INSUFFICIENT_EVIDENCE"`. It **never** emits `INSUFFICIENT_BASELINE_DATA`.

#### 2. Deterministic Session Ordering & Kendall's Tau-b
- Sessions ordered deterministically: Primary `session.startTime` ascending; Secondary `session.id` ascending.
- Canonical trend statistic: $\tau_b(\text{sessionOrdinal}, \text{metricValue})$ for each trajectory independently.
- **Role of Evaluated Metrics**:
  - **Directional Monotonic Metrics**:
    - `medianDwellSeconds`: Expected decreasing monotonic tendency ($\tau_b \le -0.60, R_{\text{endpoint}} \le 0.70$).
    - `switchesPerHour`: Expected increasing monotonic tendency ($\tau_b \ge +0.60, R_{\text{endpoint}} \ge 1.40$).
    - `wallClockFragmentationRatio`: Expected increasing monotonic tendency ($\tau_b \ge +0.60, R_{\text{endpoint}} \ge 1.30$).
  - **Descriptive-Only Trajectory**:
    - `observedActiveDurationSeconds`: Evaluates $\tau_b$ and $R_{\text{endpoint}}$ for descriptive intra-day distribution, but does **not** drive the primary stability shift classification.

#### 3. Endpoint Ratio Zero & Undefined Denominator Rules
Every endpoint ratio in Detector 7 ($R_{\text{endpoint}} = S_K / S_1$) is governed by explicit zero and null rules:
- `dwellCompressionRatio`: $S_K.\text{medianDwellSeconds} / S_1.\text{medianDwellSeconds}$
- `switchEscalationRatio`: $S_K.\text{switchesPerHour} / S_1.\text{switchesPerHour}$
- `wallClockFragmentationRatio` endpoint ratio: $S_K.\text{fragmentation} / S_1.\text{fragmentation}$
- `observedActiveDurationSeconds` endpoint ratio: $S_K.\text{duration} / S_1.\text{duration}$

**Deterministic Denominator Rules**:
1. If $S_1 == 0$ and $S_K == 0 \implies R_{\text{endpoint}} = 1.0$ (no endpoint shift observed).
2. If $S_1 == 0$ and $S_K > 0 \implies R_{\text{endpoint}} = \text{null}$ with `endpointStatus = "UNDEFINED_ZERO_BASELINE"`.
3. If $S_1 > 0$ and $S_K == 0 \implies R_{\text{endpoint}} = 0.0$ (complete reduction).
4. If either $S_1$ or $S_K$ is `null` $\implies R_{\text{endpoint}} = \text{null}$.
5. The detector **MUST NEVER** emit `Infinity`, `NaN`, or trigger unhandled divide-by-zero exceptions.

#### 4. Deterministic Decision Algorithm for `trendStatus`
To eliminate ambiguity and ensure exhaustive handling of all possible inputs (including null endpoint ratios and all-tied observations), every evaluated metric trajectory is classified via this priority-ordered decision algorithm:

```text
Let N = qualifyingSessionCount.
Let S_1 = metric value of first qualifying session.
Let S_K = metric value of last qualifying session.
Let R_endpoint = S_K / S_1 (computed via Section 12.7.3 zero-denominator rules).
Let tau_b = Kendall's tau-b between session ordinal (1..K) and session metric value.

1. Sufficiency Check:
   - If N < 3 valid sessions:
     trendStatus = "INSUFFICIENT_EVIDENCE"
     tau_b = null, R_endpoint = null

2. All-Tied Degeneracy Check:
   - Else if all session metric values are identical (P = Q = 0):
     tau_b = null
     calculationStatus = "ALL_TIED"
     trendStatus = "STABLE"
     direction = "NO_TREND"
     R_endpoint = 1.0

3. Trajectory Evaluation with Undefined Endpoint Ratio (R_endpoint === null):
   - If R_endpoint is null:
     - If |tau_b| >= 0.60 (direction-aligned with expected degradation):
       trendStatus = "MONOTONIC_SHIFT"
     - Else if |tau_b| < 0.30:
       trendStatus = "STABLE"
     - Else:
       trendStatus = "ERRATIC"
     (Endpoint-based rules 4 and 5 below are skipped because endpoint ratio is unavailable).

4. **Metric-Specific Polarity Table**:
   | Metric | Degradation Threshold | Improvement Threshold |
   |---|---|---|
   | `medianDwellSeconds` | $R_{\text{endpoint}} \le 0.70$ | $R_{\text{endpoint}} \ge 1.40$ |
   | `switchesPerHour` | $R_{\text{endpoint}} \ge 1.40$ | $R_{\text{endpoint}} \le 0.70$ |
   | `wallClockFragmentationRatio` | $R_{\text{endpoint}} \ge 1.40$ (*CANDIDATE/TBD*) | $R_{\text{endpoint}} \le 0.70$ (*CANDIDATE/TBD*) |
   | `observedActiveDurationSeconds` | *Descriptive Only* | *Descriptive Only* |

5. Monotonic Shift Check ("MONOTONIC_SHIFT") (when $R_{\text{endpoint}} \neq \text{null}$):
   - For metrics with Degradation Threshold $T_{\text{deg}}$ and Improvement Threshold $T_{\text{imp}}$:
     - If $\tau_b$ indicates degradation ($|\tau_b| \ge 0.60$ in degradation direction) AND $R_{\text{endpoint}}$ breaches $T_{\text{deg}} \implies \text{trendStatus} = \text{"MONOTONIC_SHIFT"}$
     - If $\tau_b$ indicates improvement AND $R_{\text{endpoint}}$ breaches $T_{\text{imp}} \implies \text{trendStatus} = \text{"MONOTONIC_SHIFT"}$
   - For `observedActiveDurationSeconds` (descriptive only):
     - If $|\tau_b| \ge 0.60 \implies \text{trendStatus} = \text{"MONOTONIC_SHIFT"}$

6. Significant Endpoint Shift Check (when $R_{\text{endpoint}} \neq \text{null}$):
   - Else if $|\tau_b| < 0.60$ (trajectory is not consistently monotonic across all sessions):
     - If $R_{\text{endpoint}}$ breaches $T_{\text{deg}} \implies \text{trendStatus} = \text{"ENDPOINT_SHIFT_DEGRADATION"}$
     - If $R_{\text{endpoint}}$ breaches $T_{\text{imp}} \implies \text{trendStatus} = \text{"ENDPOINT_SHIFT_IMPROVEMENT"}$

7. Stability Check ("STABLE") (when $R_{\text{endpoint}} \neq \text{null}$):
   - Else if |tau_b| < 0.30 (no meaningful rank trend)
     AND (0.80 <= R_endpoint <= 1.25):
     trendStatus = "STABLE"

7. Erratic / Fluctuating Check ("ERRATIC") (Fallback):
   - Else:
     trendStatus = "ERRATIC"
```

#### Deterministic Trajectory Classification Reference Table

| Classification Priority | `|tau_b|` Criterion | $R_{\text{endpoint}}$ Criterion | Resulting `trendStatus` | Semantic Meaning |
|---|---|---|---|---|
| **1. Evidence Sufficiency** | Any | Any ($N < 3$) | `"INSUFFICIENT_EVIDENCE"` | Insufficient sessions within day |
| **2. All Tied Degeneracy** | Undefined ($P=Q=0$) | $1.0$ (identical) | `"STABLE"` (`ALL_TIED`) | Zero variance across sessions (`direction: "NO_TREND"`) |
| **3. Monotonic Shift** | $|\tau_b| \ge 0.60$ (direction-aligned) | Direction-aligned shift ($\le 0.70$ or $\ge 1.40$) | `"MONOTONIC_SHIFT"` | Consistent decreasing/increasing monotonic tendency |
| **4. Monotonic (Null Ratio)** | $|\tau_b| \ge 0.60$ (direction-aligned) | `null` (`UNDEFINED_ZERO_BASELINE`) | `"MONOTONIC_SHIFT"` | Rank trend established despite zero baseline |
| **5. Endpoint Shift Degradation** | $|\tau_b| < 0.60$ | Substantial shift ($\le 0.70$ or $\ge 1.40$ depending on metric) | `"ENDPOINT_SHIFT_DEGRADATION"` | Endpoint compression/escalation without intermediate monotonicity |
| **6. Endpoint Shift Improvement** | $|\tau_b| < 0.60$ | Substantial shift ($\ge 1.40$ or $\le 0.70$ depending on metric) | `"ENDPOINT_SHIFT_IMPROVEMENT"` | Endpoint expansion/reduction without intermediate monotonicity |
| **7. Stable Trajectory** | $|\tau_b| < 0.30$ | Near-unity ($0.80 \le R_{\text{endpoint}} \le 1.25$) or `null` | `"STABLE"` | Behavioral stability preserved throughout day |
| **8. Erratic / Inconclusive** | All remaining values | All remaining values | `"ERRATIC"` | High intra-day volatility without directional trend |

#### 5. Output Baseline vs Metrics Disambiguation
To eliminate confusion between generic pattern baseline fields and Detector 7 specific metrics:
- In `BehavioralPatternOutput.baseline`:
  - `comparedMetric = "medianDwellSeconds"`
  - `baselineValue = S_1.medianDwellSeconds`
  - `currentValue = S_K.medianDwellSeconds`
  - `deltaRatio = (S_K.medianDwellSeconds - S_1.medianDwellSeconds) / S_1.medianDwellSeconds` (relative percentage deviation from $S_1$; e.g. $-0.35$ for a 35% reduction).
- In `BehavioralPatternOutput.metrics`:
  - `dwellCompressionRatio = S_K.medianDwellSeconds / S_1.medianDwellSeconds` (direct endpoint ratio $R_{\text{endpoint}}$, e.g. $0.65$).
  - `endpointStatus`: `"EVALUATED" | "UNDEFINED_ZERO_BASELINE"`.

- **Epistemic Terminology Rule**: Descriptions use strictly behavioral terminology: "decreasing monotonic tendency", "endpoint compression" (for $R < 1$), or "switch escalation" (for $R > 1$). Biological/psychological terms such as "fatigue", "exhaustion", "burnout", "flow", or "attention depletion" are strictly prohibited.

---

## 13. Baseline Selection per Detector & Strategy Enum

| Detector | Baseline Strategy Enum | Compared Metric | Baseline Construction Window | Fallback if Missing |
|---|---|---|---|---|
| **Context Switching** | `PERSONAL_30_DAY` | `switchesPerHour` | $[D-43\text{ 00:00}, D-13\text{ 00:00})_{\text{local}}$ historical sessions | `INSUFFICIENT_BASELINE_DATA` |
| **Task Fragmentation** | `SAME_TASK_TYPE` | `wallClockFragmentationRatio` | Completed task episodes strictly before $T_{\text{eval\_start}}$ | `PERSONAL_30_DAY` task baseline |
| **Continuous Activity** | `PERSONAL_30_DAY_PERCENTILE` | `continuousDurationMinutes` | $[D-30\text{ 00:00}, D\text{ 00:00})_{\text{local}}$ continuous episodes | Candidate absolute threshold ($\ge 75$ min) with `comparisonStatus: "INSUFFICIENT_BASELINE_DATA"` |
| **Schedule Variance** | `PERSONAL_HISTORICAL_VARIANCE`| `startDeltaMinutes` | Scheduled tasks strictly before $T_{\text{eval\_start}}$ | `INSUFFICIENT_BASELINE_DATA` |
| **Task Start Friction** | `SAME_DURATION_CLASS` | `latencyMinutes` | Same-duration-class tasks before $T_{\text{eval\_start}}$ | `PERSONAL_30_DAY` latency baseline |
| **Sustained Focus** | `ROLLING_14_DAY_WINDOW` | `recurrenceFraction` | $[D-27\text{ 00:00}, D-13\text{ 00:00})_{\text{local}}$ non-overlapping window | `INSUFFICIENT_BASELINE_DATA` |
| **Stability Shift** | `EARLY_SESSION_INTRA_DAY` | `dwellCompressionRatio` | First qualifying session of day $D$ ($S_1$) | `INSUFFICIENT_EVIDENCE` (requires $\ge 3$ sessions in day) |

> [!NOTE]
> **Detector 7 Baseline Semantics**: `EARLY_SESSION_INTRA_DAY` uses the day's own initial session ($S_1$) as the comparative reference. It does **not** evaluate historical days; therefore, absence of prior history does not cause `INSUFFICIENT_BASELINE_DATA`.

### Baseline Strategy Enum Definition
```typescript
export type BaselineStrategy =
  | "PERSONAL_30_DAY"
  | "PERSONAL_30_DAY_PERCENTILE"
  | "PERSONAL_HISTORICAL_VARIANCE"
  | "SAME_TASK_TYPE"
  | "SAME_DURATION_CLASS"
  | "ROLLING_14_DAY_WINDOW"
  | "EARLY_SESSION_INTRA_DAY"
  | "NONE";
```

---

## 14. Deterministic Pattern Reliability Framework

To guarantee semantic determinism without inventing uncalibrated confidence percentages, reliability tier mapping is strictly formalized:

```typescript
export interface PatternReliability {
  tier: "PROVISIONAL" | "LOW" | "MODERATE" | "HIGH";
  calibrationStatus: "UNVALIDATED_PROTOTYPE" | "EMPIRICALLY_CALIBRATED";
  evidenceQualityFactors: {
    qualifyingDayCount: number;         // Days evaluated
    qualifyingEpisodeCount: number;     // Episodes evaluated
    meanTelemetryCoverageRatio: number; // Mean physical coverage across episodes
    temporalVariability: number | null; // TBD — REQUIRES EMPIRICAL CALIBRATION
    baselineMaturityDays: number;       // Depth of personal historical baseline
    hasCorroboratingSelfReport: boolean;// Presence of check-in reflection
  };
}
```

### Deterministic Tier Assignment Rules
1. **Pre-Calibration Phase (Current Contract)**:
   - While `calibrationStatus === "UNVALIDATED_PROTOTYPE"`, the detector **MUST deterministically emit `tier: "PROVISIONAL"`**.
   - Downstream systems are strictly prohibited from treating `PROVISIONAL` as an inferential guarantee.
   - **Non-Operative Fields & Self-Report Constraint**: `temporalVariability`, `hasCorroboratingSelfReport`, `evidenceQualityScore`, and any future reliability score are non-operative for `PROVISIONAL` outputs. Furthermore, no self-report can upgrade a detector from `INSUFFICIENT_EVIDENCE`, `INDETERMINATE_COVERAGE`, or another execution-status failure to a successful detection unless that detector explicitly defines such behavior.
2. **Post-Calibration Phase (Future Production Governance)**:
   - Upon empirical calibration against longitudinal telemetry fixtures, `calibrationStatus = "EMPIRICALLY_CALIBRATED"`, and tier assignment evaluates a deterministic scoring matrix governed by calibrated parameters.
   - The exact weighting matrix and thresholds for `HIGH`, `MODERATE`, and `LOW` tiers are excluded from this specification and will be defined in a future versioned `ReliabilityPolicy` document. Until then, all evaluations emit `PROVISIONAL`.

---

## 15. Evaluation Identity Hashing & Result Supersession

Evaluation IDs are generated via a strict deterministic hashing formula:

$$\text{evaluationId} = \text{sha256}(\text{userId} + \text{":"} + \text{detectorIdentity} + \text{":"} + \text{windowStart} + \text{":"} + \text{windowEnd} + \text{":"} + \text{detectorVersion} + \text{":"} + \text{configurationVersion} + \text{":"} + \text{baselineStrategy} + \text{":"} + \text{attributionMode})$$

- **Evaluation Identity**: `evaluationId` represents the identity of the detector evaluation for a given temporal window, configuration, baseline strategy, and attribution mode.
- **Supersession Rule**: When an evaluation window is recomputed, the newly generated semantic result **supersedes** prior results under the identical `evaluationId`.
- **Append-Only Audit Log for Exact Historical Reconstruction**: Every supersession event appends an immutable record to `PatternEvaluationLog` containing `evaluationId`, `previousGeneratedAt`, `supersessionCause`, and the full serialized immutable payload `previousResultSnapshot`, enabling exact historical reconstruction without mutable history corruption.

---

## 16. Structured Output Contracts: Episode vs Pattern

```typescript
export type EpisodeExecutionStatus =
  | "QUALIFIED"
  | "NOT_QUALIFIED"
  | "INSUFFICIENT_EVIDENCE"
  | "INDETERMINATE_COVERAGE";

export type PatternExecutionStatus =
  | "DETECTED"
  | "NO_PATTERN"
  | "INSUFFICIENT_EVIDENCE"
  | "INSUFFICIENT_BASELINE_DATA"
  | "INDETERMINATE_COVERAGE";

export interface BaseDetectionMetadata {
  evaluationId: string;         // Deterministic hash of evaluation window + config
  detectorVersion: string;      // Semantic version, e.g. "1.0.0"
  configurationVersion: string; // Configuration tag, e.g. "2026.09.A"
  generatedAt: string;          // ISO-8601 (runtime metadata; excluded from deepEqual)
}

/**
 * TIER 1: Single bounded behavioral instance measurement.
 * Emits EpisodeExecutionStatus ("QUALIFIED" | "NOT_QUALIFIED"). Zero pattern-only fields.
 */
export interface EpisodeMeasurementOutput<TMetrics = Record<string, unknown>> {
  metadata: BaseDetectionMetadata;
  userId: string;
  detectorIdentity: string;
  taxonomy: "context_dynamics" | "schedule_fidelity" | "execution_friction" | "sustained_effort" | "temporal_distribution";
  executionStatus: EpisodeExecutionStatus;
  level: "EPISODE";
  attributionMode: "TASK_LINKED" | "GENERAL";
  temporalWindow: {
    start: string;                // ISO-8601
    end: string;                  // ISO-8601
    scale: "CONTINUOUS_INTERVAL" | "TASK_INSTANCE" | "INTRA_SESSION";
  };
  episodeEvidence: {
    sessionId?: string;
    taskId?: string;
    boundingWindow: { start: string; end: string };
  };
  activeDurationSeconds: number;
  coverageRatio: number;
  metrics: TMetrics;
  baselineComparison?: {
    strategy: BaselineStrategy;
    comparedMetric: string;
    baselineValue: number | null;
    percentileRank: number | null;
    comparisonStatus: "EVALUATED" | "INSUFFICIENT_BASELINE_DATA" | "NOT_APPLICABLE" | "UNDEFINED_ZERO_BASELINE";
  };
  epistemicCaveats: string[];
}

/**
 * TIER 2: Recurring behavioral pattern verified across qualifying episodes/days.
 * Emits PatternExecutionStatus ("DETECTED" | "NO_PATTERN").
 */
export interface BehavioralPatternOutput<TMetrics = Record<string, unknown>> {
  metadata: BaseDetectionMetadata & {
    patternId: string;          // Maps to evaluationId for Tier 2 patterns
  };
  userId: string;
  patternType: string;
  taxonomy: "context_dynamics" | "schedule_fidelity" | "execution_friction" | "sustained_effort" | "temporal_distribution";
  executionStatus: PatternExecutionStatus;
  level: "PATTERN";
  attributionMode: "TASK_LINKED" | "GENERAL";
  temporalWindow: {
    start: string;                // ISO-8601
    end: string;                  // ISO-8601
    scale: "INTRA_DAY" | "7_DAY" | "14_DAY" | "30_DAY";
  };
  sample: {
    qualifyingDays: number;
    qualifyingEpisodes: number;
    totalObservedHours: number;
    meanCoverageRatio: number;
    populationCounts?: {
      scheduledTaskCount?: number;
      observedStartTaskCount?: number;
      notObservedTaskCount?: number;
      indeterminateStartTaskCount?: number;
      delayedStartTaskCount?: number;
    };
  };
  baseline: {
    strategy: BaselineStrategy;
    comparedMetric: string;
    baselineValue: number | null;
    currentValue: number | null;
    /**
     * Relative delta ratio: (currentValue - baselineValue) / baselineValue.
     * Populated ONLY when detector's baseline strategy authorizes relative delta-ratio comparison
     * on strictly positive unsigned metrics (e.g. switchesPerHour).
     * Otherwise deltaRatio = null (e.g. for signed metrics, distributional tolerances, percentiles).
     */
    deltaRatio: number | null;
    comparisonStatus: "EVALUATED" | "INSUFFICIENT_BASELINE_DATA" | "NOT_APPLICABLE" | "UNDEFINED_ZERO_BASELINE";
  };
  metrics: TMetrics;
  reliability: PatternReliability;
  evidenceReferences: {
    contributingSessionIds?: string[];
    contributingTaskIds?: string[];
    sampleBoundingWindows: Array<{ start: string; end: string }>;
  };
  epistemicCaveats: string[];
}

/**
 * Append-only audit record for supersession provenance and historical reconstruction.
 * Stored in PatternEvaluationLog table; does not alter latest-state operational pattern records.
 * Retains complete prior result payload enabling exact historical reconstruction.
 */
export interface PatternEvaluationLogEntry {
  auditId: string;                     // Primary key (UUID / CUID)
  evaluationId: string;                // References BaseDetectionMetadata.evaluationId
  userId: string;
  detectorIdentity: string;
  supersededAt: string;                // ISO-8601 when supersession occurred
  supersessionCause:
    | "NEW_TELEMETRY_ARRIVED"
    | "TASK_LINK_MODIFIED"
    | "BASELINE_RECOMPUTED"
    | "DETECTOR_VERSION_BUMP"
    | "CONFIG_VERSION_BUMP"
    | "RETROSPECTIVE_EDIT";
  triggeringEntityIds: string[];       // e.g. ["session_123", "gap_456"]
  previousGeneratedAt: string;
  previousExecutionStatus: EpisodeExecutionStatus | PatternExecutionStatus;
  previousMetrics: Record<string, unknown>;
  previousBaselineComparison?: Record<string, unknown> | null;
  previousReliabilityTier?: string | null;
  /** Complete immutable serialized snapshot of prior evaluation result for exact reconstruction */
  previousResultSnapshot: Record<string, unknown>;
}
```

---

## 17. Inter-Detector Independence & Composition

1. **Zero Runtime Inter-Dependency**: Detectors execute independently. Detector 2 cannot invoke Detector 1. Detector 6 cannot consume Detector 1 output. Detector 7 cannot consume Detector 1 output.
2. **Shared Canonical Primitives**: All detectors independently consume Phase 2 canonical features and Phase 3 `EvidenceTimeline`.
3. **Downstream Composition (Phase 5 Role)**: Clustering overlapping patterns (e.g. high switches + high fragmentation) is the explicit responsibility of Phase 5 (Insights).

---

## 18. Relationship to Legacy `productivityPatterns()`

The repository contains a legacy compatibility function in `@repo/analytics`:
```typescript
export function productivityPatterns(events: NormalizedActivityEvent[]): LegacyPatternResult
```
This legacy path is consumed by `apps/api/src/services/analytics/service.ts` for backward-compatible daily UI metrics.

### Canonical Separation Contract
1. **No Shared Code**: The canonical Phase 4 architecture will **not** import, extend, or modify `productivityPatterns()`.
2. **Preservation**: The legacy function must remain untouched to satisfy existing UI endpoints until legacy consumers are formally migrated to Phase 5 insights.
3. **Not Source of Truth**: The legacy function operates on raw normalized activity events and computes heuristic UI scores. It does **not** adhere to Phase 3 evidence slicing or Phase 4 epistemic contracts. It is strictly legacy compatibility code.

---

## 19. Statistical Threshold Governance

Every numerical parameter in Phase 4 is explicitly classified as exactly one of:
- `MANDATORY`: Architecturally required logical boundary (e.g. active fragments $\ge 1$, coverage $\in [0, 1]$).
- `CANDIDATE`: Structurally proposed default subject to empirical calibration.
- `EXAMPLE`: Illustrative value used solely for narrative explanation.
- `TBD — REQUIRES EMPIRICAL CALIBRATION`: Parameter that must be calibrated against real longitudinal telemetry fixtures prior to production enablement.

> [!CAUTION]
> **Implementation Agent Governance Boundary**: The implementation agent has **no authority** to convert a parameter marked `CANDIDATE` or `TBD` into a `MANDATORY` threshold, or to invent new thresholds during coding.

---

## 20. Methodological Classification & Future Research

| Technique | Methodological Role | Rationale & Prerequisites | Classification |
|---|---|---|---|
| **Median & IQR** | Central tendency & dispersion | Robust order-statistic measures without parametric distribution assumptions. | **1. CURRENT PRODUCTION PRIMITIVE** |
| **Delta Ratio** | Relative baseline contrast | Simple, bounded relative comparison for unsigned metrics. | **1. CURRENT PRODUCTION PRIMITIVE** |
| **Recurrence Fraction** | Recurrence frequency | Proportion of qualifying observation units satisfying operational criteria. | **1. CURRENT PRODUCTION PRIMITIVE** |
| **Kendall's Tau-b ($\tau_b$)** | Ordered session rank trend | Non-parametric monotonic trend explicitly accounting for ties. | **1. CURRENT PRODUCTION PRIMITIVE** |
| **Bounded Task Episode** | Task execution unit | Prevents multi-day intervals from creating spurious ratios via state machine. | **2. CURRENT DESIGN CONCEPT** |
| **Anti-Leakage Invariant** | Baseline temporal separation | Enforces $T_{\text{base\_end}} \le T_{\text{eval\_start}}$. | **2. CURRENT DESIGN CONCEPT** |
| **Orchestration Model** | Evaluation lifecycle | Event-driven dirty tracking + periodic reconciliation. | **2. CURRENT DESIGN CONCEPT** |
| **Output Decoupling** | Type safety & semantics | Separates Episode Output (`QUALIFIED`) from Pattern Output (`DETECTED`). | **2. CURRENT DESIGN CONCEPT** |
| **Threshold Calibration** | Numerical cutoffs | Cutoffs (45 min, 75 min, 6 switches/hr) require telemetry fixtures. | **3. CALIBRATION-DEPENDENT / TBD** |
| **Theil-Sen Estimator** | Robust slope rate | Median of pairwise slopes. Solves rate-of-change; deferred until continuous calibration. | **4. FUTURE RESEARCH ONLY** |
| **PELT / CUSUM** | Change-point detection | Detects regime shifts. Requires calibrated cost/penalty functions; deferred. | **4. FUTURE RESEARCH ONLY** |
| **Block Permutation / Bootstrap** | Autocorrelation-aware testing | Accounts for serial dependence in N-of-1 series. Computationally heavy for MVP. | **4. FUTURE RESEARCH ONLY** |
| **Cohen's $\kappa$ / Jaccard** | Binary coincidence | Measures intention-telemetry agreement. Not needed for the 7 canonical detectors. | **4. FUTURE RESEARCH ONLY** |
| **Cross-Window Tau** | "14-day vs 120-day $\tau$" | Two aggregated observations are insufficient for the intended longitudinal habit trend interpretation. | **5. REJECTED FOR PRODUCTIVEHIX** |
| **Uncalibrated Asymptotic $p$-Values** | Hypothesis testing | Unvalidated inferential procedures are outside the current Phase 4 methodology because the required longitudinal dependence handling and validation have not been established. | **5. REJECTED FOR PRODUCTIVEHIX** |
| **OLS Regression & $R^2$** | Parametric trend & prediction | Not approved for current Phase 4 because the current objectives do not require it and the relevant longitudinal assumptions/methodology have not been validated. | **5. REJECTED FOR PRODUCTIVEHIX** |
| **Generic Correlation Discovery** | Multi-feature mining | Spurious associations across unconstrained feature grids. | **5. REJECTED FOR PRODUCTIVEHIX** |
| **Composite "Stability Score"** | Metric collapsing | Collapsing conflicting trajectories into an arbitrary weighted score obscures truth. | **5. REJECTED FOR PRODUCTIVEHIX** |

---

## 21. Pattern Lifecycle, Evaluation Cadence & Orchestration

> [!IMPORTANT]
> **Core Operational Principle**: A pattern is **NOT** a report that appears every 14 days.  
> A pattern is a continuously refreshable analytical state derived from a defined historical window, evaluated according to detector-specific eligibility and orchestration rules, and recomputed when relevant evidence or baseline state changes.

### 1. Canonical Distinctions
The architecture strictly decouples four distinct concepts:
$$\text{LOOKBACK WINDOW} \neq \text{EVALUATION CADENCE} \neq \text{EVALUATION TRIGGER} \neq \text{PUBLICATION CADENCE}$$

1. **Observation / Evaluation Window**: The interval of authoritative evidence considered by a detector.
2. **Evaluation Cadence**: How often the detector is eligible to be recomputed.
3. **Evaluation Trigger**: The condition that marks a detector/window as requiring reevaluation.
4. **Publication / Result Update**: When the newly computed semantic result becomes available to downstream consumers (Phase 5 Insights).

### 2. Orchestration Architecture: The Pattern Evaluation Orchestrator
```text
                AUTHORITY / EVIDENCE
                       │
                       ▼
                Relevant change
                       │
                       ▼
                 Mark DIRTY
                       │
                       ▼
              Coalesce / Schedule
                       │
                       ▼
          Pattern Evaluation Orchestrator
                       │
                       ▼
            Eligibility + Sufficiency
                 /             \
                /               \
       insufficient            eligible
             │                    │
             ▼                    ▼
       status result         run detector
                                  │
                                  ▼
                        episode / pattern result
                                  │
                                  ▼
                            persist/update
                                  │
                                  ▼
                         Phase 5 consumption
```

### 3. Detector-Aware Dirty Tracking & Coalescing
- **Detector-Aware Dirty Marking**: An upstream change marks **only** detector/window combinations whose declared inputs or eligibility conditions could be affected. A new check-in or gap explanation does **not** trigger an indiscriminate reevaluation of all seven detectors.
- **Coalescing**: Multiple upstream changes affecting the same detector and temporal window are coalesced into a single reevaluation ($N$ upstream events $\rightarrow 1$ necessary evaluation).

### 4. First-Time Evaluation & Cold Start
Patterns are **not** universally delayed by 14 days:
1. **Episode Detectors (Tier 1)**: Eligible immediately when the underlying episode (session, continuous interval, task instance) is finalized.
2. **Multi-Session Intra-Day Patterns (Detector 7)**: Eligible as soon as the minimum number of qualifying sessions ($\ge 3$ sessions) for that day are finalized.
3. **Multi-Day Rolling Patterns (Detector 1 & Detector 6)**: Evaluated once the full 14-day history accumulates (Design B). Prior to Day 14, detectors emit `INSUFFICIENT_EVIDENCE`.

### 5. Rolling Patterns vs Snapshot / Episode Patterns
- **Rolling Pattern**: A fixed-duration historical window moves forward day by day. For a 14-day rolling window:
  - Day 14 evaluates: Days $1 \dots 14$
  - Day 15 evaluates: Days $2 \dots 15$
  - Day 16 evaluates: Days $3 \dots 16$  
  The detector produces a newly evaluated result daily as time advances, without waiting an additional 14 days.
- **Snapshot / Episode Result**: A bounded episode is evaluated once finalized and remains immutable unless retrospective data corrections arrive.

### 6. Default Architectural Cadence per Detector

| Detector | Evaluation Window | Evaluation Trigger | Earliest Eligibility | Preferred Recomputation Cadence | Reconciliation Required? |
|---|---|---|---|---|---|
| **1. Context Switching** | Episode: Session<br>Pattern: $[D-13\text{ 00:00}, D+1\text{ 00:00})_{\text{local}}$ | Session finalization;<br>Day boundary | Episode: 1st session<br>Pattern: $\ge 14$ elapsed days (*CANDIDATE*) | Episode: Event-driven<br>Pattern: Daily rolling reconciliation | Yes (daily rolling update) |
| **2. Task Fragmentation** | Bounded Task Episode | Task completion or continuation gap close | 1st completed task episode | Event-driven upon episode close + Daily | Yes (catches open tasks) |
| **3. Continuous Activity** | Continuous active interval | Episode boundary / break / AFK | Immediate upon episode close | Event-driven upon episode finalization | No (episodes are static) |
| **4. Schedule Variance** | Task instance (planned vs actual) | Task completion + actual start | Authoritative schema field | Event-driven upon task completion | Yes (reconciles late starts) |
| **5. Task Start Friction** | Commitment latency window | 1st qualifying task-linked block | Authoritative schema field | Event-driven upon commencement | Yes (reconciles unstarted) |
| **6. Sustained Focus** | $[D-13\text{ 00:00}, D+1\text{ 00:00})_{\text{local}}$ | Day boundary / session finalization | $\ge 14$ elapsed days (*CANDIDATE*) | Daily rolling reconciliation | Yes (advances rolling window) |
| **7. Stability Shift** | Same-day session sequence | Session finalization within day | $\ge 3$ qualifying sessions in day | Event-driven as sessions close; Final at day close | Yes (finalizes day's curve) |

### 7. Day Finalization State & Timezone Governance
Calendar days transition through explicit states based on user local timezone (`user.timezone`):
- **`OPEN`**: Active day; additional sessions may arrive. Preliminary stability shifts may be computed.
- **`FINALIZABLE`**: Machine shutdown, sleep window reached, or local midnight passed.
- **`FINALIZED`**: Day closed. Day-level results become authoritative unless retrospective synchronization arrives.

### 8. Idempotent Evaluation & Mandatory Audit Trail
- **Idempotency**: Running a detector evaluation twice over identical upstream data produces identical semantic output.
- **Audit Persistence**: Every supersession event appends an entry to `PatternEvaluationLog` recording `evaluationId`, `previousGeneratedAt`, `supersessionCause`, and `previousMetrics`.

---

## 22. Implementation Roadmap for Future Phase 4 Coding

```text
Step 1:  Define canonical pattern contracts in @repo/types/src/patterns.ts
Step 2:  Implement shared detector base infrastructure & qualification guards
Step 3:  Implement personal baseline aggregator (historical windowing in DuckDB)
Step 4:  Implement Pattern Evaluation Orchestrator (dirty window tracking & coalescing)
Step 5:  Implement Detector 1 — Context Switching (with unit & invariant tests)
Step 6:  Implement Detector 2 — Task Execution Fragmentation (with unit & invariant tests)
Step 7:  Implement Detector 3 — Extended Continuous Observed Activity (with unit & invariant tests)
Step 8:  Implement Detector 4 — Schedule Variance (awaits schema plannedStart)
Step 9:  Implement Detector 5 — Task Start Friction (awaits schema commitmentTime)
Step 10: Implement Detector 6 — Sustained Focus Pattern (with multi-day rolling tests)
Step 11: Implement Detector 7 — Behavioral Stability Shift (with Kendall tau-b tests)
Step 12: Wire Phase 4 orchestrator to API analytics pipeline
```

---

## 23. Testing Strategy for Future Implementation

Future Phase 4 unit tests must evaluate:

1. **Baseline excludes current evaluation window**: $T_{\text{base\_end}} \le T_{\text{eval\_start}}$ invariant.
2. **Evaluation identity stability**: Same evaluation identity + changed baseline state updates result without changing evaluation identity (`evaluationId`).
3. **Detector 7 All-Tied Degeneracy**: All tied values in session sequence produce $\tau_b = \text{null}$, `calculationStatus = "ALL_TIED"`.
4. **Detector 7 Insufficient Valid Sessions**: Fewer than 3 valid sessions produces no $\tau$ calculation (`INSUFFICIENT_OBSERVATIONS`).
5. **Detector 7 Trajectory Separation**: Conflicting metric trajectories remain strictly separate in `trajectoryResults`.
6. **Zero-Denominator Invariant**: Ratio denominator $= 0 \rightarrow \text{null}$ / status, never `Infinity` or `NaN`.
7. **Missing Context Boundary**: Missing canonical context identity terminates switch sequence; does not create an inferred switch across the gap.
8. **Bounded Task Episode Invariant**: Monday task fragment + Thursday task fragment do not form one bounded task execution episode.
9. **UNKNOWN Invariant**: Missing telemetry (`UNKNOWN`) never contributes active duration.
10. **Idempotency Invariant**: Repeated identical evaluation is idempotent.
11. **Coalescing Invariant**: $N$ upstream changes affecting one detector/window coalesce into one logical reevaluation.
12. **Detector-Aware Dirty Invariant**: New irrelevant upstream event does not dirty unrelated detectors.

---

## 24. Implementation Readiness Checklist

### Evidence & Attribution Contract
- [ ] Evidence sources strictly restricted to Phase 2 features and Phase 3 `EvidenceTimeline`
- [ ] `UNKNOWN` handling defined per detector (interrupts switching, breaks continuity, marks latency indeterminate)
- [ ] `REPORTED` vs `OBSERVED` semantics defined (reported intervals cannot establish physical computer execution)
- [ ] Explicit task attribution enforced (`linkType === "EXPLICIT"` required in `TASK_LINKED` mode)

### Temporal & Lifecycle Contract
- [ ] Primary unit of analysis defined for all seven detectors
- [ ] Terminal dwell inclusion rule defined for context switching (`[10, 2, 15]`)
- [ ] Bounded Task Episode state machine defined for task fragmentation
- [ ] Authoritative `plannedStart` schema field designed & migrated in Prisma (required for Detector 4)
- [ ] Authoritative `commitmentTime` schema field designed & migrated in Prisma (required for Detector 5)
- [ ] Start overlap rule defined (earliest explicitly task-linked activity, including early starts)
- [ ] Pattern Evaluation Orchestrator lifecycle, detector-aware dirty model, and debouncing defined
- [ ] Rolling 14-day update semantics decoupled from lookback window length
- [ ] Authoritative user timezone governance established for calendar-day windows

### Statistical Contract
- [ ] Approved statistical primitives enumerated and defined (median, IQR, delta ratio, recurrence fraction, Kendall $\tau_b$)
- [ ] Zero-denominator rules defined for every mathematical ratio in the specification
- [ ] Signed metrics (`startDeltaMinutes`) prohibited from relative delta ratio evaluation
- [ ] Kendall $\tau_b$ selected as canonical trend statistic for Detector 7 with tie handling and deterministic ordering
- [ ] Longitudinal dependence and autocorrelation boundaries established (no naive p-values or cross-sectional assumptions)
- [ ] Cross-window $\tau$ misuse explicitly rejected
- [ ] Anti-leakage baseline temporal separation enforced ($T_{\text{base\_end}} \le T_{\text{eval\_start}}$)
- [ ] Shared `PatternSufficiency` contract established with optional detector-governed dimensions
- [ ] All numerical thresholds classified as `MANDATORY`, `CANDIDATE`, `EXAMPLE`, or `TBD`

### Output Contract
- [ ] Separate `EpisodeMeasurementOutput` (`EpisodeExecutionStatus`) vs `BehavioralPatternOutput` (`PatternExecutionStatus`) contracts established
- [ ] Deterministic hashing formula includes configuration version and baseline strategy (`evaluationId`)
- [ ] Mandatory supersession audit log (`PatternEvaluationLog`) defined with previous metrics and cause
- [ ] `generatedAt` explicitly marked as runtime metadata excluded from deterministic equality checks
- [ ] Execution status unions defined without mixing statuses into numeric fields
- [ ] Bounding window evidence references defined (no raw block ID serialization bloat)

### Validation & Legacy Isolation
- [ ] Real telemetry fixtures identified for empirical threshold calibration
- [ ] Adversarial UNKNOWN test cases specified
- [ ] Legacy `productivityPatterns()` completely isolated from Phase 4 architecture

---

```text
Document Status: FINAL DESIGN SPECIFICATION

Phase 4 Implementation Status: NOT STARTED

Phase 3 Dependency: FROZEN

Code Changes in This Task: NONE
```

> [!IMPORTANT]
> **Final Architecture & Freezing Statement**: Statistical methods may evolve through empirical calibration and future formally approved methodology changes. Semantic contracts, evidence boundaries, explicit task-attribution rules, UNKNOWN handling, Phase 3 semantics, inter-detector independence, orchestration lifecycles, and the Phase 4 output contracts are frozen.
