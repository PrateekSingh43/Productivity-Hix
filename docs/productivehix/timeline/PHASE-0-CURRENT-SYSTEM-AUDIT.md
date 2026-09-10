# Phase 0 — Current System Audit

**Document:** `docs/productivehix/timeline/PHASE-0-CURRENT-SYSTEM-AUDIT.md`  
**Status:** COMPLETE CONSOLIDATED AUDIT  
**Scope:** Observational, repository-grounded audit of ProductiveHix's current telemetry, normalization, classification, aggregation, analytics, and timeline presentation pipelines.

---

## 1. Audit Scope

This document records the **current implementation reality** of ProductiveHix as of September 2026. It documents what the code actually does today—not what it should become in future phases. It does not speculate or describe future architectures as existing facts.

Throughout this audit, all system components and operations are characterized by their epistemic nature:
- `[OBSERVED]`: Direct sensor outputs from OS or browser APIs.
- `[DERIVED]`: Deterministic transformations, string normalizations, or interval calculations.
- `[HEURISTIC]`: Rule-based pattern matching, regex searches, or name-based categorizations.
- `[ANALYTICAL]`: Statistical summaries, rollups, or duration aggregations.
- `[USER-DECLARED]`: User-supplied planning, reflection, or configuration inputs.
- `[AI-INFERRED]`: Machine learning or LLM model outputs (currently absent from this pipeline).

---

## 2. Executive Summary

The inspected ProductiveHix implementation contains an operational ingestion path for raw telemetry capture, multi-source integration (ActivityWatch desktop + Chrome Extension), and chronological timeline visualization. The interval-normalization logic in `packages/analytics` is specifically designed with an invariant to prevent double-counting / overlapping active duration, ensuring that active durations do not exceed wall-clock elapsed time.

However, the current classification and analytics architecture suffers from systematic semantic conflation:
$$\text{Application Name} \longrightarrow \text{Activity Meaning} \longrightarrow \text{Focus} \longrightarrow \text{Productivity}$$

Specifically:
1. **Application $\equiv$ Focus**: Any process matching `"code"`, `"cursor"`, `"antigravity"`, or `"terminal"` is automatically assigned `category = "focused"` upon ingestion.
2. **Category $\equiv$ Productivity**: Downstream session analytics (`packages/analytics/src/features/session.ts`) derives `productiveDurationSeconds` strictly by filtering for `category === "focused"`. Work in browsers (e.g. reading technical documentation, pull request reviews, cloud consoles) is excluded from productive time.
3. **Domain Blacklist $\equiv$ Distraction**: A static 16-item regex blacklist treats visits to domains like YouTube or Reddit as `category = "leisure"` and automatically tallies them as `distractionTransitions` in `packages/analytics/src/features/transitions.ts`, ignoring educational tutorials or technical research.
4. **Timeline Operates Blind to Intent**: The entire timeline pipeline queries and groups activity with zero awareness of the user's active `DailyGoal` or `Task`.
5. **Sensor Silence $\equiv$ Break**: The system relies on AFK silence thresholds ($\ge 60\text{s}$) to carve active windows into "breaks", conflating machine inactivity with human rest and lacking awareness of machine sleep or offline gap explanations.

---

## 3. End-to-End Current Data Flow

The data flow from physical client sensors to the rendered Timeline UI spans eight discrete stages:

