# Phase 2 Implementation Plan: Design System Tokens & Application Shell (v2.0)

Build the design system tokens, unified application shell, and presentation primitives for ProductiveHix across both the Web Application and Browser Extension, strictly adhering to the locked **ProductiveHix UX Contract (v1.3)** and the **14 Final Amendments**.

---

## Strict Scope Boundaries & Invariants

> [!IMPORTANT]
> **Phase 2 Boundary Guardrail:**  
> Phase 2 is strictly concerned with **design tokens, application shell, layout primitives, presentation components, visual shells, accessibility, and workflow prototyping**.  
> Phase 2 will **NOT**:
> - Call APIs, access Prisma, or perform database migrations
> - Use React Query for domain mutations or persistence
> - Create or persist Daily Goals, Daily Priorities, or Work Sessions
> - Implement notification scheduling or alarm management
> - Implement sleep detection or ActivityWatch pipeline modifications
> - Implement the Availability / Inactivity engine or Reflection engine
> - Mirror or forward browser extension telemetry to `http://localhost:5600`
> - Contain Productive Day Resolver logic
> - Fabricate or hardcode synthetic numbers, trends, or fake baseline metrics

---

## 1. Design Language & CSS Tokens

- **Visual Style**: Clean, semantic, high-density dark UI (Linear/Raycast inspired).
- **Prohibited**: **NO** glassmorphism, decorative gradients, glow effects, or visually noisy card borders as defaults.
- **Allowed**: Semantic surfaces, clean solid borders (`#23232d`, `#30303d`), disciplined typography, consistent spacing, and explicit state hierarchy.
- **Motion**: Restrained, functional, micro-interactions only ($\le 150\text{ms}$ transitions), fully respecting `prefers-reduced-motion`.

---

## 2. Proposed Changes

### Component 1: Layout Architecture (`components/layout/*`)

Separate layout responsibilities cleanly into dedicated primitives:

#### [NEW] [apps/web/components/layout/page-container.tsx](file:///c:/Users/prate/ProductiveHix/apps/web/components/layout/page-container.tsx)
- Controls max-width constraint, responsive horizontal/vertical padding, and vertical section rhythm.
- Does NOT contain page-header logic.

#### [NEW] [apps/web/components/layout/page-header.tsx](file:///c:/Users/prate/ProductiveHix/apps/web/components/layout/page-header.tsx)
- Standardized page header: title (`<h1>`), subtitle/kicker, date context display, breadcrumbs, and primary action slot.

#### [NEW] [apps/web/components/layout/section.tsx](file:///c:/Users/prate/ProductiveHix/apps/web/components/layout/section.tsx)
- Structural section wrapper with semantic tag (`<section>`) and consistent spacing.

#### [NEW] [apps/web/components/layout/section-header.tsx](file:///c:/Users/prate/ProductiveHix/apps/web/components/layout/section-header.tsx)
- Section-level title, description, and secondary action slot.

#### [MODIFY] [apps/web/components/layout/sidebar.tsx](file:///c:/Users/prate/ProductiveHix/apps/web/components/layout/sidebar.tsx)
- Reorganize navigation into the **5 locked groups**:
  ```text
  MAIN
    Home             /                 (Compass icon)
    Today            /today            (Calendar icon)

  WORK
    Tasks            /tasks            (CheckSquare icon)
    Sessions         /sessions         (Timer icon)

  LEARNING
    Learning         /learning         (BookOpen icon)
    Review           /review           (RotateCcw icon)  <-- Remove fake "2 due" badge!

  UNDERSTAND
    Timeline         /timeline         (Clock icon)
    Insights         /insights         (LineChart icon)
    Patterns         /patterns         (Network icon)

  SYSTEM
    Devices          /devices          (Laptop icon, live status indicator)
    Settings         /settings         (Settings icon)
  ```
- Eliminate hardcoded badges (e.g. `"2 due"` on Review).
- Accurate connectivity semantics: distinguishes awake/available vs. disconnected vs. idle without fabricating states.

#### [MODIFY] [apps/web/components/layout/top-header.tsx](file:///c:/Users/prate/ProductiveHix/apps/web/components/layout/top-header.tsx)
- Header with branding, status indicator, and quick action affordance indicator (`Cmd+K`).

---

### Component 2: Presentation Primitives (`components/primitives/*`)

Pure presentation components with zero domain/persistence logic:

