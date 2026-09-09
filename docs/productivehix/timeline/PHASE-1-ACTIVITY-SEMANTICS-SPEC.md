# Phase 1 — Activity Semantics Specification

**Document:** `docs/productivehix/timeline/PHASE-1-ACTIVITY-SEMANTICS-SPEC.md`  
**Status:** REVISED SEMANTIC SPECIFICATION & CONCEPTUAL CONTRACT  
**Scope:** Defines the Activity Semantic Model, core epistemic separations, per-claim confidence architecture, qualitative focus criteria, and mandatory test cases.

---

## 1. Purpose

This document defines the semantic boundaries and architectural principles required for future implementation of ProductiveHix's activity, timeline, and analytics pipelines.

**Specification Contract:**
- **Locked Architectural Principles**: Foundational separations (e.g. Observation $\ne$ Interpretation, Focus $\ne$ Application, Focus $\ne$ Alignment, ProductiveHix Never Manufactures or Invalidates Telemetry) are locked and definitive.
- **Provisional / Experimental Policies**: Specific numerical thresholds (e.g. dwell times, transition frequencies, scoring weights) and heuristic classifications remain provisional parameters to be calibrated through empirical longitudinal validation.

---

## 2. Core Epistemic Separation

To eliminate semantic leakage across the system, ProductiveHix enforces an unbroken seven-layer epistemic separation:

$$\text{OBSERVATION} \ne \text{CLASSIFICATION} \ne \text{CONTEXT} \ne \text{ALIGNMENT} \ne \text{FOCUS} \ne \text{ANALYTICS} \ne \text{INSIGHT}$$

```text
┌─────────────────┬────────────────────────────────────────────────────────┐
│ LAYER           │ WHAT IT REPRESENTS                                     │
├─────────────────┼────────────────────────────────────────────────────────┤
│ 1. OBSERVATION  │ What a physical sensor or user report recorded.        │
│ 2. CLASSIFICATION│ The functional modality/modalities of the activity.    │
│ 3. CONTEXT      │ The project, repository, or subject matter addressed.  │
│ 4. ALIGNMENT    │ How the activity context relates to declared intent.   │
│ 5. FOCUS        │ An inferred cognitive state derived from evidence.     │
│ 6. ANALYTICS    │ Measurable statistical patterns across time.          │
│ 7. INSIGHT      │ A reasoned deduction explaining why a pattern matters. │
└─────────────────┴────────────────────────────────────────────────────────┘
```

1. **Observation**: Raw, verifiable records from sensors or user reports (e.g. *"Process `Code.exe` active window for 18 minutes"* or *"User reported: Went to college lecture"*). Contains zero value judgment.
2. **Classification**: The functional nature of the activity (e.g. `development`, `reading_research`, `communication`).
3. **Context**: The specific subject matter or project (e.g. `ProductiveHix`, `React Query`).
4. **Alignment**: The relationship between observed context and declared goal (e.g. `Task Aligned`, `Goal Aligned`, `Divergent`, `Unlinked`).
5. **Focus**: An inferred estimate of sustained attention, distinct from alignment or tool presence.
6. **Analytics**: Deterministic calculations over time (e.g. `contextSwitchesPerHour`, `transitionFrequency`, `continuityRatio`).
7. **Insight**: Explanatory synthesis connecting behavior to outcomes (e.g. *"Frequent tool transitions during late afternoon learning blocks correlate with lower self-reported comprehension"*).

---

## 3. The Activity Semantic Model

ProductiveHix organizes activity understanding into four structural facets, accompanied by cross-cutting epistemic metadata:

```text
                    ACTIVITY SEMANTIC MODEL

┌───────────────────────────────────────────────────┐
│ OBSERVED ACTIVITY                                 │
│ application / domain / title / time / interaction │
└───────────────────────┬───────────────────────────┘
                        ↓
┌───────────────────────────────────────────────────┐
│ SEMANTIC CLASSIFICATION                           │
│ modality / context / inferred behavior            │
└───────────────────────┬───────────────────────────┘
                        ↓
┌───────────────────────────────────────────────────┐
│ INTENT RELATIONSHIP                               │
│ task relevance / goal relevance / project         │
│ relevance / aligned / divergent / unlinked        │
└───────────────────────┬───────────────────────────┘
                        ↓
┌───────────────────────────────────────────────────┐
│ FOCUS INFERENCE                                   │
│ evidence-based estimate, possibly unknown         │
└───────────────────────┬───────────────────────────┘
                        ↓
┌───────────────────────────────────────────────────┐
│ ANALYTICAL SIGNALS                                │
│ transitions / fragmentation / continuity / etc.   │
└───────────────────────┬───────────────────────────┘
                        ↓
┌───────────────────────────────────────────────────┐
│ INSIGHT                                           │
│ interpretation and recommendation                 │
└───────────────────────────────────────────────────┘

Cross-cutting metadata:
  evidence
  provenance
  confidence
  source
```

### 3.1 Conceptual Object Hierarchy