```text
[1. Sensor Collection]
 ActivityWatch (aw-watcher-window, aw-watcher-afk, aw-watcher-input) & Chrome Extension
        │ [OBSERVED]
        ▼
[2. Ingestion Normalization]
 packages/telemetry/src/normalization/activitywatch.ts & browser.ts
        │ [DERIVED]
        ▼
[3. Relational Persistence & Live Broadcast]
 PostgreSQL (prisma.normalizedActivity) & DuckDB (raw parquet) & WebSocket
        │ [DERIVED]
        ▼
[4. Query & Day Boundary Resolution]
 apps/api/src/services/activity/timeline.ts (getDayBoundaries + findMany)
        │ [DERIVED]
        ▼
[5. Canonical Transformation & Preliminary Categorization]
 packages/analytics/src/activity/segments.ts (normalizeRawActivityEvents + categorizeActivity)
        │ [HEURISTIC]  <-- Primary Leakage
        ▼
[6. Interval Normalization & Precedence Carving]
 packages/analytics/src/activity/segments.ts (normalizeIntervals)
        │ [DERIVED]
        ▼
[7. Temporal Consolidation & Summary Computation]
 packages/analytics/src/activity/segments.ts (aggregateActivitySegments + computeTimelineSummary)
        │ [ANALYTICAL]
        ▼
[8. API Delivery & UI Presentation]
 apps/api/src/routes/activity.ts → useTimeline (React Query) → apps/web/app/timeline/page.tsx
        │ [OBSERVED]
```

### Stage 1: Raw Sensor Collection
- **Files**: Native daemons (`aw-watcher-window`, `aw-watcher-afk`, `aw-watcher-input`) and `apps/extension/src/background`.
- **Input**: OS window hooks, input idle timers (default AW AFK threshold: 180s), Chrome tab events (`onActivated`, `webNavigation.onCompleted`).
- **Output**: JSON event payloads containing timestamps, durations, process names, window titles, tab URLs, and keypress/click counts.
- **Truth Type**: `[OBSERVED]`.
- **Current Limitations**: Raw observations are records of what a sensor reported. They can be noisy, stale, or incomplete (e.g. leaving VS Code in the foreground while walking away reports VS Code active until the AFK timer trips).

### Stage 2: Ingestion Normalization
- **Files**: `packages/telemetry/src/normalization/activitywatch.ts`, `packages/telemetry/src/normalization/browser.ts`.
- **Functions**: `normalizeActivityWatchWindowEvent`, `normalizeActivityWatchAfkEvent`, `normalizeBrowserTabEvent`.
- **Input**: Raw collector payloads.
- **Output**: `DesktopWindowEvent`, `DesktopAfkEvent`, `BrowserActivityEvent`.
- **Truth Type**: `[DERIVED]`.
- **Current Limitations**: `sanitizeUrl` strips all query parameters (`?v=...`, `?q=...`) to protect privacy, but permanently deletes video IDs, document anchors, and search terms needed for contextual understanding.

### Stage 3: Persistence & Live Ingestion
- **Files**: `apps/api/src/routes/telemetry.ts` (`handleTelemetryBatch`).
- **Input**: Telemetry batch request body.
- **Output**: Writes to PostgreSQL (`normalized_activity` table), DuckDB raw storage (`ingestTelemetryEvents`), and WebSocket broadcast (`wsManager.broadcastToUser`).
- **Truth Type**: `[DERIVED]`.
- **Current Limitations**: Stores concurrent, overlapping desktop window and browser tab events side-by-side without resolving cross-sensor precedence at write time.

### Stage 4: Day Boundary Resolution & Range Query
- **Files**: `apps/api/src/services/activity/timeline.ts` (`getDayBoundaries`, `getTimelineForDay`).
- **Input**: `userId`, `dateStr` (`YYYY-MM-DD`), IANA `timezone`.
- **Output**: Array of Prisma `NormalizedActivity` rows ordered by `timestamp ASC`.
- **Truth Type**: `[DERIVED]`.
- **Current Limitations**: Queries strictly between local midnight (00:00:00.000) and 23:59:59.999. Activities crossing the midnight boundary are cut off or omitted if they started on the preceding day.

### Stage 5: Canonical Transformation & Categorization
- **Files**: `packages/analytics/src/activity/segments.ts`.
- **Functions**: `normalizeRawActivityEvents`, `normalizeAppName`, `cleanWindowTitle`, `categorizeActivity`.
- **Input**: Raw database rows.
- **Output**: `CanonicalActivityEvent[]`.
- **Truth Type**: `[HEURISTIC]`.
- **Current Limitations**: Executes string matching against `application` and `title`. If an application contains `"code"`, `"cursor"`, or `"terminal"`, it burns `category: "focused"` directly onto the canonical event.

