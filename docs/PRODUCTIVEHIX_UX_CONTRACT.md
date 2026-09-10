# PRODUCTIVEHIX UX CONTRACT

**Version:** 1.3  
**Date:** September 7, 2026  
**Phase:** 1 — Information Architecture Audit & Product Contract  
**Status:** LOCKED & DEFINITIVE — Baseline for Phase 2 Implementation  

---

## 1. Executive Summary & Core Product Thesis

ProductiveHix helps the user compare **intention with actual behavior and outcomes**.

```text
                  PRODUCTIVEHIX
                       │
              ┌────────┴────────┐
              │                 │
           INTENTION          REALITY
              │                 │
        ┌─────┴─────┐      ┌────┴─────┐
        │           │      │          │
   Daily Plan    Tasks   Sessions   Activity
        │                   │          │
        ├ Goal              │      Desktop
        └ Priorities        │      Browser
                            │
                            └──────────┐
                                       │
                                  REFLECTION
                                       │
                                       ▼
                                    OUTCOME
                                       │
                         ┌─────────────┴─────────────┐
                         │                           │
                     Learning                   Analysis
                                                   │
                                             Insights/Patterns
                                                   │
                                                   ▼
                                              Next-day Plan
```

The system operates across three fundamental operational horizons:
1. **Intention**: Declaring what matters for the productive day (Daily Plan: 1 Daily Goal + 1–3 Daily Priorities) and structuring execution (Tasks).
2. **Observation & Execution**: Deliberate work blocks (Sessions) tracked against independently observed telemetry (ActivityWatch desktop + browser extension telemetry).
3. **Reflection & Understanding**: Subjective check-ins, spaced-repetition learning recall, and evidence-based behavioral analytics.

---

## 2. Core Entities & Mental Model

### 2.1 Entity Definitions

| Entity | Definition | Nature | Mutability |
| :--- | :--- | :--- | :--- |
| **Daily Plan** | The first-class planning container for one ProductiveHix productive day, resolved from the user's local timezone and configured day boundary. Composed of exactly 1 Daily Goal and 1–3 Daily Priorities. | Intention | Created at night or morning fallback; outcome assessed at day's end. |
| **Daily Goal** | The highest-level intention for a particular productive day. *"What would make today successful?"* | Intention | Exactly 1 per day. |
| **Daily Priority** | Strategic focus areas supporting the Daily Goal. | Intention | Exactly 1–3 per day. Linked directly to the Daily Goal. |
| **Task** | A discrete unit of work to accomplish. | Execution planning | N per day. Optionally supports a Daily Priority or Daily Goal. |
| **Session** | A deliberate, time-boxed execution instance associated with a task. | Deliberate execution | Started and ended intentionally by the user. |
| **Activity** | Observed desktop/browser behavior (window focus, active tabs, idle signals). | Passive observation | Continuous, immutable telemetry. |
| **Reflection** | A structured self-assessment of a work block (check-in / alignment). | Self-reporting | Periodic or on-demand subjective assessment. |
| **Learning** | A tracked knowledge topic and exposure history. | Knowledge acquisition | Persistent topic mastery and exposure logs. |
| **Review** | A spaced-repetition recall test on a specific learning item. | Knowledge retention | Scheduled recall prompts scored by confidence. |
| **Insight** | A derived behavioral observation (*"your estimates are consistently short"*). | Analysis | Deterministic, evidence-backed deduction. |
| **Pattern** | A recurring behavioral correlation (*"context switching → lower completion"*). | Analysis | Statistically backed correlation across time. |
| **Device** | A connected data collector (desktop agent, browser extension). | Infrastructure | Authenticated hardware / client node. |

---

### 2.2 Entity Relationship Hierarchy

The user mental model reflects clear intentional alignment while keeping task management flexible:

```text
PRODUCTIVE DAY
│
└── DAILY INTENTION (The Daily Plan)
    │
    ├── Daily Goal (exactly 1 per day)
    │   └── Daily Priorities (1–3 per day)
    │
    └── supporting Tasks (optional linkage)
            │
            └── Sessions (deliberate execution instances)

OBSERVED ACTIVITY (continuous, independently observed desktop + browser telemetry)
```

