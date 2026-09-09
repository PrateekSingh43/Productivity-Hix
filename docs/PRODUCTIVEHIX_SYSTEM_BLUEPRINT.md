# PRODUCTIVEHIX SYSTEM BLUEPRINT & PRODUCT SPECIFICATION

**Version:** 1.0  
**Status:** LOCKED & DEFINITIVE MASTER BLUEPRINT  
**Target Audience:** Engineering, AI Coding Agents, Product Architecture  
**Purpose:** Single source of truth defining the core product mental model, the Four Kinds of Truth, the telemetry and missing-data recovery mechanism, the DuckDB analytics engine, the closed-loop retention engine, and the 9-phase system roadmap. Future AI agents must refer to this document to prevent hallucination about what ProductiveHix is building.

---

## 1. Executive Vision & Core Philosophy

### 1.1 The Ultimate Purpose
Most productivity tools fail because they are either:
1. **Passive spyware / time trackers**: Log thousands of window events into colored charts that produce guilt without insight.
2. **Disconnected to-do lists / timers**: Manage wishful intentions without ever verifying whether you did what you intended or retained what you learned.

**ProductiveHix exists to close the loop between:**
$$\text{Intention} \longleftrightarrow \text{Behavior} \longleftrightarrow \text{Perception} \longleftrightarrow \text{Outcome} \longleftrightarrow \text{Retained Learning}$$

It is **not** a generic time tracker, not a pomodoro widget, and not an automated boss. It is a **personal behavioral mirror and cognitive retention engine**.

```text
                     ┌────────────────────────┐
                     │    DAILY INTENTION     │
                     │  Daily Goal + 1-3 Prio │
                     │  Supporting Tasks      │
                     └───────────┬────────────┘
                                 │
                                 ▼
                     ┌────────────────────────┐
                     │       EXECUTION        │
                     │  Deliberate Sessions   │
                     │  Passive Telemetry     │
                     └───────────┬────────────┘
                                 │
               ┌─────────────────┴─────────────────┐
               ▼                                   ▼
      ┌─────────────────┐                 ┌─────────────────┐
      │    OBSERVED     │                 │  USER-REPORTED  │
      │    TELEMETRY    │                 │   REFLECTION    │
      │  ActivityWatch  │                 │  ~50m Check-in  │
      │ Desktop+Browser │                 │ Gap Explanation │
      └────────┬────────┘                 └────────┬────────┘
               │                                   │
               └─────────────────┬─────────────────┘
                                 │
                                 ▼
                     ┌────────────────────────┐
                     │   EVIDENCE / ANALYTIC  │
                     │      DATA LAYER        │
                     │  DuckDB + Feature Set  │
                     │  Temporal/Transitions  │
                     │  Coverage & Baselines  │
                     └───────────┬────────────┘
                                 │
                                 ▼
                     ┌────────────────────────┐
                     │  DAILY UNDERSTANDING   │
                     │ What actually happened?│
                     └───────────┬────────────┘
                                 │
                 ┌───────────────┴───────────────┐
                 ▼                               ▼
       ┌───────────────────┐           ┌───────────────────┐
       │     PATTERNS      │           │     INSIGHTS      │
       │  What repeats?    │           │  What matters?    │
       │ (Multi-day stats) │           │ (Evidence-backed) │
       └───────────────────┘           └─────────┬─────────┘
                                                 │
                                                 ▼
                                       ┌───────────────────┐
                                       │ AI INTERPRETATION │
                                       │ Structured synth  │
                                       │ Recommendations   │
                                       └─────────┬─────────┘
                                                 │
                                                 ▼
                                       ┌───────────────────┐
                                       │ LEARNING & RECALL │
                                       │ Spaced retrieval  │
                                       │ Gap identification│
                                       └─────────┬─────────┘
                                                 │
                                                 ▼
                                       ┌───────────────────┐
                                       │  FUTURE BEHAVIOR  │
                                       │ Tomorrow's Plan   │
                                       └───────────────────┘
```

---

### 1.2 The Five Foundational Questions
Every action, data point, and analytical process in ProductiveHix exists to answer five questions:

| # | Core Question | Primary Source of Truth | Key Artifacts |
|---|---|---|---|
| **1** | **What did you intend?** | `Intention` | `DailyGoal`, `DailyPriority`, `Task`, planned duration |
| **2** | **What actually happened?** | `Observation` | ActivityWatch desktop events, browser tabs, AFK signals, `WorkSession` |
| **3** | **What did you say happened?** | `Reflection` | Periodic check-ins (~50m), focus completion ratings, **inactivity gap explanations** |
| **4** | **What happened afterward?** | `Outcome` | Task status (`done`), end-of-day goal outcome (`Achieved`, `Partially`, `Not Achieved`) |
| **5** | **Did you actually retain what you learned?** | `Retention` | Spaced retrieval performance, probe questions, knowledge gap tracking |

---

## 2. The Four Kinds of Truth (Epistemological Model)

ProductiveHix recognizes that human work cannot be captured by a single sensor. The system models reality across **four distinct, non-overlapping layers of truth**:

```text
┌────────────────────────────────────────────────────────────────────────┐
│                        THE FOUR KINDS OF TRUTH                         │
├──────────────────┬──────────────────┬─────────────────┬────────────────┤
│ 1. INTENTION     │ 2. OBSERVATION   │ 3. REFLECTION   │ 4. RETENTION   │
├──────────────────┼──────────────────┼─────────────────┼────────────────┤
│ "What did I plan │ "What did the    │ "What does the  │ "Did I retain  │
│  to accomplish?" │  machine see?"   │  user perceive?"│  what was      │
│                  │                  │                 │  learned?"     │
├──────────────────┼──────────────────┼─────────────────┼────────────────┤
│ • Daily Goal     │ • Active window  │ • 50m check-in  │ • Day 2 recall │
│ • 1-3 Priorities │ • Browser URLs   │ • Focus rating  │ • Day 7 recall │
│ • Planned tasks  │ • AFK/idle logs  │ • Blocker notes │ • Day 14 probe │
│ • Target times   │ • System uptime  │ • Gap reasons   │ • Concept test │
│                  │                  │   ("at college")│ • Gap mapping  │
└──────────────────┴──────────────────┴─────────────────┴────────────────┘
```

### 2.1 Truth Layer A: Intention
- **Nature**: Subjective prospective declaration.
- **Entities**: Exactly 1 `DailyGoal`, 1–3 `DailyPriority` items, N supporting `Task` items with estimated durations.
- **Rule**: Intention is never edited retroactively to match reality. If you planned to spend 2 hours learning React Query and spent it fixing CSS bugs, the original intention remains intact to measure divergence.

### 2.2 Truth Layer B: Observation
- **Nature**: Objective, immutable telemetry collected by independent agents.
- **Entities**: Desktop window titles, process names, browser tab URLs/titles, AFK idle status from OS mouse/keyboard hooks.
- **Rule**: Observation contains no subjective labels by default. A log entry says `"Code.exe - auth.ts (18m)"` or `"Chrome - youtube.com (12m)"`. It does **not** say `"Productive"` or `"Slacking"` until evaluated against Intention and Reflection.

### 2.3 Truth Layer C: Reflection
- **Nature**: Subjective retrospective self-report.
- **Entities**: ~50-minute periodic check-ins, post-session debriefs, and **telemetry gap explanations**.
- **Rule**: When the computer observes no activity (e.g. 57 minutes of machine sleep or idle), Reflection provides the human context (*"I went to college"* or *"Had lunch with teammates"*). Coverage becomes an informed analytical concept, not an unexplained void.

### 2.4 Truth Layer D: Retention
- **Nature**: Objective verification of cognitive acquisition over time.
- **Entities**: Spaced-repetition active recall prompts, LLM-generated probing questions, user answers, comprehension evaluations, and knowledge gap registries.
- **Rule**: Spending 60 minutes with the documentation open does **not** equate to learning. Retention is verified by retrieval days later.

---

## 3. Telemetry Ingestion, Availability & The "Missing Telemetry" Gap Mechanism

### 3.1 Data Collectors & Boundaries
1. **Desktop Agent (`packages/activitywatch`)**:
   - Native background service listening to OS window focus changes and input activity.
   - Accurately detects OS suspend, hibernation, user lock, and system shutdown.
2. **Browser Extension (`apps/extension`)**:
   - Tracks active tab domain, URL, and page title.
   - Drives user interaction: triggers periodic check-ins (~50m, customizable), pauses during active focus mode, and presents quick review cards.

---

### 3.2 Five Decoupled Temporal Concepts
To eliminate false inactivity alerts, the system decouples five temporal concepts:

$$\text{Productive Day Boundary} \ne \text{Typical Sleep Time} \ne \text{Quiet Hours} \ne \text{Machine Availability} \ne \text{User Inactivity}$$

1. **Productive Day Boundary**: Configurable hour (default `04:00 AM`) demarcating which calendar day activities belong to.
2. **Typical Sleep Time**: User bedtime preference (e.g., `01:30 AM`) used to trigger pre-sleep night planning.
3. **Quiet Hours**: Suppression window (e.g., `01:00 AM – 08:30 AM`) preventing notifications.
4. **Machine Availability**: Boolean state indicating whether the machine is awake and the OS session is unlocked. Suspended, hibernated, or powered-off states are `UNAVAILABLE`.
5. **User Inactivity**: Accumulated **only** when `Machine is Available == true`, the session is unlocked, and no user input is observed.

---

### 3.3 The "Missing Telemetry" Gap Recovery Mechanism
In traditional trackers, a gap in telemetry is treated as zero productivity or an unexplained blank. In ProductiveHix, **telemetry gaps are first-class analytical intervals requiring resolution**.

#### The Life of a Telemetry Gap:
```text
           Telemetry Stream Active (ActivityWatch)
                             │
                             ▼
                 Telemetry Gap Detected
                     (Gap >= 50 mins)
                             │
            ┌────────────────┴────────────────┐
            ▼                                 ▼
   Machine UNAVAILABLE               Machine AVAILABLE
  (Sleep/Suspend/Off)                (Awake, zero input)
            │                                 │
            ▼                                 ▼
    User Resumes Machine             User Resumes Input
            │                                 │
            └────────────────┬────────────────┘
                             │
                             ▼
              Ask User for Gap Explanation
       "You were away from 14:46 to 15:43 (57m).
        What were you doing?"
        [ Input: "Went to college lecture" ]
                             │
                             ▼
               Store against Time Interval
              Source = "user_gap_explanation"
                             │
                             ▼
              Analytical Dataset Complete
            (Coverage = 100% Accounted For)
```

#### Concrete Interval Reality:
| Time Interval | Duration | Primary Source | Status / Classification | Evidence / Report |
|---|---|---|---|---|
| `14:00 – 14:46` | 46 min | ActivityWatch | Observed Active | VS Code (`session.ts`), Chrome (`docs`) |
| `14:46 – 15:43` | 57 min | User Report | Explained Gap | User: *"Went to college lecture"* |
| `15:43 – 16:20` | 37 min | ActivityWatch | Observed Active | VS Code (`session.test.ts`) |

**Result:** The analytics engine does not penalize the user for 57 minutes of "slacking." It models a clean transition from focused coding $\rightarrow$ physical education $\rightarrow$ focused test writing.

---

## 4. Analytics Layer: DuckDB, Feature Engine & AI Context Guardrails

### 4.1 The Fundamental Rule: AI Never Receives Raw Telemetry
> [!CAUTION]
> **Prohibited:** Never pass 200–500 raw ActivityWatch events directly into an LLM context window.
> **Why:**
> 1. **Massive Token Waste & Latency**: Raw timestamps and window titles burn thousands of tokens per prompt.
> 2. **Hallucination Vector**: LLMs are notoriously poor at accurate duration arithmetic across dozens of fragmented timestamp pairs.
> 3. **Noise & Privacy**: Ephemeral tab switches (e.g. 3-second checks to Slack or Spotify) pollute the LLM's reasoning.

Instead, all raw telemetry flows through **DuckDB and canonical feature extractors** before reaching the AI.

```text
200+ Raw ActivityWatch Events + Browser Logs
                     │
                     ▼
           Ingestion & Storage
      (PostgreSQL / Prisma / Parquet)
                     │
                     ▼
          DuckDB & Feature Engine
   ┌─────────────────────────────────────┐
   │ • Sessionization & boundary clipping│
   │ • Context transition & switch rates │
   │ • Time-of-day distribution          │
   │ • Reflection alignment calculation  │
   │ • Gap accounting & coverage ratio   │
   │ • Rolling 14-day baseline comparison│
   └─────────────────┬───────────────────┘
                     │
                     ▼
        Compact Analytical Summary
         (~400 tokens of pure signal)
                     │
                     ▼
             AI Synthesis Layer
```

---