### Stage 6: Interval Normalization & Precedence Carving
- **Files**: `packages/analytics/src/activity/segments.ts` (`normalizeIntervals`).
- **Input**: `CanonicalActivityEvent[]`.
- **Output**: Chronologically sorted, non-overlapping active intervals and merged AFK break intervals.
- **Truth Type**: `[DERIVED]`.
- **Current Limitations**:
  - Merges AFK events $\ge 60\text{s}$ into breaks; suppresses AFK $< 60\text{s}$.
  - Carves active desktop events around AFK breaks (sensor inactivity takes precedence over open windows).
  - Enriches desktop browser windows with overlapping browser extension tab domains/titles.
  - Clips active overlapping events so $\sum \text{durations} = \text{wall-clock active elapsed time}$. Background audio (e.g. music) is clipped out if an active window is in focus.

### Stage 7: Temporal Consolidation & Summary Computation
- **Files**: `packages/analytics/src/activity/segments.ts` (`aggregateActivitySegments`, `computeTimelineSummary`).
- **Input**: Normalized non-overlapping intervals.
- **Output**: `TimelineSegment[]` and `TimelineSummary`.
- **Truth Type**: `[ANALYTICAL]`.
- **Current Limitations**:
  - **Pass 1 (Transient Absorption)**: Runs of non-AFK events $\le 15\text{s}$ flanked by compatible work within 120s are absorbed into the main segment (e.g. quick terminal popup absorbed into VS Code). Absorbed titles are preserved in `contexts: ["(Brief: ...)"]`.
  - **Pass 2 (Semantic Grouping)**: Contiguous intervals with the same application and category within 120s are merged into a single `TimelineSegment`. Merges all browser tabs into one generic `"Browser"` block if they occur consecutively within 120s.

### Stage 8: Delivery & Presentation
- **Files**: `apps/api/src/routes/activity.ts` $\rightarrow$ `apps/web/src/hooks/queries/use-timeline.ts` $\rightarrow$ `apps/web/app/timeline/page.tsx`.
- **Input**: `TimelineResponse` payload.
- **Output**: Interactive Timeline UI (Header, Live Activity Banner, KPI Summary, Daily Flow bar, Category Filters, Chronological Segment List, Expanded Drawer).
- **Truth Type**: `[OBSERVED]`.
- **Current Limitations**: UI displays `focused` as `"Focused Work"` with a `Code` icon and subtext `"IDEs, Terminal, Editors"`, visually presenting a process-name heuristic as verified human cognitive focus.

---

## 4. Current Data Contracts

Below are the actual data structures defined in `packages/types` and `packages/analytics`.

### 4.1 `NormalizedActivityEvent` (`packages/types/src/activity.ts`)
```typescript
export type NormalizedActivityEvent = {
  id?: string;
  externalId: string;
  bucketId: string;
  source: "desktop" | "browser" | "unknown";
  watcher: "window" | "web" | "afk" | "input" | "unknown";
  timestamp: string;      // ISO string
  duration: number;       // float seconds
  data: Record<string, unknown>;
};
```

### 4.2 `CanonicalActivityEvent` (`packages/analytics/src/activity/segments.ts`)
```typescript
export interface CanonicalActivityEvent {
  id: string;
  start: number;          // epoch ms
  end: number;            // epoch ms
  durationMs: number;
  source: "desktop" | "browser" | "unknown";
  watcher: "active_window" | "afk" | "browser" | "input" | "other";
  application: string;
  title: string;
  domain?: string;
  isAfk: boolean;
  isBrowser: boolean;
  category: TimelineCategory;
  rawEventCount: number;
  contexts: string[];
}
```