#### Cardinality & Coupling Invariants:
1. **The Daily Plan Structure**:
   - Exactly **1 Daily Goal**: Answers *"What would make today successful?"* (e.g., *"Ship the Timeline feature"*).
   - Exactly **1–3 Daily Priorities**: The strategic pillars supporting that goal (e.g., *1. Finish segmentation, 2. Verify ActivityWatch data, 3. Complete Timeline UI*).
   - *Anti-Pattern Prohibited:* Never ask the user for "3 Daily Goals". That destroys the hierarchy between the unifying daily outcome and its supporting pillars.
2. **Priority → Task (Optional Linkage)**:
   - A Task **may** support a Daily Priority.
   - A Task **may** support a Daily Goal directly (without a specific priority).
   - A Task **may exist independently** without any Daily Goal or Daily Priority.
   - *The task backlog must never be blocked by or strictly subordinate to the daily goal system.*
3. **Task → Session**: A Task can have multiple Sessions (`Task ├── Session 1 ├── Session 2 ...`). A Session is always attached to a specific task.
4. **Session vs. Activity**:
   - `Session ≠ timer`
   - `Session ≠ activity`
   - `Session ≠ task`
   - A **Session** represents intentional execution: *"I deliberately sat down to work on Task X."*
   - **Activity** represents observed reality: *"The operating system logged VS Code active for 38 minutes."*
   - Activity may overlap a session, extend outside it, or reveal context switching during it.
   - This enables the critical tripartite calculation:
     $$\text{Planned Target (e.g. 50m)} \longleftrightarrow \text{Actual Session Duration (e.g. 42m)} \longleftrightarrow \text{Observed Active Time (e.g. 36m)}$$

---

### 2.3 Disambiguation: `Daily Priority` vs. `Task Priority`

To prevent cognitive conflation in both UX and code:

| Attribute | `Daily Priority` | `Task Priority` |
| :--- | :--- | :--- |
| **Domain** | Daily Intention / Strategy | Operational Task Management |
| **Parent** | Daily Goal | Task |
| **Format** | Descriptive text string (e.g., *"Fix activity detection"*) | Enumerated urgency level (`URGENT`, `HIGH`, `MEDIUM`, `LOW`) |
| **Quantity** | Strictly 1–3 per day | Arbitrary per task |
| **Example** | A task can support **Daily Priority:** *"Fix activity detection"* while having **Task Priority:** `LOW` (a minor cleanup chore within that priority). |

---

### 2.4 Goal Outcome Lifecycle & Invariants

A Daily Goal is not a checkbox. Its lifecycle is strictly separated into three phases:

1. **Planning (Night or Morning)**: `Goal = Intention`. Created as the day's guiding focus.
2. **During the Day**: `Goal = Active Intention`. Visible context for focus sessions and prioritization.
3. **End of Day**: `Goal = Outcome Assessment`. The user reviews the day and assigns an outcome:
   - `Achieved`
   - `Partially achieved`
   - `Not achieved`
   - `Not assessed`

> [!IMPORTANT]
> **Hard Invariant: Goal outcome is NEVER automatically calculated from task completion.**  
> Completing 5/5 tasks does not prove a goal was achieved (e.g., Goal: *"Deeply understand React Query caching"*; Tasks: 5/5 tutorials completed, but comprehension was not achieved). The outcome requires subjective self-assessment.

---

## 3. The ProductiveHix Temporal, Planning & Availability Model

### 3.1 Five Decoupled Temporal Concepts

We explicitly separate five distinct concepts that must never be conflated:

$$\text{Productive Day Boundary} \ne \text{Typical Sleep Time} \ne \text{Quiet Hours} \ne \text{Machine Availability} \ne \text{User Inactivity}$$

1. **Productive Day Boundary**:
   - An explicit, configurable cut-off hour (e.g., `04:00 AM`).
   - Defines which ProductiveHix date an event, goal, task, session, or telemetry segment belongs to.
   - *Never defined as "sleep onset" or variable bedtime.*
2. **Typical Sleep Time**:
   - A user preference (e.g., `01:30 AM`).
   - Used to schedule the pre-sleep planning reminder and inform default quiet hours.