#### [NEW] [apps/web/components/primitives/stat-card.tsx](file:///c:/Users/prate/ProductiveHix/apps/web/components/primitives/stat-card.tsx)
- Supports explicit states via `state` prop:
  - `ready` (renders valid label, value, subtext)
  - `loading` (renders skeleton pulse)
  - `empty` (renders honest `"0"` or `"—"` with informative subtext)
  - `insufficient` (renders *"Collecting history"*)
  - `error` (renders error indicator)
  - `unavailable` / `offline` (renders offline/disconnected status)
- A real `0` is strictly distinguished from unavailable or loading states.
- Never fabricates a metric to fill layout.

#### [NEW] [apps/web/components/primitives/data-badge.tsx](file:///c:/Users/prate/ProductiveHix/apps/web/components/primitives/data-badge.tsx)
- Semantic badge for statuses, task priorities (`URGENT`, `HIGH`, `MEDIUM`, `LOW`), tracking states, and goal outcomes.

#### [NEW] [apps/web/components/primitives/goal-card.tsx](file:///c:/Users/prate/ProductiveHix/apps/web/components/primitives/goal-card.tsx)
- Visual presentation primitive supporting the **6 visual states**:
  1. `planned`: Displays Goal title, 1–3 Daily Priorities, `[Edit Plan]` action.
  2. `unplanned`: Displays empty card (*"What would make today successful?"*) + `[Plan Today]` CTA.
  3. `editable`: Form state with Goal title input and 1–3 priority fields.
  4. `planning-tomorrow`: Night variant titled *"Tomorrow's Plan"* with tomorrow's date badge.
  5. `outcome-pending`: End-of-day assessment banner (*"How did today go?"*) with outcome buttons (`Achieved`, `Partially achieved`, `Not achieved`, `Not assessed`).
  6. `outcome-assessed`: Historical state showing Goal title, priorities, and assigned outcome badge.
- Decoupled from backend state; accepts visual props and callback handlers (`onEdit`, `onPlanToday`, `onAssessOutcome`).

#### [NEW] [apps/web/components/primitives/priority-list.tsx](file:///c:/Users/prate/ProductiveHix/apps/web/components/primitives/priority-list.tsx)
- Visual list rendering 1–3 numbered Daily Priorities.

#### [NEW] [apps/web/components/primitives/current-focus-card.tsx](file:///c:/Users/prate/ProductiveHix/apps/web/components/primitives/current-focus-card.tsx)
- Renders the real-time **NOW** layer on Today:
  - Task title & priority context (*"Supports: [Daily Priority]"*).
  - Session timer visual display.
  - Active observed application/window signal with objective label (`Desktop application`, `Browser activity`).
  - Action buttons (`[Pause]`, `[Complete]`, `[Switch]`) wired to presentation callbacks.

#### [NEW] [apps/web/components/primitives/empty-state.tsx](file:///c:/Users/prate/ProductiveHix/apps/web/components/primitives/empty-state.tsx)
- Clean, semantic empty state with icon, title, description, and action button slot.

#### [NEW] [apps/web/components/primitives/insufficient-data-state.tsx](file:///c:/Users/prate/ProductiveHix/apps/web/components/primitives/insufficient-data-state.tsx)
- Informative state explaining what telemetry/session evidence is being gathered before patterns can be computed.

#### [NEW] [apps/web/components/primitives/loading-state.tsx](file:///c:/Users/prate/ProductiveHix/apps/web/components/primitives/loading-state.tsx)
- Accessible, restrained skeleton placeholders.

#### [DELETE] [apps/web/components/layout/baseline-placeholder.tsx](file:///c:/Users/prate/ProductiveHix/apps/web/components/layout/baseline-placeholder.tsx)
- Completely deleted.

---

### Component 3: Page Visual Shells & Honest Data Grounding

#### [MODIFY] [apps/web/app/page.tsx (Home)](file:///c:/Users/prate/ProductiveHix/apps/web/app/page.tsx)
- Glanceable 15-second summary surface.
- **Removed**: Synthetic splits (`activeTime * 0.65`), hardcoded `+12%` trend, inline check-in form, task CRUD, session controls, raw timeline visualizations, and analytics charts.
- **Rendered**:
  - `PageHeader` with current date and `[View Today]` action.
  - `StatCard` row: Active time today, Sessions count, Tasks completed count (honest `"—"` or real counts).
  - Current Pulse card: live app/domain telemetry signal and desktop sync status.
  - Learning snapshot card (Reviews due badge only if real count exists).

#### [MODIFY] [apps/web/app/today/page.tsx](file:///c:/Users/prate/ProductiveHix/apps/web/app/today/page.tsx)
- Rebuilt around the v1.3 content hierarchy:
  1. `GoalCard`: Today's Plan (planned or unplanned state).
  2. `CurrentFocusCard`: Current Focus / Now layer.
  3. `Today's Tasks`: Grouped by supporting priority, summary count, link to `/tasks`.
  4. `Today's Reality`: Observed telemetry summary (using objective labels: `Desktop application`, `Browser activity`, `AFK / Idle`) + Reflection status.