### 4.3 `TimelineSegment` (`packages/types/src/timeline.ts`)
```typescript
export type TimelineCategory =
  | "focused"
  | "browser"
  | "leisure"
  | "break"
  | "communication"
  | "general";

export interface TimelineSegment {
  id: string;
  start: string;          // ISO string
  end: string;            // ISO string
  durationMs: number;
  durationSeconds: number;
  source: "desktop" | "browser" | "unknown";
  type: "application" | "browser" | "break";
  activityType?: "application" | "browser" | "break";
  application: string;
  title: string;
  primaryTitle?: string;
  displayTitle?: string;
  domain?: string;
  category: TimelineCategory;
  rawEventCount?: number;
  contexts?: string[];
  pausedMs?: number;
  precedingGapMs?: number;
  applications?: TimelineAppShare[];
}
```

### 4.4 `TimelineSummary` & `CurrentActivityState` (`packages/types/src/timeline.ts`)
```typescript
export interface TimelineSummary {
  totalTrackedMs: number;
  focusedMs: number;
  browserMs: number;
  leisureMs: number;
  breakMs: number;
  communicationMs: number;
  generalMs: number;
  segmentsCount: number;
}

export interface CurrentActivityState {
  isActive: boolean;
  application: string | null;
  title: string | null;
  domain?: string | null;
  startedAt: string | null;
  runningForSeconds: number | null;
  category: TimelineCategory;
  isAfk: boolean;
}

export interface TimelineResponse {
  date: string;
  timezone: string;
  totalDurationMs: number;
  summary: TimelineSummary;
  currentActivity: CurrentActivityState | null;
  segments: TimelineSegment[];
}
```

---

## 5. Current Classification System

Activity meaning in the current repository is determined by static pattern matching in `packages/analytics/src/activity/segments.ts` and `categories.ts`.

### 5.1 Process & Window Name Normalization
- `normalizeAppName()`:
  - Strips `.exe` extensions.
  - Corrects PowerShell wrapper bugs: if process is `powershell.exe` or `pwsh.exe`, but the window title contains `"Visual Studio Code"`, `"Antigravity"`, `"Brave"`, `"Chrome"`, `"Figma"`, `"Discord"`, or `"Slack"`, it overrides the app name to that application.
  - Normalizes aliases: `"code"`, `"vscode"` $\rightarrow$ `"Visual Studio Code"`; `"msedge"` $\rightarrow$ `"Microsoft Edge"`; `"windowsterminal"`, `"cmd"` $\rightarrow$ `"Terminal"`; `"lockapp"` $\rightarrow$ `"Screen Locked"`.
- `cleanWindowTitle()`:
  - Strips trailing application branding strings: `" — Visual Studio Code"`, `" - Google Chrome"`, `" - Brave"`, `" • Antigravity IDE"`.

### 5.2 Category Assignment (`categorizeActivity()`)
1. **`break`**: Assigned if `isAfk === true`, `appName.includes("lockapp")`, `appName.includes("screen locked")`, or `title.includes("lock screen")`.
2. **`focused`**: Assigned if `appName` contains:
   `code`, `cursor`, `antigravity`, `terminal`, `powershell`, `neovim`, `intellij`, `pycharm`, `webstorm`.
   > **Finding**: This is an application-name heuristic, **not cognitive focus detection**.
3. **`communication`**: Assigned if `appName` contains:
   `slack`, `discord`, `teams`, `zoom`, `telegram`, `outlook`, or `title` contains `gmail`.
4. **`leisure`**: Assigned if the application is a browser (or standalone) and matches `LEISURE_PATTERNS`:
   `chess.com`, `lichess`, `play chess`, `youtube`, `youtu.be`, `netflix`, `twitch`, `reddit`, `instagram`, `facebook.com`, `tiktok`, `twitter`, `x.com`, `steampowered`, `disneyplus`, `prime video`, `hotstar`, `pinterest`.
5. **`browser`**: Assigned if the application is identified as a browser (`chrome`, `brave`, `edge`, `firefox`, `arc`, or extension source) and did not match the leisure pattern.
6. **`general`**: Fallback for any other desktop application.