3. **Quiet Hours**:
   - A user notification suppression window (e.g., `01:00 AM` to `08:30 AM`).
4. **Machine Availability**:
   - Whether the system is awake and capable of producing valid activity/interaction evidence.
   - Suspended, hibernated, shut down, or otherwise unavailable states do not accumulate inactivity.
   - *Locked Session Invariant:* A locked session must not be treated as user activity and must not accumulate Away Review time unless valid interaction evidence resumes.
5. **User Inactivity**:
   - A behavioral state derived from availability + observed interaction, rather than a system configuration.
   - Inactivity accumulates *only* when the machine is available, awake, and the session is unlocked without active interaction.

---

### 3.2 Machine Availability & Inactivity State Machine

```text
                    ┌────────────────────┐
                    │   MACHINE OFFLINE  │
                    │ sleep/shutdown/etc │
                    └─────────┬──────────┘
                              │
                         resume/wake
                              │
                              ▼
                    ┌────────────────────┐
                    │ MACHINE AVAILABLE  │
                    └─────────┬──────────┘
                              │
                       activity detected
                              │
                              ▼
                    ┌────────────────────┐
                    │  ACTIVE / ENGAGED  │
                    └──────┬───────┬─────┘
                           │       │
                plan missing│       │ Meaningful active work
                           │       │ (evidence threshold)
                           ▼       ▼
                    Plan Today   Reflect
                           │
                           │
                           └─────────────┐
                                         │
                                 activity stops
                                         │
                                         ▼
                              ┌──────────────────┐
                              │ INACTIVE / AWAY  │
                              └────────┬─────────┘
                                       │
                                60m continuous
                                + machine available
                                       │
                                       ▼
                                 Away Review

And separately:
ACTIVE / ENGAGED ── approaching expected bedtime ──► Night Planning Reminder ──► Plan Tomorrow
```

---

### 3.3 Availability & Inactivity Invariants (Fixing the 6-Hour Away Bug)

> [!CAUTION]
> **Defect in Prior Version:** If the user slept from 03:00 to 08:30 and opened their laptop at 09:02, the old system calculated 6 hours of inactivity and prompted: *"You were away for 6 hours! Review your time."* This is completely broken.

#### Hard Invariants:
1. **Machine Unavailable ≠ Inactive**:
   When a laptop lid closes, OS suspends, or machine shuts down, the machine is `UNAVAILABLE`. Inactive duration accumulation is reset to `0`.
2. **Sleep ≠ Inactivity**:
   Confirmed system suspend/resume or hours falling within the configured sleep window do **NOT** accumulate inactive time and **MUST NEVER** generate an Away Review.
3. **Away Review Eligibility**:
   An Away Review is triggered **strictly and only** when:
   $$\text{Machine is Available (Awake)} \wedge \text{Continuous Inactivity} \ge 60\text{ min} \wedge \text{Not Suspend/Shutdown} \wedge \text{Outside Sleep Window}$$
4. **Three Distinct, Decoupled Engines**:
   - **Reflection Engine**: Meaningful active computer work reaching eligibility threshold $\longrightarrow$ `[Reflect]` notification.
     > **Guardrail:** The exact algorithm for determining *"meaningful active time"* is an implementation concern of the evidence/trigger engine and must not be inferred from raw tab or window duration alone (e.g. leaving a browser tab open for 50 minutes is not 50 minutes of meaningful active work).
   - **Away Review Engine**: ~60m continuous inactivity while the machine remains actively available $\longrightarrow$ `[Away Review]` prompt.
   - **Sleep / Machine Offline Engine**: Hardware sleep / suspend / power off $\longrightarrow$ 0 inactive time accumulated, 0 away reviews generated.

---

### 3.4 The Complete Daily Planning Lifecycle

#### 1. Night Planning Workflow ("Plan Tomorrow")
- **Timing**: ~45 minutes before expected sleep (e.g. `00:45 AM` for `01:30 AM` sleep).
- **Notification**: Explicitly about **TOMORROW**:
  ```text
  ProductiveHix
  Plan tomorrow?
  Set your goal and priorities for tomorrow before you finish your day.
  [ Plan Tomorrow ]
  ```