Rather than mixing behavioral attributes with epistemic metadata, the conceptual object separates *what happened* from *why we believe it*:

```text
Observed Activity Block
│
├── 1. What Happened (Physical / Sensor Observation)
│   ├── Application: Host OS process name
│   ├── Domain: Web FQDN (if browser channel)
│   ├── Title: Window title or document header
│   ├── Interaction State: active_input | sparse_input | sensor_idle | machine_unavailable
│   └── Temporal Position: start, end, duration
│
├── 2. What It Appears to Be (Semantic Classification Stage)
│   ├── Modality: Primary modality + optional secondary modalities
│   ├── Resolved Context: project, topic
│   └── Inferred Behavior: likely reading/viewing, likely drafting, ambiguous
│
├── 3. Its Relationship to Intention (Intent Evaluation Stage)
│   ├── Task Relevance: task_relevant | task_irrelevant | unknown
│   ├── Goal Relevance: goal_relevant | goal_irrelevant | unknown
│   ├── Project Relevance: project_relevant | project_irrelevant | unknown
│   ├── Intention Relationship: aligned | divergent | unlinked
│   └── Break Nature: intentional_rest | unplanned_drift | not_applicable
│
└── 4. Why We Believe That (Epistemic Metadata — Per Claim)
    ├── Evidence: List of raw sensor IDs, window titles, keystroke counts, or reflection notes
    ├── Provenance: user_override | user_rule | deterministic_parser | ai_inferred | fallback
    └── Confidence: Per-claim certainty indicator (not one global number)
```

---

## 4. Semantic Entities

### 1. Raw Observation
- **Definition**: An immutable record captured directly from an OS hook, input driver, or browser extension API.
- **Source / Owner**: Sensor agent (`aw-watcher-window`, `aw-watcher-afk`, `apps/extension`).
- **Nature**: `[OBSERVED]`.
- **Epistemic Limitation**: Raw observations are records of what a sensor reported. They can be noisy, incomplete, stale, or incorrectly attributed (e.g. mouse cursor hovered over a window while user walked away).
- **Can user override?**: No. Raw telemetry is an immutable audit log.
- **Must NOT be confused with**: Human attention, focus, or productivity.

### 2. Normalized Activity Event
- **Definition**: A raw observation that has undergone structural sanitization, duration calculation, and deterministic identification.
- **Source / Owner**: Telemetry ingest service (`packages/telemetry`).
- **Nature**: `[DERIVED]`.
- **Can it be uncertain?**: Only if time synchronization or URL parsing fails.
- **Can user override?**: No.
- **Must NOT be confused with**: A deliberate work session or an aggregated timeline segment.

### 3. Temporal Activity Block (Timeline Segment)
- **Definition**: A continuous, non-overlapping interval of time representing consolidated interaction within a coherent application or domain context.
- **Source / Owner**: Analytics aggregation engine (`packages/analytics`).
- **Nature**: `[DERIVED]`.
- **Can it be uncertain?**: Yes. Grouping heuristics may absorb distinct sub-tasks.
- **Can user override?**: Yes. Users may split, merge, or re-label blocks.
- **Must NOT be confused with**: An intentional focus session.

### 4. Application
- **Definition**: The operating system process or executable environment hosting the active window (e.g., `"Visual Studio Code"`, `"Slack"`, `"Brave Browser"`).
- **Source / Owner**: OS process manager.
- **Nature**: `[OBSERVED]`.
- **Can user override?**: Yes, via alias mapping rules.
- **Must NOT be confused with**: Activity meaning or work context.

### 5. Website / Domain
- **Definition**: The canonical hostname extracted from browser navigation telemetry (e.g., `tanstack.com`, `github.com`).
- **Source / Owner**: Browser extension tab API.
- **Nature**: `[OBSERVED]`.
- **Can user override?**: Yes, via domain mapping rules.
- **Must NOT be confused with**: A specific page topic or activity type.

### 6. Window / Page Context
- **Definition**: The document, route, or topic identifier exposed in window titles or tab headers (e.g. `timeline.ts`, `Pull Request #18`).
- **Source / Owner**: Application title bar / browser tab title.
- **Nature**: `[OBSERVED]`.
- **Can user override?**: Yes.
- **Must NOT be confused with**: The overall project goal.

### 7. Activity Modality (Primary & Secondary)
- **Definition**: The functional modality or modalities of interaction. It is **not** a single scalar enum. It recognizes:
  - **Primary Modality**: The dominant mode of action (`development`, `reading_research`, `writing_documentation`, `communication`, `design`, `media_audio`, `rest_break`, `system_admin`, `unknown`).
  - **Secondary Modalities**: Complementary modes (e.g. watching a video tutorial = Primary: `reading_research`, Secondary: `media_audio`; chatting with an AI about code = Primary: `development`, Secondary: `reading_research`).
- **Source / Owner**: Semantic classification engine.
- **Nature**: `[DERIVED]`.
- **Must NOT be confused with**: Productivity or focus.