### 5.3 Coding & Idle Checks (`packages/analytics/src/activity/categories.ts`)
- `isCodingActivity()`: Tests concatenated event data string against regex:
  `/\b(visual studio|code|cursor|terminal|shell|git|jetbrains|vim|neovim)\b/i`.
- `isIdleActivity()`: Returns true if `event.watcher === "afk"` or data string matches:
  `/\b(afk|idle|away from keyboard)\b/i`.

---

## 6. Current Temporal Aggregation

The aggregation engine in `packages/analytics/src/activity/segments.ts` enforces non-overlapping intervals and consolidates fragmented events.

### 6.1 Interval Normalization Algorithm (`normalizeIntervals`)
1. **AFK Separation & Merging**:
   - AFK events are extracted. Events $< 60\text{s}$ (`minBreakMs`) are dropped.
   - Contiguous AFK events with gaps $\le 5\text{s}$ are merged into unified break spans.
2. **AFK Precedence Carving**:
   - Active window events overlapping merged AFK breaks are carved:
     - Events completely inside a break are suppressed.
     - Events overlapping break boundaries are clipped so the break remains intact.
     - *Behavior*: Sensor-reported physical inactivity takes precedence over an open window.
3. **Browser Reconciliation**:
   - Extension tab events are compared against concurrent desktop browser windows.
   - If a desktop browser window overlaps: the tab's `domain`, `title`, and context are merged into the desktop event.
   - If no desktop agent exists: the extension tab is retained as an active event.
4. **Overlap Clipping**:
   - Active events are clipped sequentially: `if (curr.end > next.start) curr.end = next.start`.
   - Guaranteed invariant: $\sum \text{durations} = \text{wall-clock active elapsed time}$.

### 6.2 Semantic Consolidation (`aggregateActivitySegments`)
- **Transient Interruption Absorption**:
  - If between event $A$ and compatible candidate $B$, there is a sequence of non-AFK events totaling $\le 15\text{s}$ (`transientThresholdMs`) within 120s (`maxGapMs`), the intermediate blips are absorbed into event $A$.
  - Absorbed blips are recorded as strings: `contexts: ["(Brief: App - Title)"]`.
  - AFK breaks can never be crossed as transient.
- **Segment Construction**:
  - Contiguous events with identical application and category (or both `browser`) within 120s are consolidated into a `TimelineSegment`.
  - Merges `contexts`, updates `primaryTitle` to the longest string, increments `rawEventCount`.

---

## 7. Current Analytical Features & Semantic Leakage

Analytical models in `packages/analytics/src/features` consume timeline segments and calculate higher-order metrics.

### 7.1 Session Features (`features/session.ts`)
- `extractSessionFeatures(session, eventsOrSegments)`:
  - Normalizes events to session start/end window.
  - Computes `activeDurationSeconds = sum(intervals where category !== "break")`.
  - Computes `idleDurationSeconds = max(0, session.duration - activeDurationSeconds)`.
  - **Leakage Point 1**: `productiveDurationSeconds` is calculated as:
    ```typescript
    activeIntervals.filter((i) => i.category === "focused").reduce(...)
    ```
    *Problem*: Equates `category === "focused"` with productive work.
  - **Leakage Point 2**: `distractionDurationSeconds` is calculated as:
    ```typescript
    activeIntervals.filter((i) => i.category === "leisure").reduce(...)
    ```
    *Problem*: Equates `category === "leisure"` with distraction.
  - `contextSwitchCount`: Increments whenever adjacent active intervals have different `context` strings.
  - `contextSwitchesPerHour = (contextSwitchCount / durationSeconds) * 3600`.

### 7.2 Transition Features (`features/transitions.ts`)
- `extractTransitionFeatures(eventsOrSegments)`:
  - Compares consecutive active intervals (excluding breaks).
  - Increments `totalTransitions` when `prev.category !== curr.category`.
  - **Leakage Point 3**: Increments `productiveTransitions` if `curr.category === "focused"`.
  - **Leakage Point 4**: Increments `distractionTransitions` if `curr.category === "leisure"`.