- **Execution**: Opens a lightweight 30–60 second modal in Extension or Web:
  - Tomorrow's Goal (1)
  - Priorities (1–3)
  - `[ Save Tomorrow's Plan ]`
- **If Skipped / Ignored**: Do **not** nag repeatedly. The state transitions quietly to `Skipped`. The system waits for the morning fallback.

#### 2. Morning Fallback Workflow ("Plan Today")
- **Timing**: **Activity-triggered**, not purely clock-triggered!
  $$\text{Day-start window reached} \wedge \text{Machine becomes available} \wedge \text{Meaningful activity detected} \wedge \text{Today's Plan is Missing}$$
- **Behavior**: If the user wakes at 07:30 or 10:15, the prompt fires only when they actually sit down and interact with their browser or IDE.
- **Notification**: *"Set today's goal — What would make today successful? [ Plan Today ]"*
- **Execution**: 30–60 second fast flow. Setting tasks is **optional**.

#### 3. Execution & Daytime Work
- Normal Today experience. Focus sessions on tasks + passive telemetry capture.
- Meaningful active work reaching the reflection threshold triggers periodic check-ins.

#### 4. End-of-Day Assessment
- User reviews: Goal outcome (`Achieved`, `Partially achieved`, `Not achieved`, `Not assessed`).
- Seamlessly transitions into night planning for tomorrow.

---

## 4. Global UX Principles

### Principle 1: Strict Data Honesty (Zero Fake Data)
> **Hard Rule:** No UI element may display a quantitative value unless the source, calculation, and freshness of that value are known and verifiable.

- Prohibited: Invented metrics, hardcoded trends (e.g., `+12%`), synthetic multipliers (`activeTime * 0.65`), mock graphs, fabricated session tables.
- In Phase 2, layout slots (such as KPI cards and progress counts) must be implemented with real values, empty states, loading states, or insufficient-data states—not dummy numbers hardcoded into presentation props.
- If data is missing or telemetry is disconnected, the system must render an honest empty or disconnected state.

### Principle 2: Progressive Disclosure
> **Hard Rule:** Show the minimum information required for the current decision; expose deeper evidence through intentional drill-down.

- Primary surfaces must be fast and legible in seconds.
- Deep evidence (raw activity timelines, complete session logs, statistical correlation graphs) lives behind explicit drill-down actions.

### Principle 3: Empty State vs. Insufficient Data State
Surfaces that compute analytics or trends must distinguish between two distinct conditions:
- **Empty State**: No data exists yet (e.g., 0 focus sessions logged). Primary action: CTA to record the first entry.
- **Insufficient Data State**: Some data exists, but not enough history to form statistically valid insights (e.g., *"3 sessions logged. 7 more sessions needed before optimal focus window can be calculated."*).

---

## 5. Current-State Audit & Disposition (Web App)

| Route | Current Role | Current Implementation Reality | Main Problems | Disposition |
| :--- | :--- | :--- | :--- | :--- |
| `/` | Overview | Omnibus dashboard (KPIs, live activity, check-in form, task list, learning preview, insights) | **P0 Violation**: Fabricates time splits (`activeTime * 0.65`), hardcodes trends (`+12%`). Tries to do 6 jobs at once. | **RENAME to Home (`/`) & REDUCE**: Transform into a 15-second glanceable summary. |
| `/today` | Today | "Personal Operating System" static card, hardcoded `timeBlocks` array, fake preview metrics | **P0 Violation**: Completely fake. No real Daily Goal, no real tasks, no real sessions. | **COMPLETE REBUILD**: Make this the primary operational center of the application. |
| `/timeline` | Timeline | Date navigation, proportional flow bar, category filters, chronological segments, detail drawer | **P2 Quality**: Built on real telemetry (`NormalizedActivity`). Accurate and responsive. | **KEEP**: Mature evidence surface. Fix timezone boundary calculation. |
| `/tasks` | Tasks | Task workload bar, quick add, status tabs, task lists, comprehensive TaskDetailDrawer | **P1 Defect**: Functional, but missing link to Daily Goal / Daily Priority. | **KEEP & EXTEND**: Add optional Daily Goal & Priority associations. |
| `/sessions` | Sessions | "Building Your Baseline" hero, fake KPI sparklines, hardcoded session table (Sep 1–4), fake heatmap | **P0 Violation**: 100% fabricated static data. Completely disconnected from `WorkSession` API. | **COMPLETE REBUILD**: Rebuild with real Prisma `WorkSession` records and telemetry correlation. |
| `/learning` | Learning | `BaselinePlaceholder` with hardcoded numbers (8 topics, 82% recall) | **P1 Defect**: Non-functional placeholder violating data honesty. | **REPLACE in Phase 7**: Build real knowledge topic tracking. |
| `/review` | Review | `BaselinePlaceholder` with fake metrics (2 prompts due, 4.2 confidence) | **P1 Defect**: Non-functional placeholder violating data honesty. | **REPLACE in Phase 7**: Build real spaced-repetition recall engine. |
| `/insights` | Insights | `BaselinePlaceholder` with fake metrics (75m fatigue point, 68% deep work) | **P1 Defect**: Non-functional placeholder violating data honesty. | **REPLACE in Phase 8**: Build real deterministic behavioral insights. |
| `/patterns` | Patterns | `BaselinePlaceholder` with fake metrics (+34% task completion, 14m recovery) | **P1 Defect**: Non-functional placeholder violating data honesty. | **REPLACE in Phase 8**: Build real correlation graph. |
| `/devices` | Devices | Desktop agent status, browser telemetry card, pairing form, ingestion stream | **P2 Quality**: Connected to real APIs and WebSocket. Minor fallback cleanup. | **KEEP**: Dedicated infrastructure health page. |
| `/settings` | Settings | Profile info, DuckDB path, telemetry toggles (all static HTML) | **P2 Defect**: Non-interactive shell. No functional configuration controls. | **EXTEND in Phase 6**: Wire real reflection, focus, and quiet hours settings. |
| `/pair` | Pair | Standalone RFC 8628 pairing interface | **P3 Quality**: Clean, functional device authentication flow. | **KEEP**: Works as intended. |

---

## 6. Information Architecture & Navigation

### 6.1 Simplified Web Navigation Structure

```text
MAIN
  Home             /                 Glanceable daily summary (15s read)
  Today            /today            The operational day (Intention + Now + Tasks + Reality)

WORK
  Tasks            /tasks            Task backlog and workload management
  Sessions         /sessions         Deliberate execution records

LEARNING
  Learning         /learning         Tracked knowledge topics & study exposure
  Review           /review           Spaced-repetition active recall test

UNDERSTAND
  Timeline         /timeline         Evidence surface: what actually happened (ActivityWatch + Browser)
  Insights         /insights         Derived behavioral observations
  Patterns         /patterns         Statistical behavioral correlations over time

SYSTEM
  Devices          /devices          Infrastructure health & connection status
  Settings         /settings         Preferences, quiet hours & configuration
```

---

## 7. Page-by-Page Decision & Action Contracts

---

### 7.1 HOME (`/`)

> **Role: Glance.** Home summarizes the day's high-level status. It is **not** a second Today page. It answers: *"How is my day going overall?"* in 10–20 seconds.

| Dimension | Specification |
| :--- | :--- |
| **Primary Decision** | *"How is my overall day progressing and where should I direct my attention?"* |
| **Primary Action** | `[View Today]` (navigates to `/today`) |
| **Secondary Actions** | `[Plan Today]` (if no goal set), `[Start Focus]` (if goal exists) |
| **Passive Information** | Daily Goal title, high-level task completion count (e.g. "4/7 tasks"), total active tracked time today, system sync status indicator. |

#### Sections:
1. **Day Summary Header**: Date, Today's Goal Title, Goal State, `[View Today]` link.
2. **Progress at a Glance**: Completed vs. remaining task ratio (e.g. `6 / 9 tasks`), total focus session duration logged today.
3. **Current Pulse**: Current active application/domain (1-line live signal) and tracking connectivity status.
4. **Learning Snapshot**: Reviews due count badge (only if > 0).

#### Explicitly Prohibited on Home:
- No full task manager or task CRUD (lives in Tasks)
- No interactive timer controls or Pause/End buttons (lives in Today / Focus)
- No inline reflection questionnaire forms (lives in Extension / Dedicated flow)
- No full chronological activity timeline or flow bars (lives in Timeline)
- No analytical graphs or behavioral insight cards (lives in Insights/Patterns)

---

### 7.2 TODAY (`/today`)

> **Role: Work with the day.** Today is the central execution surface. It answers: *"What am I trying to accomplish, what am I doing right now, and how does reality compare to my intention?"*

| Dimension | Specification |
| :--- | :--- |
| **Primary Decision** | *"What intentional task should I work on right now?"* |
| **Primary Action** | `[Start Focus]` on the selected task (or `[Plan Today]` if no goal exists) |
| **Secondary Actions** | `[Edit Goal]`, `[Add Task]`, `[Reflect Now]`, `[Assess Goal Outcome]` (end of day) |
| **Passive Information** | Daily Goal text, Daily Priorities (1–3), Current activity evidence, Task completion counts, Reflection schedule. |

#### Content Hierarchy (In Order):
```text
TODAY
│
├── 1. TODAY'S PLAN (Intention)
│      Goal: "Finish ProductiveHix trigger system"
│      Priorities: 1. Activity detection | 2. Sleep/wake | 3. Notifications
│      Action: [ Edit Plan ]
│
├── 2. CURRENT FOCUS / NOW (The Live Layer)
│      Active Session: "Implement inactivity engine" (running 24:12)
│      Observed App: VS Code (activity-engine.ts)
│      Session Controls: Pause / Complete / Stop
│
├── 3. TODAY'S TASKS (Execution Planning)
│      Grouped by: Supporting Priority 1 | Supporting Priority 2 | Other Tasks
│      Summary: "4 of 7 completed"
│      Action: Inline fast task selector + link to full /tasks
│
└── 4. TODAY'S REALITY (Observation & Reflection)
       Activity Summary: Observed active time (Desktop + Browser)
       Reflection Status: Next reflection due in ~18m | [Reflect Now]
       Link: "Inspect full timeline →"
```

---

### 7.3 TIMELINE (`/timeline`)

> **Role: Evidence surface.** Answers: *"What actually happened on my machine?"* Presents normalized, passive desktop and browser telemetry.

| Dimension | Specification |
| :--- | :--- |
| **Primary Decision** | *"Did my actual behavior align with what I intended to do during this time window?"* |
| **Primary Action** | Change date / select category filter |
| **Secondary Actions** | Expand segment detail, inspect domain/window titles |
| **Passive Information** | Chronological segment stream, proportional daily flow bar, category summary totals. |

> [!NOTE]
> **Observation Semantics Guardrail:** Timeline's role is objective evidence. Raw telemetry must be categorized by observable characteristics (e.g. `Desktop application`, `Browser web activity`, `AFK / Idle`, `Other`), NOT subjective labels like "focused", "productive", or "efficient" unless a formal, user-configured computation is established.

---

### 7.4 TASKS (`/tasks`)

> **Role: Work backlog & task management.** Owns the lifecycle, metadata, and organization of all tasks.

| Dimension | Specification |
| :--- | :--- |
| **Primary Decision** | *"What tasks exist, how much effort do they require, and how do they connect to my priorities?"* |
| **Primary Action** | Create task / start focus session on task |
| **Secondary Actions** | Filter by Daily Priority, edit estimates, view session history drawer |
| **Passive Information** | Total planned vs. actual time, completion ratios, priority badges. |

---

### 7.5 SESSIONS (`/sessions`)

> **Role: Deliberate execution records.** Answers: *"When and how effectively did I deliberately work?"*

| Dimension | Specification |
| :--- | :--- |
| **Primary Decision** | *"Where is my deliberate focus effort going?"* |
| **Primary Action** | Filter session history by date or task |
| **Secondary Actions** | View session execution detail (target vs. actual session duration vs. observed telemetry) |
| **Passive Information** | Total session duration, completed sessions count, planned vs. actual time comparison. |

*(Note: Speculative metrics like "focus efficiency ratio" are prohibited until mathematical semantics are formally defined).*

---

### 7.6 LEARNING (`/learning`) & REVIEW (`/review`)

- **Learning (`/learning`)**: Knowledge acquisition. Answers: *"What topics am I currently studying?"* Primary action: Add new study topic or log learning material.
- **Review (`/review`)**: Knowledge retention. Answers: *"Can I actively recall this material?"* Primary action: Start spaced-repetition recall flashcard session.

---

### 7.7 INSIGHTS (`/insights`) & PATTERNS (`/patterns`)

- **Insights (`/insights`)**: Deterministic, rule-based behavioral deductions. Primary action: Inspect supporting timeline evidence.
- **Patterns (`/patterns`)**: Multi-day behavioral correlations. Primary action: Adjust schedule or focus presets based on correlation.

---

### 7.8 DEVICES (`/devices`) & SETTINGS (`/settings`)

- **Devices (`/devices`)**: Hardware collectors. Answers: *"Are my Desktop Agent and Browser Extension syncing reliably?"* Primary action: Pair new device or trigger manual sync flush.
- **Settings (`/settings`)**: Preferences. Answers: *"How do I tailor check-ins, quiet hours, and data privacy?"* Primary action: Update reflection interval or quiet hour schedules.

---

## 8. Extension Architecture & Workflows

### 8.1 Extension Navigation & Views

The extension is a **compact command center**, not a mini web dashboard.

```text
[ TODAY ]   [ FOCUS ]   [ REFLECT ]   [ REVIEW ]   [ MORE ]
```

#### Persistent Views:
- **TODAY**: Current status & next step. Displays the `Today's Plan` card, live current app/tab, next scheduled task, quick `[Start Focus]`, and reflection countdown.
- **FOCUS**: Single-task execution timer (25m / 50m / Custom), Pause / Complete controls.
- **REFLECT**: Subjective focus reflection check-in questionnaire (alignment, blockers, energy).
- **REVIEW**: Spaced-repetition active recall flashcard prompt.
- **MORE**: Operational controls, pairing status, diagnostics, web app launcher.

#### Temporary Contextual Workflows:
1. **Plan Today**: Morning fallback or manual daily planning workflow (Goal + 1–3 Priorities).
2. **Plan Tomorrow**: Evening pre-sleep intention setting.
3. **Reflect**: Sustained active work check-in modal.
4. **Focus Completion**: Post-focus outcome evaluation (`Completed` / `Made progress` / `Got blocked`).
5. **Away Review**: Inactivity prompt after 60m continuous idle while computer was available.
6. **Quick Review**: Single-card knowledge recall test.

---

### 8.2 Extension "Today's Plan" Card UX Specification

#### State A: Planned Day
```text
┌─────────────────────────────────────────┐
│ TODAY'S PLAN                            │
│                                         │
│ Ship the Timeline                       │
│                                         │
│ 1  Fix segmentation                     │
│ 2  Verify ActivityWatch                 │
│ 3  Finish Timeline UI                   │
│                                         │
│ [ Edit Plan ]                           │
└─────────────────────────────────────────┘
```

#### State B: Unplanned Day
```text
┌─────────────────────────────────────────┐
│ YOUR DAY HASN'T BEEN PLANNED            │
│                                         │
│ What would make today                   │
│ successful?                             │
│                                         │
│ [ Set Today's Goal ]                    │
└─────────────────────────────────────────┘
```

---

## 9. Quick Capture Specification

### Architectural Placement & Classification:
- **Classification**: **P1 High-Value Candidate Capability** (an acceleration mechanism, not foundational to the core product loop).
- **Placement**:
  1. **Web App**: Global keyboard shortcut (`Cmd/Ctrl + K` or `Q`) opening a transient quick-capture modal to add a task without leaving context.
  2. **Extension**: Quick-add icon button (`+`) in the header of the extension popup.
  3. **Prohibition**: Quick Capture must **NOT** become a dedicated sidebar navigation item.

---

## 10. Implementation Roadmap & Phase 2 Visual Prototyping

### 10.1 Phase 2 Visual Prototyping Scope & Guardrails

> [!IMPORTANT]
> **Phase 2 Scope Guardrail:**  
> Phase 2 may prototype the visual states, styling, tokens, and interaction surfaces for `Plan Today`, `Plan Tomorrow`, `Daily Goal`, `Daily Priorities`, and `Goal Outcome`. Phase 2 **must NOT** implement their persistence, API contracts, database models, React Query integration, business rules, or notification scheduling. Those belong to Phase 3.

#### 1. `GoalCard` Component Visual States (Presentation Primitive):
The `GoalCard` component should accept a display mode (`mode: "today" | "tomorrow" | "historical"`) and support the following 6 visual states:
1. `planned`: Displays Goal title, 1–3 Daily Priorities, and `[ Edit Plan ]` button.
2. `unplanned`: Displays empty state card with *"What would make today successful?"* and `[ Plan Today ]` CTA.
3. `editable`: Form state with Goal title input and 1–3 Daily Priority text fields.
4. `planning-tomorrow`: Night planning variant titled *"Tomorrow's Plan"* with tomorrow's date badge.
5. `outcome-pending`: End-of-day banner asking *"How did today go?"* with outcome options (`[ Achieved ]`, `[ Partially achieved ]`, `[ Not achieved ]`, `[ Not assessed ]`).
6. `outcome-assessed`: Read-only historical state with the assigned outcome badge (`Achieved` / `Partially achieved` / `Not achieved`).

#### 2. Extension View Prototypes:
- `TodayView`: Unplanned state with `[ Set Today's Goal ]` button.
- `TodayView`: Planned state with Daily Plan card.
- `PlanTodayModal` / `PlanTomorrowModal`: Fast 30–60s visual flow for setting Goal + 1–3 Priorities.

---

### 10.2 Sequential Phase Roadmap

```text
PHASE 1 (Completed)
UX Contract & Information Architecture
This document.
        ↓
PHASE 2
Design System Tokens & App Shell
├── Establish CSS design tokens (typography, spacing, borders, dark palette)
├── Rebuild Sidebar navigation into 5 core groups (MAIN, WORK, LEARNING, UNDERSTAND, SYSTEM)
├── Create reusable PageContainer, StatCard, DataBadge, and GoalCard (6 visual states)
├── Implement empty vs. insufficient data state components
├── Prototype Extension TodayView (planned/unplanned) and Plan Today/Tomorrow workflows
└── Remove all fabricated "Building Your X Baseline" placeholders
        ↓
PHASE 3
Domain Platform: Timezone Resolver & Daily Planning
├── Establish Timezone + Productive Day Resolver as a shared domain primitive
├── Prisma migration: DailyGoal and DailyPriority data models
├── Implement Daily Goal backend capabilities
├── Rebuild /today with real Daily Goal & Daily Priorities interface
├── Implement 30-60 second "Plan Today" workflow (web + extension)
├── Rebuild / (Home) as glanceable 15-second summary surface
└── Fix Activity/Timeline day-boundary query using the shared resolver
        ↓
PHASE 4
Task Relationship, Sessions & Real Analytics
├── Prisma migration: Link Tasks optionally to DailyPriority / DailyGoal
├── Rebuild /sessions with real Prisma WorkSession data and telemetry correlation
├── Add session runner trigger directly from /today
├── Implement Quick Capture modal (global shortcut)
└── Implement End-of-Day Goal Outcome assessment flow
        ↓
PHASE 5
ActivityWatch, Availability & Inactivity Synchronization
├── Implement Availability Invariant: Machine Unavailable ≠ Inactive (OS suspend/resume integration)
├── Throttle extension and desktop agent health polling
├── Link extension periodic heartbeat to content script user activity state
└── Separate Reflection vs. Learning Review workflows in extension
        ↓
PHASE 6
Settings & Infrastructure Hardening
├── Implement real interactive Settings (reflection frequency, focus presets, quiet hours)
└── Clean up Devices diagnostics stream
        ↓
PHASE 7
Learning & Active Recall Review
├── Implement Learning topic management (/learning)
└── Implement Spaced-Repetition active recall flashcard interface (/review)
        ↓
PHASE 8
Deterministic Insights & Patterns
├── Implement rule-based behavioral insights computation
└── Implement pattern correlation visualizer
```

---

> [!NOTE]
> This contract (v1.3) represents the locked, unambiguous specification for ProductiveHix. All subsequent phases must conform strictly to the entities, temporal models, availability invariants, and page responsibilities codified herein.