### 8. Work Context
- **Definition**: The intellectual domain, project, or subject matter of the activity (e.g., `"ProductiveHix"`, `"React Query"`).
- **Source / Owner**: Resolved from multiple sources (active task, window title, URL path, user rule, AI inference).
- **Distinction**:
  - `Resolved Context`: `{ project: string | null, topic: string | null }`.
  - `Context Evidence / Provenance`: Cites the supporting keys (`["active_task:412", "window_title:useQuery.ts"]`).
- **Nature**: `[DERIVED]` from evidence or `[USER-DECLARED]`.
- **Must NOT be confused with**: Application name.

### 9. User Intention
- **Definition**: The prospective declared will of the user before work begins.
- **Source / Owner**: User planning input (`apps/web`, `apps/extension`).
- **Nature**: `[USER-DECLARED]`.
- **Can user override?**: Yes, prior to execution; never retroactively altered to cover divergence.
- **Must NOT be confused with**: Observed reality.

### 10. Goal (Daily Goal)
- **Definition**: The unifying strategic outcome that defines success for a productive day. Exactly 1 per day.
- **Source / Owner**: User.
- **Nature**: `[USER-DECLARED]`.
- **Can user override?**: Yes. Evaluated by subjective self-assessment at day's end.
- **Must NOT be confused with**: A task checkbox.

### 11. Task
- **Definition**: A concrete, bounded unit of work supporting a goal or priority.
- **Source / Owner**: User.
- **Nature**: `[USER-DECLARED]`.
- **Must NOT be confused with**: A Work Session.

### 12. Focus Session
- **Definition**: A deliberate, bounded period of execution initiated by the user to work on a specific task with intention.
- **Source / Owner**: User action (`Start Focus`).
- **Nature**: `[USER-DECLARED]` boundary + `[OBSERVED]` execution evidence.
- **Must NOT be confused with**: Passive telemetry runs or Activity Blocks.

### 13. User Reflection
- **Definition**: A structured subjective self-assessment (e.g. 50m check-ins, focus debriefs, inactivity gap explanations).
- **Source / Owner**: User.
- **Nature**: `[USER-DECLARED]`.
- **Epistemic Role**: Authoritative regarding internal cognitive experience and offline human actions, but does not overwrite sensor logs.
- **Must NOT be confused with**: Computer telemetry.

### 14. Relevance (Multi-Scope)
- **Definition**: The degree to which an activity connects to known objectives, evaluated across distinct scopes:
  - `Task Relevance`: Advances the active task directly.
  - `Goal Relevance`: Advances today's daily goal, even if outside the current task.
  - `Project Relevance`: Relates to the user's broader project or repository.
  - `Unrelated / Unknown`: No connection to active intentions.
- **Source / Owner**: Context matching engine.
- **Nature**: `[DERIVED]`.
- **Must NOT be confused with**: Focus or efficiency.

### 15. Intention Relationship & Break Nature
- **Definition**: Decouples intention alignment from break behavior:
  - `Intention Relationship`: `Aligned` (on target), `Divergent` (working on unlinked topic), `Unlinked` (no active goal/task).
  - `Break Nature`: `Intentional Rest` (planned pause / restorative break), `Unplanned Drift` (unintentional distraction), `Not Applicable` (active work).
- **Source / Owner**: Analytics engine.
- **Nature**: `[DERIVED]`.
- **Must NOT be confused with**: Cognitive focus.

### 16. Execution State
- **Definition**: The physical interaction state detected by sensors, decoupled from inferred behavior:
  - `Observed Interaction State`: `Active Input` (typing/clicking), `Sparse Input`, `Sensor Idle`, `Machine Unavailable`.
  - `Inferred Behavior`: `Likely Reading / Studying`, `Likely Viewing Media`, `Likely Disengaged`, `Ambiguous`.
- **Source / Owner**: Ingestion engine (`[OBSERVED]`) + Semantic engine (`[DERIVED]`).
- **Must NOT be confused with**: Cognitive focus.

### 17. Activity Classification Stage
- **Definition**: The processing stage that produces semantic outputs:
  $$\text{Classification Result} \longrightarrow \{\text{modality}, \text{context}, \text{inferred behavior}, \text{evidence}, \text{provenance}, \text{confidence}\}$$
- **Role**: Feeds downstream resolution stages (`Context Resolution` $\rightarrow$ `Relevance Resolution` $\rightarrow$ `Intention Alignment` $\rightarrow$ `Focus Inference` $\rightarrow$ `Analytics`).
- **Must NOT be confused with**: The entire semantic state.

### 18. Confidence (Per-Claim Model)
- **Definition**: An indicator of certainty attached to individual derived claims, **not a single global score for the entire block**.
- **Source / Owner**: Classification & inference engines.
- **Nature**: `[DERIVED]`. Calibration requires longitudinal validation.
- **Must NOT be confused with**: A focus score or quality rating.

