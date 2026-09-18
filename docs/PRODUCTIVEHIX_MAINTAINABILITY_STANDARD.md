# ProductiveHix — Permanent Maintainability, Traceability & Future-Refactorability Standard

- **Status**: Canonical Engineering Standard
- **Scope**: Entire ProductiveHix Monorepo (`apps/web`, `apps/api`, `apps/desktop`, `packages/*`)
- **Authority**: Inviolable monorepo architectural standard, enforced by `AGENTS.md`

---

## 1. Primary Principle

Every feature, component, API endpoint, database migration, hook, mutation, and service must be built under this inviolable assumption:

> **Someone else will maintain this code later without knowing why you wrote it, without having access to your mental context, and without needing the original author or an AI to explain it.**

Any future engineer (or AI pair programmer) looking at the codebase must be able to immediately answer:

```text
1.  What is this feature?
2.  Why does it exist?
3.  What domain concepts does it own?
4.  Where does its data originate?
5.  Where does its data flow?
6.  What does this function actually mean in domain terms?
7.  What does each important parameter represent?
8.  What does this mutation modify or affect?
9.  What queries, caches, or projections become stale as a result?
10. What invariants and assumptions must remain true?
11. Where should someone go to modify, extend, or retire this later?
```

---

## 2. Domain Ownership & Feature Boundaries

### 2.1 Feature-Based Colocation
Frontend code in `apps/web` must strictly follow domain colocation under `src/features/<domain>/`:
- **`types/`**: Domain entity definitions and input contracts.
- **`api/client.ts`**: Pure API fetcher functions connecting to backend endpoints.
- **`api/queries.ts`**: Query key factories using TanStack Query v5 `queryOptions`.
- **`api/mutations.ts`**: Mutations that modify domain state, declaring their full cache invalidation blast radius.
- **`components/`**: Domain presentation components, cards, forms, and primary views.
- **`index.ts`**: Public interface boundary of the feature.

### 2.2 Strict Public Surface Discipline
- External features and route pages must **only** import from the feature root:
  ```typescript
  // ✅ CORRECT: Clean public boundary
  import { taskQueries, useTasksList, TaskItem } from "@features/tasks";
  
  // ❌ FORBIDDEN: Deep internal imports break refactorability
  import { TaskItem } from "@features/tasks/components/task-item";
  ```
- Cross-feature dependencies must be explicit and minimal. If a component belongs to two features, it must be evaluated: does it belong in `@shared/*`, or does one feature own the data and expose a public interface?

### 2.3 Shared Infrastructure (`@shared/*`)
The `src/shared/` directory is reserved strictly for domain-agnostic primitives:
- **`@shared/api/client`**: Generic HTTP fetch wrappers, JSON helpers, and base URLs.
- **`@shared/lib/`**: Query client factories, theme management, and layout context.
- **`@shared/components/layout`**: `PageContainer`, `PageHeader`, `Section`, `SectionHeader`, `AppShell`, `Sidebar`, `TopHeader`.
- **`@shared/components/primitives`**: `DataBadge`, `EmptyState`, `LoadingState`, `StatCard`.

---

## 3. Data Lineage & The Four Kinds of Truth

ProductiveHix manages four fundamentally different epistemic layers. Code must never blur or collapse them:

| Truth Layer | Origin | What It Means | Invariants & Rules |
| :--- | :--- | :--- | :--- |
| **Intention** | User input (`tasks`, `goals`, `plans`) | What the user intended to accomplish. | Goal outcome is subjective and decoupled from task count. |
| **Observation** | Desktop & browser collectors | Objective, timestamped telemetry. | Raw events must never be dumped into LLMs. DuckDB aggregated only. |
| **Reflection** | Periodic check-ins, focus debriefs | Subjective assessment & gap explanations. | Away gaps ($\ge 50$m) require user context recovery, not assumptions of slacking. |
| **Retention** | Spaced recall intervals, probes | Knowledge durability & validated recall. | Closed-loop prompts scheduled by retention engines. |

### Data Lineage Chain
Every pipeline must trace cleanly across the monorepo layers:
```text
Hardware/Browser Telemetry
        ↓
Local Collector Agent (AW / Extension)
        ↓
apps/api Ingestion & Validation (@repo/validation)
        ↓
Relational Storage (PostgreSQL @repo/db)
        ↓
OLAP Analytical Pipeline (DuckDB @repo/data)
        ↓
Canonical Detectors & Aggregators (@repo/analytics)
        ↓
REST API Endpoints & Synthesizers
        ↓
Frontend TanStack Query Options (@features/*/api/queries)
        ↓
React Presentation Components (@features/*/components)
```

---