### 4.2 Canonical Feature Extractors (`packages/analytics`)
Deterministic feature models convert messy intervals into structured statistical metrics:

1. **`SessionFeatures`**:
   - `durationSeconds`, `activeDurationSeconds`, `idleDurationSeconds`, `productiveDurationSeconds`, `distractionDurationSeconds`
   - `contextCount`, `contextSwitchCount`, `contextSwitchesPerHour`
2. **`DayFeatures`**:
   - `totalSessionCount`, `totalSessionDurationSeconds`, `totalProductiveDurationSeconds`, `totalDistractionDurationSeconds`
   - `averageSessionDurationSeconds`, `longestSessionDurationSeconds`
   - `completedTaskCount`, `createdTaskCount`, `taskCompletionRate`, `checkInCount`
3. **`TransitionFeatures`**:
   - `focusToDistractionTransitions`, `distractionToFocusTransitions`, `appSwitches`
4. **`CheckInFeatures`**:
   - `focus`, `energy`, `state`, `productive`, `progress`, `hasBlocker`, `hasOutcome`, `observedActiveSeconds`
5. **`GapFeatures`**:
   - `gapDurationSeconds`, `gapCategory` (`offline`, `idle_available`), `userExplanation`, `coverageRatio`

---

### 4.3 The Structured Analytical Summary Sent to AI
When the AI is asked to synthesize a day or generate an insight, it receives a disciplined JSON schema:

```json
{
  "date": "2026-09-08",
  "intention": {
    "goal": "Learn React Query client and core hooks",
    "priorities": ["useQuery basics", "infiniteQuery setup"],
    "tasks": [
      { "title": "useQuery demo", "plannedMinutes": 50, "status": "done" },
      { "title": "infiniteQuery pagination", "plannedMinutes": 50, "status": "todo" }
    ],
    "totalPlannedMinutes": 100
  },
  "observation": {
    "totalTrackedMinutes": 120,
    "observedActiveMinutes": 83,
    "idleAvailableMinutes": 12,
    "explainedOfflineMinutes": 57,
    "coveragePercentage": 96.5,
    "sessionsCount": 2,
    "contextSwitchesPerHour": {
      "morning": 0.9,
      "afternoon": 2.7
    }
  },
  "reflection": {
    "checkInsLogged": 2,
    "averageFocusRating": 4.0,
    "reportedProgress": true,
    "reportedBlockers": ["confusion around query invalidation"],
    "gapExplanations": [
      { "interval": "14:46-15:43", "reason": "Went to college lecture" }
    ]
  },
  "baselineComparison": {
    "afternoonSwitchingDelta": "-31% compared to user 14-day afternoon baseline",
    "plannedVsActualDurationRatio": 0.83
  },
  "retentionStatus": {
    "dueReviewsCount": 1,
    "topic": "React Query Caching",
    "lastRecallScore": null
  }
}
```

This compact, dense summary allows the AI to provide sharp, personalized reasoning without hallucinations.

---

## 5. Epistemic Hierarchy: Observation vs. Pattern vs. Insight vs. Recommendation