### 19. Evidence
- **Definition**: The verifiable observations, user reports, or derived signals that support a conclusion.
- **Source / Owner**: Sensor logs, user entries, or analytical models.
- **Nature**: `[OBSERVED]`, `[USER-DECLARED]`, or `[DERIVED]`. Can be incomplete, noisy, contradictory, or insufficient.
- **Must NOT be confused with**: The final derived insight.

### 20. Analytical Signal
- **Definition**: A deterministic statistical metric computed across events, sessions, or days (e.g., `contextSwitchesPerHour`, `transitionFrequency`, `continuityRatio`).
- **Source / Owner**: Analytics engine (`packages/analytics`).
- **Nature**: `[ANALYTICAL]`.
- **Must NOT be confused with**: An observation or an AI recommendation.

### 21. Insight
- **Definition**: A reasoned explanation connecting an analytical signal to an outcome, explaining why something matters and proposing behavioral adaptations.
- **Source / Owner**: Reasoning engine / AI synthesis layer.
- **Nature**: `[AI-INFERRED]` or `[RULE-BASED DEDUCTION]`.
- **Must NOT be confused with**: Raw data or simple summary statistics.

---

## 5. The Per-Claim Confidence Architecture

A single global confidence score (e.g. `confidence: 0.90`) creates false certainty. If a user is on YouTube watching a TanStack Query tutorial, the system may have high certainty about the *topic*, but low certainty about *active attention*.

ProductiveHix attaches confidence to **individual derived claims**:

```text
Observation:
  Application: Google Chrome
  URL: youtube.com/watch?v=...
  Title: "TanStack Query v5 Tutorial"
  Audio: active
  Input: 4 clicks over 25 minutes

Derived Claims:
  ├── Claim: Topic = "React Query"
  │   └── Confidence: HIGH (matched known technical keyword in title)
  │
  ├── Claim: Media Modality = "video"
  │   └── Confidence: HIGH (domain is youtube.com, audio active)
  │
  ├── Claim: Learning Intent
  │   └── Confidence: MODERATE (matches active goal topic, but passive viewing)
  │
  └── Claim: Focused Attention
      └── Confidence: INSUFFICIENT (sparse input; cannot verify eye gaze or comprehension)
```

---

## 6. Focus Semantics (State Representation, NOT an Implicit Score)

> [!IMPORTANT]
> **Core Principle: Focus is NOT a Disguised Formula.**  
> ProductiveHix does **not** calculate focus by summing weights (`input * 0.4 + coherence * 0.3 + reflection * 0.3 = focus score`). Prior to empirical longitudinal calibration, focus is modeled strictly as a **qualitative evidence-based state representation**.

### 6.1 Evidence Dimensions Contributing to Focus
1. **Declared Intention**: Active `WorkSession` on a declared task.
2. **Active Interaction**: Keypress and click density indicating active production.
3. **Physical Continuity**: Unbroken interaction without long pauses or AFK triggers.
4. **Context Coherence**: Low rate of tool switching; transitions occur strictly between related tools.
5. **Relevance & Alignment**: Dwell time spent on tools and documents matching the active context.
6. **Interruption Patterns**: Absence of abrupt shifts to unrelated communication or entertainment feeds.
7. **User Reflection**: Subjective focus rating and confirmation of forward progress.
8. **Observed Progress / Outcome**: Code commits, task status transitions, or review submissions.

### 6.2 The Honesty of the `unknown` Focus State
When evidence is incomplete, ambiguous, or contradictory, the system **must assert `unknown`**.

```text
Focus: unknown
Evidence:
  - deliberate session active
  - aligned context ("React Query")
  - sparse interaction (2 clicks in 20 minutes)
  - no contradictory leisure detected
Reason:
  Insufficient behavioral evidence to estimate sustained cognitive focus.
```

### 6.3 Semantic Focus States
1. `Observed Activity`: Telemetry recorded; zero intention known. Focus is unasserted.
2. `Intentional Session`: User declared intent; session running.
3. `Focus Evidence Present`: Telemetry exhibits strong continuity and coherence.
4. `Verified Focus`: Intention, telemetry, and reflection independently converge.
5. `Interrupted Focus`: Coherent focus shattered by an external diversion.
6. `Fragmented Work`: Rapid context switching and tool thrashing.
7. `Unknown`: Insufficient or contradictory evidence. **`unknown` is a valid, honest result.**

---

## 7. Focus $\ne$ Alignment (The Dual Evaluation Invariant)

There are two completely independent questions:
1. **Was the user attentive to what they were doing?** (`Focus`)
2. **Was that activity aligned with their intended objective?** (`Alignment`)

```text
┌──────────────────────────────┬──────────────────────────────┐
│ HIGH FOCUS / ALIGNED         │ HIGH FOCUS / DIVERGENT       │
│ Deeply coding the declared   │ Deeply playing chess or      │
│ ProductiveHix timeline task. │ engrossed in a football match│
│                              │ during a planned coding task.│
├──────────────────────────────┼──────────────────────────────┤
│ LOW FOCUS / ALIGNED          │ LOW FOCUS / DIVERGENT        │
│ Staring blankly at VS Code,  │ Mindlessly scrolling social  │
│ stuck or daydreaming while   │ media feeds while procrastin-│
│ on the declared task.        │ ating on a declared task.    │
└──────────────────────────────┴──────────────────────────────┘
```