### 7.3 Discrepancies & Day Features (`productivity/discrepancies.ts`, `features/day.ts`)
- `findDiscrepancies(checkIns, events)`:
  - Calculates non-overlapping active seconds within `[checkIn.windowStart, checkIn.windowEnd)`.
  - Flags `"reported-progress-without-observed-time"` if `progress === true` and `activeSeconds < 60`.
  - Flags `"observed-time-without-progress"` if `progress === false` and `activeSeconds >= 1800` (30m).
- `extractDayFeatures(input)`:
  - Sums session durations, productive durations, distraction durations, and task completion rates (`completedTasks / totalTasks`).

---

## 8. Current Timeline UI Contract

The Web Timeline (`apps/web/app/timeline/page.tsx`) renders the `TimelineResponse` data:

1. **Header & Date Controls**: Date picker, previous/next day navigation, "Jump to Today", and manual refresh.
2. **Current Activity Banner**: Displays live status for today (`ACTIVE` with ping animation or `AFK / AWAY`), running duration, active application, and window title.
3. **KPI Summary Cards**: Four metric cards: Total Tracked, Focused Work, Browser / Research, and Breaks & AFK.
4. **Daily Flow Bar**: Horizontal proportional bar where segment widths equal `(durationMs / totalTrackedMs) * 100%`. Hovering displays a tooltip; clicking scrolls down to the segment and opens its detail drawer.
5. **Category Filter Tabs**: Tabs for `All Activity`, `Focused`, `Browser`, `Breaks` with dynamic count badges.
6. **Chronological Segment List**: Vertical timeline connector line, start/end clock times (`14:00 – 14:46`), duration badge, application name, category pill, event count pill, and window/page title.
7. **Expanded Segment Drawer**:
   - 4-column metric grid: Application, Category, Duration (exact seconds), Consolidation (`X events (source)`).
   - Context History Rollup: Numbered list of all unique window titles and web tabs within the segment.
   - Domain badge (if web activity).
   - Exact local clock start and end timestamps.
8. **Live Telemetry Updates**: `useLiveTelemetry()` WebSocket hook listens for `telemetry:event` and throttle-invalidates React Query cache after 2 seconds when viewing today.
9. **States**: Skeleton loading pulse (6 rows), empty state (*"No activity recorded"*), and error state (*"Unable to load timeline"*).

### Hidden Backend Fields in UI
- **Device Attribution**: `bucketId` and device name are stored in DB, but the timeline does not show which device generated a segment.
- **Input Density**: Keystrokes and mouse movements logged by `aw-watcher-input` are omitted from the UI.
- **Audible State**: `audible: boolean` captured by the browser extension is omitted.
- **Leisure & Communication KPIs**: `TimelineSummary` calculates `leisureMs` and `communicationMs`, but the 4 top KPI cards omit them.

---

## 9. Current Semantic Leakage