> [!IMPORTANT]
> **Hard Invariant: Never collapse Observation, Pattern, Insight, and Recommendation into a single object.**
> Each level represents a different degree of synthesis and requires different mathematical support.

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                      THE EPISTEMIC HIERARCHY                            │
├─────────────────┬───────────────────────────────────────────────────────┤
│ OBSERVATION     │ "X happened."                                         │
│                 │ (A single verifiable event or metric from today)      │
├─────────────────┼───────────────────────────────────────────────────────┤
│ PATTERN         │ "X repeatedly happens under condition Y."             │
│                 │ (A multi-day or multi-session statistical recurrence) │
├─────────────────┼───────────────────────────────────────────────────────┤
│ INSIGHT         │ "X matters because it affects outcome Z."             │
│                 │ (A meaningful deduction connecting behavior to intent)│
├─────────────────┼───────────────────────────────────────────────────────┤
│ RECOMMENDATION  │ "Consider doing A to improve B."                      │
│                 │ (An actionable behavioral or scheduling suggestion)   │
└─────────────────┴───────────────────────────────────────────────────────┘
```

### 5.1 Concrete Comparison Matrix

| Level | Naive / Broken Tracker Behavior | ProductiveHix Behavioral Contract |
|---|---|---|
| **Observation** | *"You spent 4 hours on your computer today."* | *"Between 14:00 and 14:46, 38m of VS Code and 8m of Chrome docs were recorded during your 'useQuery demo' session."* |
| **Pattern** | *"You work better on Tuesdays!"* (Invented) | *"Across 14 comparable sessions, context switching between 15:00–18:00 is 2.7× higher than your 09:30–11:30 baseline (observed on 11 of 14 days)."* |
| **Insight** | *"You should focus more."* (Vague scolding) | *"Your highest-quality learning sessions consistently occur before 12:00. When difficult conceptual learning is scheduled after 15:00, context switching spikes and self-reported comprehension drops."* |
| **Recommendation** | *"Turn on do-not-disturb."* (Generic advice) | *"Schedule your upcoming 'infiniteQuery pagination' task between 09:30 and 11:30 tomorrow, and reserve the 15:00–17:00 window for lower-cognitive administrative tasks."* |

---

## 6. The Learning & Retention Loop (Spaced Active Recall & Deliberate Probing)

### 6.1 Why Productivity Trackers Fail at Learning
A developer can spend 4 hours reading React Query documentation and feel highly productive. Two weeks later, they cannot explain how query invalidation works. 

ProductiveHix treats **Learning as a first-class operational loop**, verifying cognitive retention through active recall:

```text
Day 0: Initial Acquisition
├── User sets Goal: "Learn React Query"
├── Executes 2 focus sessions (observed in docs + IDE)
├── Reflection: "Understood basic caching and useQuery"
└── Outcome: Task completed
        │
        ▼
Day 2: First Spaced Recall (Retrieval Strength Test)
├── System initiates quick active recall prompt
├── AI generates targeted retrieval question:
│   "When would you use queryClient.invalidateQueries() versus queryClient.setQueryData()?"
├── User provides natural-language response
├── AI Evaluator scores comprehension:
│   • Direct retrieval: User knows invalidate marks stale and refetches
│   • Nuance check: User forgot setQueryData performs immediate manual update
└── Result: Partial mastery logged; knowledge gap registered
        │
        ▼
Day 7: Second Spaced Recall (Application & Edge Cases)
├── AI retrieves prior gap: "manual cache update vs refetch"
├── AI generates deeper application probe:
│   "You have an optimistic mutation for a comment list. Why might invalidateQueries cause UI flicker, and how does setQueryData avoid it?"
├── User answers with deeper understanding
└── Result: Topic elevated to "Strong Retention"
        │
        ▼
Feedback Loop: Planning Adaptation
└── System suggests: "React Query core concepts mastered. Ready for infiniteQuery pagination."
```

### 6.2 Probing & Stop Guardrails
- **Not an endless chatbot**: The AI asks 1–2 sharp retrieval questions.
- **Graceful termination**: If the user answers correctly, the review concludes immediately (30–60 seconds). If a gap is detected, it offers 1 clarifying follow-up or logs the gap for later reinforcement. It **never nags or traps the user** in a prolonged quiz.
- **Adaptive Spacing**: Intervals follow expanding horizons ($t = 2\text{d}, 7\text{d}, 14\text{d}, 30\text{d}$).

---

## 7. System Architecture, Components & Repository Map

### 7.1 Component Architecture Diagram

```text
┌────────────────────────────────────────────────────────────────────────┐
│                          CLIENT COLLECTORS                             │
│                                                                        │
│   ┌───────────────────────────┐      ┌─────────────────────────────┐   │
│   │       Desktop Agent       │      │      Browser Extension      │   │
│   │  (ActivityWatch native)   │      │  (Manifest V3 Chrome Ext)   │   │
│   │  - Window titles          │      │  - Active tab URL / domain  │   │
│   │  - Process names          │      │  - 50m check-in prompts     │   │
│   │  - AFK / input monitor    │      │  - Focus timer guardrails   │   │
│   │  - OS sleep/wake hooks    │      │  - Quick review cards       │   │
│   └─────────────┬─────────────┘      └──────────────┬──────────────┘   │
└─────────────────┼───────────────────────────────────┼──────────────────┘
                  │ HTTP Ingest                       │ HTTP / WS
                  ▼                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        BACKEND APPLICATION (API)                       │