A user watching a football match on YouTube during a work block is:
- `relevance = irrelevant`
- `intentionRelationship = divergent`
- `focus = unasserted / unknown` (they may be completely focused on the match, but it is divergent from the task).

---

## 8. Tool Transitions & Analytical Fragmentation (Case K Invariant)

> [!IMPORTANT]
> **Core Principle: A transition is not inherently a distraction, and semantic coherence does not prove absence of fragmentation.**

- **Semantic Coherence**: A sequence between `VS Code → React Query docs → GitHub → ChatGPT → VS Code` on the same task is **semantically coherent**.
- **Analytical Fragmentation**: Even when transitions are individually coherent, an unusually high frequency of rapid switches across tools over an extended period is an analytical indicator of **potential fragmentation or cognitive thrashing**.

The architecture strictly preserves:
$$\text{Activity Classification (Coherent)} \ne \text{Analytical Interpretation (Possible Fragmentation)}$$

---

## 9. User Reflection & Telemetry Dual-Reconciliation Invariant

> [!CAUTION]
> **Product-Wide Invariant:**  
> ProductiveHix never manufactures telemetry to reconcile a user report, and never invalidates a user report merely because telemetry cannot observe the reported activity.

This invariant applies universally to:
- Offline paper design or notebook reading
- Phone calls and walking conversations
- Physical whiteboard sessions
- In-person meetings outside the monitored machine

### Dual-Reconciliation Ledger:
```text
User Entry:
  "Spent 45 minutes designing database schema on paper. Made great progress. Focus: 5/5."

Telemetry Observation:
  45 minutes machine awake; 2 minutes computer interaction; 43 minutes sensor idle.

Reconciled Record:
  ├── User-Reported Offline Work: 45m (Schema Design Context)
  ├── Computer-Observed Interaction: 2m
  └── Sensor Evidence: Insufficient to observe offline physical activity.
```

Neither source is deleted. The system records both truths honestly.

---

## 10. Mandatory Test Cases (Cases A through O)

The following 15 test cases demonstrate the Activity Semantic Model in practice:

---

### Case A: VS Code + Active Coding + Current Task
- **Observed Facts**: Process `Code.exe`; Title `timeline.ts - ProductiveHix`; Keypresses: 1,840; AFK: 0; Duration: 45m. Active Task: "Build timeline parser".
- **Activity Semantics**: Primary Modality: `development`.
- **Context**: Resolved Context: `project: "ProductiveHix"`, `topic: "timeline"`.
- **Intention Relationship**: Task relevant; `aligned`.
- **Interaction State**: Active input.
- **Focus Inference**: Focus Evidence Present (continuous input, coherent context).
- **Per-Claim Confidence**:
  - `modality: development` $\rightarrow$ High
  - `context: ProductiveHix` $\rightarrow$ High
  - `focus: sustained attention` $\rightarrow$ Moderate (awaiting user reflection)
- **What Remains Unknown**: Code quality, architectural elegance, whether user struggled.
- **What Must NOT Be Concluded**: That the task is finished (completion is an explicit outcome).

---

### Case B: VS Code Left Open + AFK
- **Observed Facts**: Process `Code.exe`; Title `auth.ts`; Duration: 45m; AFK sensor triggers after 3 minutes (42m AFK).
- **Activity Semantics**: First 3m: `development`; Next 42m: `rest_break`.
- **Context**: First 3m: `auth`; Next 42m: `null`.
- **Intention Relationship**: First 3m: `aligned`; Next 42m: `unlinked / unspecified`.
- **Interaction State**: First 3m: Active input; Next 42m: Sensor idle / physical absence evidence.
- **Focus Inference**: Focus estimation unavailable during 42m AFK span.
- **Per-Claim Confidence**:
  - `sensor state: afk` $\rightarrow$ High
  - `focus: none on computer` $\rightarrow$ High
- **What Remains Unknown**: Reason for stepping away (lunch, call, errand).
- **What Must NOT Be Concluded**: That the user "worked for 45 minutes in VS Code."

---

### Case C: VS Code + Unrelated Video on Another Screen
- **Observed Facts**: Process `Code.exe` active window; concurrent Chrome tab with `youtube.com/watch` (`audible: true`); Keypresses in Code: 12 over 30 minutes. Active Task: "Fix database bug".
- **Activity Semantics**: Primary Modality: `ambiguous` (mixed `development` + `media_audio`).
- **Context**: Mixed (`ProductiveHix` + Unrelated Video).
- **Intention Relationship**: `divergent`.
- **Interaction State**: Sparse input with active media playback.
- **Focus Inference**: `unknown` (Contradictory evidence: open editor with audible video and near-zero input).
- **Per-Claim Confidence**:
  - `interaction: sparse` $\rightarrow$ High
  - `focus: unknown` $\rightarrow$ Insufficient evidence