| Leakage | Location | Current Implementation Behavior | Why It Is Problematic |
|---|---|---|---|
| **1. Application $\rightarrow$ Focus** | `segments.ts:238-251` (`categorizeActivity`) | App name containing `"code"`, `"cursor"`, or `"terminal"` is automatically categorized as `"focused"`. | Conflates process name with cognitive attention. An idle IDE, a broken compile loop, or looking at a screen without typing is branded "focused". |
| **2. Category $\rightarrow$ Productivity** | `features/session.ts:110-112` | `productiveDurationSeconds` filters strictly for `i.category === "focused"`. | Technical reading, architectural research, pull request reviews, and writing in docs are excluded from productive time. |
| **3. Category $\rightarrow$ Distraction** | `features/session.ts:113-115`, `transitions.ts:73` | `distractionDurationSeconds` filters for `i.category === "leisure"`; `distractionTransitions` counts transitions to leisure. | Assumes any visit to a blacklisted domain is an unproductive distraction. Restorative breaks and educational videos are branded distractions. |
| **4. Browser $\rightarrow$ Generic Meaning** | `segments.ts:277-279` | Any browser event that does not match the leisure blacklist is categorized as `"browser"`. | The browser is a universal execution canvas. Lumping documentation, cloud consoles, sandboxes, and shopping into one `"browser"` tag destroys all nuance. |
| **5. Leisure Blacklist $\rightarrow$ Semantic Judgment** | `segments.ts:53-72` (`LEISURE_PATTERNS`) | Static 16-item regex list (`youtube`, `reddit`, `twitter`, `chess.com`, etc.) assigns `category = "leisure"`. | Domain alone cannot determine intent. A YouTube tutorial on React Query or a Reddit thread fixing a build error is misclassified as leisure. |
| **6. AFK Signal $\rightarrow$ Human Absence** | `segments.ts:389`, `activitywatch/events.ts` | OS mouse/keyboard silence $\ge 60\text{s}$ is treated as physical human absence and categorized as `"break"`. | Inability to detect reading without input. Reading a dense specification or watching a technical lecture without moving the mouse triggers false AFK breaks. |
| **7. Session Derivation $\rightarrow$ Intentional Work** | `activity/sessions.ts:63` (`deriveSessions`) | Active events with inter-event gaps $\le 300\text{s}$ are chained into derived `WorkSession` objects. | Temporal proximity does not equal intentional work. 45 minutes of aimless web surfing without a 5-minute break is modeled as a "work session". |

---

## 10. Current Information Loss

The following data points are verified to be dropped, stripped, or weakened during normalization and aggregation:

1. **URL Query Parameters**: `sanitizeUrl` strips all query strings (`?v=...`, `?q=...`), discarding video IDs and search query strings.
2. **Input Density**: Keystroke and click counts captured by `aw-watcher-input` are never attached to `CanonicalActivityEvent` or `TimelineSegment`.
3. **Browser Audible State**: Extension tracks `audible: boolean`, but it is dropped during canonical event normalization.
4. **Tab Count**: Extension captures `tabCount`, but it is not forwarded into timeline segments.
5. **Exact Sub-Context Durations**: Inside a consolidated segment, only the unique titles are retained in `contexts: string[]`; individual dwell times per file/tab are lost.
6. **Concurrent Background Activity**: Overlapping intervals are clipped so only the active foreground window survives. Background music, compile jobs, or reference windows lose their durations.
7. **Task & Goal Association**: The timeline database and segment models possess no fields linking activities to tasks or daily goals.
8. **User Gap Explanations**: When a multi-hour telemetry gap occurs (e.g. laptop shut down while at college), no mechanism exists in the timeline schema to record or display the user's explanation.
9. **Classification Provenance**: Segments do not record *why* a category was assigned or whether it was a system heuristic or user override.

---

## 11. Phase 0 Conclusions

### Confirmed Current Facts
- The inspected implementation contains an operational ingestion path from ActivityWatch and the Chrome Extension.
- Interval normalization correctly clips overlapping active events so total active duration never exceeds wall-clock elapsed time.
- PostgreSQL stores normalized events reliably, DuckDB receives raw events, and WebSockets deliver live updates.
- The Timeline UI successfully renders daily flow bars, segment accordions, and category filters.

### Current Architectural Problems
- Cognitive focus is conflated with IDE process names.
- Productivity and distraction are hardcoded to heuristic category tags.
- The browser is treated as a monolithic, generic category.
- Domain blacklists mischaracterize technical tutorials and educational content.
- Machine inactivity is conflated with physical human absence.
- The timeline has zero integration with user goals, tasks, or gap explanations.

### Future Requirements Implied by the Audit
- **Multi-Dimensional Semantics**: Separate activity type from work context, relevance, intention alignment, and focus.
- **Focus Triangulation**: Base focus on convergent evidence (intention, input continuity, context coherence, reflection), not application names.
- **Contextual Relevance**: Evaluate activities relative to active goals and tasks.
- **User Rules & Corrections**: Allow users to teach the system custom domain and application meanings.
- **Gap Recovery**: Model unobserved intervals as first-class entities with machine availability states and user explanations.