│                         (Express + TypeScript)                         │
│                                                                        │
│   ┌───────────────────────────┐      ┌─────────────────────────────┐   │
│   │     Ingestion Pipeline    │      │       Domain Services       │   │
│   │  - Normalization engine   │      │  - Daily Plan & Goals       │   │
│   │  - Day boundary resolver  │      │  - Work Sessions            │   │
│   │  - Gap detection logic    │      │  - Reflection & Check-ins   │   │
│   └─────────────┬─────────────┘      │  - Learning Topics & Review │   │
│                 │                    └──────────────┬──────────────┘   │
│                 ▼                                   ▼                  │
│   ┌────────────────────────────────────────────────────────────────┐   │
│   │                     PostgreSQL / Prisma ORM                    │   │
│   │  - User, DailyPlan, DailyGoal, Task, WorkSession               │   │
│   │  - CheckIn, NormalizedActivity, LearningAssessment             │   │
│   └────────────────────────────────┬───────────────────────────────┘   │
└────────────────────────────────────┼───────────────────────────────────┘
                                     │
                                     ▼
┌────────────────────────────────────────────────────────────────────────┐
│                      ANALYTICS & REASONING ENGINE                      │
│                                                                        │
│   ┌───────────────────────────┐      ┌─────────────────────────────┐   │
│   │          DuckDB           │      │    packages/analytics       │   │
│   │  - Parquet / raw slices   │      │  - SessionFeatures          │   │
│   │  - Fast aggregations      │      │  - DayFeatures              │   │
│   │  - Time distributions     │      │  - TransitionFeatures       │   │
│   │  - Rolling baselines      │      │  - Gap accounting features  │   │
│   └─────────────┬─────────────┘      └──────────────┬──────────────┘   │
│                 │                                   │                  │
│                 └─────────────────┬─────────────────┘                  │
│                                   ▼                                    │
│                     Compact Analytical Summary                         │
│                                   │                                    │
│                                   ▼                                    │
│   ┌────────────────────────────────────────────────────────────────┐   │
│   │                       AI Synthesis Layer                       │   │
│   │  - Daily understanding generation                              │   │
│   │  - Pattern & insight explanations (evidence-linked)            │   │
│   │  - Spaced retrieval question generation & answer grading       │   │
│   └────────────────────────────────┬───────────────────────────────┘   │
└────────────────────────────────────┼───────────────────────────────────┘
                                     │
                                     ▼
┌────────────────────────────────────────────────────────────────────────┐
│                          PRESENTATION SURFACES                         │
│                                                                        │
│   ┌────────────────────────────────────────────────────────────────┐   │
│   │                   Web Application (apps/web)                   │   │
│   │  - Next.js + React 19 + TailwindCSS + Lucide Icons             │   │
│   │  - 5 Navigation Groups: MAIN, WORK, LEARNING, UNDERSTAND, SYS  │   │
│   │  - Pages: / (Home), /today, /timeline, /tasks, /sessions,      │   │
│   │          /learning, /review, /insights, /patterns              │   │
│   │  - Strict Data Honesty (Zero fake metrics / no dummy splits)   │   │
│   └────────────────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────────────┘
```

---

### 7.2 Monorepo Structure & Package Responsibilities
- [apps/web](file:///c:/Users/prate/ProductiveHix/apps/web): Next.js web application. Design token compliant, glanceable Home, operational Today, objective Timeline, task/session manager, and learning review interfaces.
- [apps/extension](file:///c:/Users/prate/ProductiveHix/apps/extension): Chrome Extension. Compact 5-tab command center (`TODAY`, `FOCUS`, `REFLECT`, `REVIEW`, `MORE`), 50m check-in trigger, focus mode timer, and gap explanation modal.
- [apps/api](file:///c:/Users/prate/ProductiveHix/apps/api): Express REST & WebSocket server. Manages OAuth, device pairing (RFC 8628), telemetry ingestion, and domain CRUD.
- [packages/analytics](file:///c:/Users/prate/ProductiveHix/packages/analytics): Deterministic analytics engine. Feature extraction (`session.ts`, `day.ts`, `transitions.ts`, `check-in.ts`, `task.ts`), DuckDB integration, baseline calculations, and pattern detection logic.
- [packages/activitywatch](file:///c:/Users/prate/ProductiveHix/packages/activitywatch): ActivityWatch integration, event normalization, bucket discovery, and polling logic.
- [packages/db](file:///c:/Users/prate/ProductiveHix/packages/db): Prisma schema, database client, and PostgreSQL migrations.
- [packages/types](file:///c:/Users/prate/ProductiveHix/packages/types): Canonical TypeScript types shared across apps and packages (`productive-day.ts`, `timeline.ts`, `plan.ts`, `task.ts`, `check-in.ts`, `learning.ts`).
- [docs](file:///c:/Users/prate/ProductiveHix/docs): Architecture blueprints, UX contracts, and engineering guidelines.

---

## 8. Master 9-Phase Engineering Roadmap

Based on the unified product philosophy, the system engineering sequence is structured as follows:

```text
PHASE 1: Information Architecture & UX Contract
Status: COMPLETED (docs/PRODUCTIVEHIX_UX_CONTRACT.md locked v1.3)
Establish entity definitions, temporal boundaries, and page contracts.