- **What Remains Unknown**: Eye gaze; whether audio was incidental music or primary video.
- **What Must NOT Be Concluded**: Must NOT conclude user was "focused on coding" simply because VS Code was the OS active window.

---

### Case D: ChatGPT + React Query
- **Observed Facts**: Browser `chatgpt.com`; Title `"React Query — useInfiniteQuery caching"`; Duration: 22m; Active scrolling & typing. Active Goal: "Learn React Query".
- **Activity Semantics**: Primary Modality: `reading_research`, Secondary: `development`.
- **Context**: Resolved Topic: `React Query`.
- **Intention Relationship**: Goal relevant; `aligned`.
- **Interaction State**: Active input & scrolling.
- **Focus Inference**: Focus Evidence Present (sustained research on target topic).
- **Per-Claim Confidence**:
  - `topic: React Query` $\rightarrow$ High
  - `modality: research` $\rightarrow$ High
  - `focus: sustained attention` $\rightarrow$ Moderate
- **What Remains Unknown**: Comprehension depth vs blind copy-pasting.
- **What Must NOT Be Concluded**: Must NOT classify as "generic browser" or "distraction".

---

### Case E: ChatGPT + Unrelated Conversation
- **Observed Facts**: Browser `chatgpt.com`; Title `"Best recipe for sourdough bread"`; Duration: 15m. Active Goal: "Learn React Query".
- **Activity Semantics**: Primary Modality: `reading_research`.
- **Context**: Resolved Topic: `Cooking / Personal`.
- **Intention Relationship**: Goal irrelevant; `divergent`.
- **Interaction State**: Active input.
- **Focus Inference**: Divergent from active goal.
- **Per-Claim Confidence**:
  - `topic: Cooking` $\rightarrow$ High
  - `alignment: divergent` $\rightarrow$ High
- **What Remains Unknown**: Intentional micro-break vs procrastination.
- **What Must NOT Be Concluded**: Must NOT classify as "productive learning" simply because the tool is ChatGPT.

---

### Case F: YouTube + React Query Tutorial
- **Observed Facts**: Browser `youtube.com`; Title `"TanStack Query v5 Complete Course"`; Duration: 35m; `audible: true`; Periodic switches to VS Code. Active Goal: "Learn React Query".
- **Activity Semantics**: Primary Modality: `reading_research`, Secondary: `media_audio`.
- **Context**: Resolved Topic: `React Query`.
- **Intention Relationship**: Goal relevant; `aligned`.
- **Interaction State**: Sparse input with active media playback.
- **Focus Inference**: Focus Evidence Present (aligned study session).
- **Per-Claim Confidence**:
  - `topic: React Query` $\rightarrow$ High
  - `media consumption: video` $\rightarrow$ High
  - `learning intent` $\rightarrow$ Moderate
  - `focused attention` $\rightarrow$ Insufficient (sparse input; requires reflection)
- **What Remains Unknown**: Active absorption vs passive background noise.
- **What Must NOT Be Concluded**: **Must NEVER classify as "leisure" or "distraction".**

---

### Case G: YouTube + Unrelated Entertainment
- **Observed Facts**: Browser `youtube.com`; Title `"Premier League Match Highlights"`; Duration: 25m. Active Task: "Write migration tests".
- **Activity Semantics**: Primary Modality: `media_audio`.
- **Context**: Resolved Topic: `Sports Entertainment`.
- **Intention Relationship**: Task irrelevant; `divergent` (or intentional break if declared).
- **Interaction State**: Sparse input with media playback.
- **Focus Inference**: Focus on task is absent; cognitive focus on the video is **unasserted / unknown**. (Focus $\ne$ Alignment).
- **Per-Claim Confidence**:
  - `topic: Sports` $\rightarrow$ High
  - `alignment: divergent` $\rightarrow$ High
  - `focus on task: none` $\rightarrow$ High
  - `cognitive attention on video: unknown` $\rightarrow$ Insufficient
- **What Remains Unknown**: Was this a planned restorative break between sprints?
- **What Must NOT Be Concluded**: Must NOT assume slacking without checking if user logged a rest break.

---

### Case H: GitHub + Current Repository / Task
- **Observed Facts**: Browser `github.com/PrateekSingh43/Productivity-Hix/pull/18`; Duration: 18m. Active Task: "Review Timeline PR".
- **Activity Semantics**: Primary Modality: `development`, Secondary: `reading_research`.
- **Context**: Project: `ProductiveHix`, Topic: `PR Review`.
- **Intention Relationship**: Task relevant; `aligned`.
- **Interaction State**: Active input & scrolling.
- **Focus Inference**: Focus Evidence Present (aligned code review).
- **Per-Claim Confidence**:
  - `project: ProductiveHix` $\rightarrow$ High
  - `modality: PR review` $\rightarrow$ High