## 4. TanStack Query v5 & Cache Invalidation Contracts

Ad-hoc strings or undocumented invalidations are strictly prohibited.

### 4.1 Query Key Factories
Every query must be built using `queryOptions` with hierarchical, strongly-typed query keys:
```typescript
export const taskQueries = {
  all: () => ["tasks"] as const,
  lists: () => [...taskQueries.all(), "list"] as const,
  list: () =>
    queryOptions({
      queryKey: taskQueries.lists(),
      queryFn: getTasks,
      staleTime: 30_000,
    }),
  details: () => [...taskQueries.all(), "detail"] as const,
  detail: (id: string) =>
    queryOptions({
      queryKey: [...taskQueries.details(), id] as const,
      queryFn: () => getTask(id),
      staleTime: 30_000,
    }),
};
```

### 4.2 Explicit Invalidation Blast Radius
Every mutation must declare in its `onSuccess` or `onSettled` hooks exactly which query keys become stale:
```typescript
export function useCreateTaskMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createTask,
    onSuccess: () => {
      // Invalidate tasks lists
      queryClient.invalidateQueries({ queryKey: taskQueries.lists() });
      // Invalidate today's plan which aggregates tasks
      queryClient.invalidateQueries({ queryKey: planQueries.all() });
    },
  });
}
```

---

## 5. Code Clarity, Typing & Documentation

### 5.1 Self-Explanatory Naming
- Never use abbreviations that obscure intent (`dur` $\to$ `durationMinutes`, `sess` $\to$ `workSession`, `tgt` $\to$ `target`).
- Functions must describe action and entity: `updateTaskStatus`, `createWorkSession`, `resolveProductiveDay`.
- Booleans must read as predicates: `isActive`, `hasUnsavedChanges`, `isPaused`, `canComplete`.

### 5.2 JSDoc Contracts for Core Logic
Any analytical detector, calculation, data converter, or stateful hook must include a concise JSDoc contract explaining:
1. **Purpose**: What problem this solves.
2. **Parameters**: What units or domain constraints apply (e.g. `durationSeconds: number // duration in integer seconds`).
3. **Assumptions/Invariants**: What must be true before this function runs.
4. **Returns**: Expected format and edge case representations (`null` vs `undefined`).

Example:
```typescript
/**
 * Resolves the active productive day label based on the user's custom rollover cutoff.
 * 
 * @param date - The wall-clock timestamp being evaluated
 * @param dayBoundary - Rollover time in "HH:mm" 24h format (e.g. "04:00")
 * @returns Canonical ISO date string "YYYY-MM-DD" of the productive day in effect
 * 
 * @invariant Telemetry recorded between 00:00 and dayBoundary belongs to the previous calendar day.
 */
export function resolveProductiveDay(date: Date, dayBoundary: string): string { ... }
```

---

## 6. Zero Fake Data & Epistemic Honesty

1. **Never invent metrics**: Do not hardcode simulated percentages (`+14% this week`), fake baselines, or synthetic scores.
2. **State Transparency**: If data is missing or telemetry was offline:
   - Render explicit `loading`, `empty`, or `insufficient-evidence` states.
   - Explain plainly to the user why the metric cannot yet be computed (e.g. *"Requires 7 recorded days of comparable activity"*).
3. **Decouple the Epistemic Hierarchy**:
   - `Observation`: *"You switched windows 42 times."*
   - `Pattern`: *"Context switching was elevated across comparable morning sessions."*
   - `Insight`: *"High context switching correlated with reported difficulty in starting the task."*
   - `Recommendation`: *"Consider grouping research into an isolated 25m block."*
   **Never collapse these four into one claim.**

---

## 7. Permanent Verification Checklist

Before any code is committed to `main`, it must pass this verification checklist:

- [ ] **Domain Colocation**: Code lives in its respective `src/features/<domain>` or `@shared/*`.
- [ ] **Public Boundary**: No deep cross-feature imports (`@features/<domain>/components/...`).
- [ ] **Typed API Client**: API requests are typed via `@repo/types` and `@repo/validation`.
- [ ] **Query Options**: Queries use `queryOptions` with query key factories.
- [ ] **Invalidation Handlers**: Mutations invalidate all affected queries explicitly.
- [ ] **TypeScript Green**: `pnpm check-types` passes across all monorepo packages.
- [ ] **Unit Tests Green**: `pnpm test` passes without broken invariants.
- [ ] **Linter Green**: `pnpm --filter web lint` passes with 0 warnings.
- [ ] **Production Build Green**: `pnpm --filter web build` compiles cleanly.
- [ ] **Zero Fake Data**: No mock trends, fake baselines, or synthetic score multipliers.