PHASE 2: Design System Tokens, App Shell & Feature Primitives
Status: COMPLETED (Layout primitives, StatCard states, GoalCard visual states, feature extractors)
Unified Linear-inspired dark UI, zero fake metrics, canonical feature extractors.

PHASE 3: Evidence Model, Inactivity Explanation & Analytical Dataset
Status: CURRENT / NEXT
├── Model Telemetry Gaps and Inactivity Explanations in Prisma & domain types
├── Implement DuckDB ingestion & query layer for local activity slices
├── Build Gap Recovery workflow (extension prompt + web prompt on return)
├── Connect Goal + Task + Session + Telemetry + Reflection + Gap into unified dataset
└── Verify tripartite time calculations (Planned vs Actual vs Observed)

PHASE 4: Pattern Engine
Status: PENDING
├── Multi-day context switching recurrence algorithms
├── Afternoon vs morning focus degradation detectors
├── Interruption pattern detection (telemetry + reflection reasons)
└── Statistically validated thresholding (min 7-14 days history)

PHASE 5: Insight Engine
Status: PENDING
├── Deterministic, rule-based behavioral deductions
├── Evidence-citation engine (every insight links to exact sessions/timeline segments)
└── Distinction between Observation, Pattern, Insight, and Recommendation

PHASE 6: Daily Synthesis & AI Context Generation
Status: PENDING
├── Structured JSON prompt builder from DuckDB analytical extracts
├── Daily narrative synthesis generation (compact, honest, actionable)
└── Token-efficient LLM client integration with strict prompt bounds

PHASE 7: Learning & Retention Engine
Status: PENDING
├── Knowledge topic tracking and exposure logging (/learning)
├── Spaced-repetition scheduling algorithm (Day 2, 7, 14, 30)
├── Dynamic retrieval question generation via AI
├── User answer evaluation and knowledge gap tagging
└── Automated reinforcement loop back into Daily Planning

PHASE 8: Full API Integration & Synchronization Hardening
Status: PENDING
├── End-to-end ActivityWatch sync stability across OS sleep/wake cycles
├── Chrome Extension background service worker alarm resilience
└── Offline queueing and conflict-free telemetry ingestion

PHASE 9: Insights & Patterns UI Visualization
Status: PENDING
├── High-density behavioral correlation visualizer (/patterns)
├── Evidence drawer linking insights directly to timeline timestamps (/insights)
└── Learning mastery progression graph (/learning)
```

---

## 9. AI Agent Operating Rules & Anti-Hallucination Guardrails

Any AI coding agent working in this repository **must strictly obey** these rules:

1. **Strict Data Honesty**: Never write code that fabricates metrics, hardcodes trends (e.g. `+12%`), uses synthetic multipliers (e.g. `activeTime * 0.65`), or populates mock baseline numbers. If data does not exist, render an explicit empty or insufficient-data state.
2. **Never Send Raw Telemetry to LLMs**: Always route through DuckDB / canonical feature extractors first. LLMs must only receive structured analytical summaries.
3. **Never Infer Goal Achievement from Task Completion**: Goal outcome is a subjective self-assessment (`Achieved`, `Partially achieved`, `Not achieved`, `Not assessed`). Completing all tasks does not automatically equal goal success.
4. **Never Treat Telemetry Gaps as Slacking**: Machine offline or absent telemetry requires checking machine availability and prompting for user explanation.
5. **Preserve the Epistemic Separation**: Keep Observation, Pattern, Insight, and Recommendation strictly decoupled in data structures and UI surfaces.
6. **Consult This Blueprint First**: Before implementing any analytical feature, data migration, or UI workflow, verify alignment with this specification.