- **What Remains Unknown**: Thoroughness of code inspection.
- **What Must NOT Be Concluded**: Must NOT classify as generic "browser time".

---

### Case I: GitHub + Unrelated Repository
- **Observed Facts**: Browser `github.com/trending`; Duration: 15m. Active Task: "Ship Timeline feature".
- **Activity Semantics**: Primary Modality: `reading_research`.
- **Context**: Resolved Topic: `Open Source Discovery`.
- **Intention Relationship**: `divergent exploration`.
- **Interaction State**: Active scrolling.
- **Focus Inference**: Divergent from active task.
- **Per-Claim Confidence**:
  - `alignment: divergent` $\rightarrow$ Moderate to High
- **What Remains Unknown**: Whether user was searching for a library to resolve an immediate bug.
- **What Must NOT Be Concluded**: Must NOT label as "task coding" simply because domain is GitHub.

---

### Case J: Documentation Site + React Query Docs
- **Observed Facts**: Browser `tanstack.com/query/latest/docs`; Duration: 24m; Continuous scrolling. Active Goal: "Learn React Query".
- **Activity Semantics**: Primary Modality: `reading_research`.
- **Context**: Resolved Topic: `React Query`.
- **Intention Relationship**: Goal relevant; `aligned`.
- **Interaction State**: Sparse input with active scrolling (inferred reading).
- **Focus Inference**: Focus Evidence Present (documentation study).
- **Per-Claim Confidence**:
  - `topic: React Query` $\rightarrow$ High
  - `modality: documentation reading` $\rightarrow$ High
  - `focused comprehension` $\rightarrow$ Moderate
- **What Remains Unknown**: Comprehension success.
- **What Must NOT Be Concluded**: Must NOT label as "unproductive" or "general browser".

---

### Case K: Multi-Tool Sequence (VS Code $\rightarrow$ ChatGPT $\rightarrow$ GitHub $\rightarrow$ Docs $\rightarrow$ VS Code)
- **Observed Facts**: Rapid transitions (2–4 minutes each) across VS Code, ChatGPT, GitHub, and TanStack Docs over 60m. All titles mention `React Query` or `ProductiveHix`.
- **Activity Semantics**: Primary Modality: `development`, Secondary: `reading_research`.
- **Context**: Project: `ProductiveHix`, Topic: `React Query`.
- **Intention Relationship**: `aligned` across all tools.
- **Interaction State**: High active input.
- **Focus & Analytics Evaluation**:
  - Semantic Classification: Coherent multi-tool execution on single task.
  - Analytical Signal: High transition frequency $\longrightarrow$ flag as `possible_fragmentation` for longitudinal analysis.
- **Per-Claim Confidence**:
  - `context coherence: high` $\rightarrow$ High
  - `task alignment: aligned` $\rightarrow$ High
  - `fragmentation signal: elevated` $\rightarrow$ High
- **What Remains Unknown**: Fluid multi-tool workflow vs cognitive frustration/confusion.
- **What Must NOT Be Concluded**: Must NOT conclude tool transitions are automatically distractions; must NOT assume semantic coherence guarantees zero mental fatigue.

---

### Case L: VS Code Active + Spotify in Background
- **Observed Facts**: `Code.exe` active window with continuous typing; Spotify running in background; audio active; Spotify window never in foreground.
- **Activity Semantics**: Foreground: `development`; Background: `media_audio`.
- **Context**: Project: `ProductiveHix`.
- **Intention Relationship**: Aligned foreground; ambient background.
- **Interaction State**: Active input.
- **Focus Inference**: Focus Evidence Present.
- **Per-Claim Confidence**:
  - `foreground focus: high` $\rightarrow$ High
  - `background impact: ambient` $\rightarrow$ High
- **What Remains Unknown**: Lyrics distraction impact.
- **What Must NOT Be Concluded**: Must NOT treat Spotify as an "interruption" or "distraction" when running in the background.

---

### Case M: Spotify Foreground
- **Observed Facts**: `Spotify.exe` is foreground active window for 18m; active clicking, playlist searching; zero editor or doc activity.
- **Activity Semantics**: Primary Modality: `media_audio`, Secondary: `leisure`.
- **Context**: Resolved Topic: `Music Selection`.
- **Intention Relationship**: Task irrelevant; `divergent` (or intentional break).
- **Interaction State**: Active input.
- **Focus Inference**: Unfocused on work tasks.
- **Per-Claim Confidence**:
  - `alignment: divergent` $\rightarrow$ High
- **What Remains Unknown**: Planned music break vs disengagement.
- **What Must NOT Be Concluded**: Must NOT label as work.

---