- **Removed**: Fake `timeBlocks` array (`09:00 Deep Work`, etc.).

#### [MODIFY] [apps/web/app/sessions/page.tsx](file:///c:/Users/prate/ProductiveHix/apps/web/app/sessions/page.tsx)
- Replaced fake `sessionHistory` table (Sep 1–4) and fake SVG sparklines with `EmptyState` shell.

#### [MODIFY] [apps/web/app/learning/page.tsx](file:///c:/Users/prate/ProductiveHix/apps/web/app/learning/page.tsx)
- Replaced `BaselinePlaceholder` with clean `EmptyState` shell for tracked topics.

#### [MODIFY] [apps/web/app/review/page.tsx](file:///c:/Users/prate/ProductiveHix/apps/web/app/review/page.tsx)
- Replaced `BaselinePlaceholder` with clean `EmptyState` shell for recall testing.

#### [MODIFY] [apps/web/app/insights/page.tsx](file:///c:/Users/prate/ProductiveHix/apps/web/app/insights/page.tsx)
- Replaced `BaselinePlaceholder` with `InsufficientDataState`.

#### [MODIFY] [apps/web/app/patterns/page.tsx](file:///c:/Users/prate/ProductiveHix/apps/web/app/patterns/page.tsx)
- Replaced `BaselinePlaceholder` with `InsufficientDataState`.

---

### Component 4: Extension Shell & Visual Workflows

#### [MODIFY] [apps/extension/src/popup/App.tsx](file:///c:/Users/prate/ProductiveHix/apps/extension/src/popup/App.tsx)
- 5 locked persistent views:
  `[ TODAY ]   [ FOCUS ]   [ REFLECT ]   [ REVIEW ]   [ MORE ]`
- `TodayView`: Contains `Today's Plan` card:
  - Planned state: Goal + 1–3 priorities + `[Edit Plan]`.
  - Unplanned state: *"Your day hasn't been planned"* + `[Set Today's Goal]`.
- Visual workflow prototyping (views/sheets inside popup):
  - `Plan Today`: 30–60s flow with Goal input and 1–3 Priority inputs.
  - `Plan Tomorrow`: Evening variant with tomorrow's date badge.
  - `Goal Outcome`: End-of-day evaluation sheet with outcome options.
- **Strict Boundary**: NO heartbeat mirroring or forwarding to `127.0.0.1:5600`.

---

## 3. Verification Plan

### Automated Verification
```bash
# Typecheck
pnpm --filter web run check-types
pnpm --filter @repo/extension run check-types

# Lint
pnpm --filter web run lint
pnpm --filter @repo/extension run lint

# Production bundle builds
pnpm --filter web build
pnpm --filter @repo/extension run build
```

### Manual & Visual Verification Gate
1. **Design System & Shell**:
   - Sidebar renders 5 groups: `MAIN`, `WORK`, `LEARNING`, `UNDERSTAND`, `SYSTEM`.
   - Hardcoded `"2 due"` badge on Review is gone.
   - Restrained, semantic dark UI without decorative glassmorphism or neon glows.
2. **Layout & Primitives**:
   - `PageContainer`, `PageHeader`, `Section`, and `SectionHeader` properly space and structure each page.
   - `StatCard` renders explicit states (`ready`, `loading`, `empty`, `insufficient`, `error`, `unavailable`).
   - `GoalCard` renders all 6 visual states.
   - `CurrentFocusCard` renders the Now layer.
3. **Data Honesty**:
   - Verify `/` (Home) has zero fake splits (`* 0.65`) and no hardcoded trends (`+12%`).
   - Verify `/today` has zero fake `timeBlocks`.
   - Verify `/sessions` has zero fake historical tables or fabricated sparklines.
   - Verify `/learning`, `/review`, `/insights`, `/patterns` have zero fake baseline metrics.
4. **Extension**:
   - 5 tabs: `TODAY`, `FOCUS`, `REFLECT`, `REVIEW`, `MORE`.
   - Visual prototypes for `Plan Today`, `Plan Tomorrow`, and `Goal Outcome` render cleanly.
   - No connection/mirroring to `127.0.0.1:5600` exists.
5. **Accessibility**:
   - Visible keyboard focus rings (`focus-visible`).
   - Semantic heading hierarchy (`h1`, `h2`, `h3`).
   - Contrast passes WCAG AA standards.
   - Motion disabled when `prefers-reduced-motion: reduce` is active.