### Case N: Laptop Awake + User AFK
- **Observed Facts**: Machine awake; OS session unlocked; `Code.exe` active; 0 keystrokes and 0 clicks for 40m; `aw-watcher-afk` status `"afk"`.
- **Activity Semantics**: `rest_break` / `sensor_idle`.
- **Context**: `null`.
- **Intention Relationship**: `unspecified`.
- **Interaction State**: Sensor idle / strong evidence of physical absence.
- **Focus Inference**: No observable computer interaction $\longrightarrow$ **focus estimation unavailable**.
- **Per-Claim Confidence**:
  - `sensor state: afk` $\rightarrow$ High
  - `physical presence: absent` $\rightarrow$ High
  - `computer focus: unavailable` $\rightarrow$ High
- **What Remains Unknown**: User physical location.
- **What Must NOT Be Concluded**: Must NOT credit 40m of "Focused Work" to VS Code. Must NOT assert "cognitive focus = none" (user could be thinking about code offline).

---

### Case O: User Reports Offline Work While Telemetry is Sparse
- **Observed Facts**: User check-in: *"Spent 45m designing system architecture on paper, made great progress. Focus: 5/5."* Telemetry: 45m laptop awake with 2m computer interaction, 43m zero input.
- **Activity Semantics**: User Report: `design` / `architecture`; Telemetry: `sparse_interaction`.
- **Context**: Project: `ProductiveHix`, Topic: `Architecture`.
- **Intention Relationship**: Aligned.
- **Interaction State**: Offline active work (user reported) + machine sensor idle.
- **Focus Inference**: Confirmed by reflection; machine evidence insufficient for paper work.
- **Dual Reconciliation Ledger**:
  - User Offline Work: 45m (Schema Design Context)
  - Computer Active Time: 2m
  - Machine Evidence: Insufficient to observe offline physical activity.
- **Per-Claim Confidence**:
  - `user reported context: architecture` $\rightarrow$ High (User Authority)
  - `machine telemetry: 2m active` $\rightarrow$ High (Machine Authority)
- **What Remains Unknown**: Precise time splits on paper.
- **What Must NOT Be Concluded**: **Must NOT flag as a dishonest discrepancy or slacking.** Machine sensors monitor peripherals, not human thought.

---

## 11. Stable Principles vs. Provisional Hypotheses

### Locked Architectural Principles
1. **Application $\ne$ Activity Meaning**: Process names do not define human intent.
2. **Observation $\ne$ Interpretation**: Raw sensor logs must remain decoupled from derived evaluations.
3. **Focus $\ne$ Application**: Running an editor or terminal does not establish cognitive focus.
4. **Focus $\ne$ Alignment**: Being attentive to an activity does not mean that activity is aligned with declared work goals.
5. **Activity Type $\ne$ Productivity**: Development is not inherently productive; communication is not inherently unproductive.
6. **User Reflection $\ne$ Telemetry**: Both records are preserved when they conflict; neither automatically overwrites the other.
7. **ProductiveHix Never Manufactures or Invalidates Telemetry**: Telemetry is never invented to match a reflection, and a reflection is never erased because sensors did not see it.
8. **Timeline $\ne$ Analytics $\ne$ Insights**: Chronological evidence, statistical signals, and reasoned insights must not be collapsed into one object.
9. **Unknown is Valid**: Asserting `unknown` is required when evidence is ambiguous or incomplete.
10. **Raw Observations Are Immutable**: Audit logs are permanent; derived semantic interpretations can be recomputed.
11. **Frontend Does Not Classify**: React UI is strictly a presentation layer consuming pre-computed data.
12. **Per-Claim Confidence**: Confidence belongs to individual claims, not a single global score for an activity block.
13. **Tool Transitions in Context**: A transition between relevant tools is not inherently a distraction; transition sequences produce analytical signals.

### Provisional Hypotheses (To Be Empirically Validated)
1. **Focus Duration Thresholds**: Minimum duration required to establish cognitive depth (provisional: 15–25m).
2. **Context Switching Sensitivity**: The switch rate per hour that signals cognitive thrashing vs fluid research.
3. **Relevance Scoring Weights**: Quantitative weighting between task-level, goal-level, and project-level relevance.
4. **Confidence Calibration**: Mathematical formulas mapping rule types and evidence densities to numeric confidence values.
5. **Break Detection Intervals**: Optimal AFK thresholds (60s vs 180s vs 300s) for distinguishing passive reading from physical absence.
6. **AI Classification Triggers**: Precise policies determining when ambiguous intervals trigger upstream LLM inference.

---

## 12. What This Specification Enables Next

With the semantic boundaries, epistemic separations, and per-claim confidence model formally defined, subsequent implementation phases can proceed without conceptual confusion:
- **Phase 2 Implementation**: Define concrete database schemas and domain models (`packages/types`, `packages/db`) supporting multi-modal semantics, dual reconciliation, and gap recovery.
- **Classification Engine**: Build indexed, deterministic classifiers and user rule engines in `packages/analytics`.
- **Evidence & Analytics Layer**: Implement DuckDB feature extractors for context coherence, baseline comparisons, and focus triangulation.
- **Timeline UI Contract**: Update `/timeline` to display rich work contexts, multi-modal activities, and honest evidence provenance.
