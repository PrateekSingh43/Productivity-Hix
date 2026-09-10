# AGENTS.md — ProductiveHix Engineering & Architecture Rules

This file is automatically loaded by AI coding assistants working in the ProductiveHix workspace.

## 1. Single Source of Truth
Before planning or implementing any feature, database migration, analytical detector, AI synthesis prompt, or UI change, you **MUST** consult:
- **[docs/PRODUCTIVEHIX_SYSTEM_BLUEPRINT.md](file:///c:/Users/prate/ProductiveHix/docs/PRODUCTIVEHIX_SYSTEM_BLUEPRINT.md)**: Master product philosophy, the Four Kinds of Truth, the 5 core questions, the "missing telemetry" gap recovery mechanism, the DuckDB analytical pipeline, the closed-loop retention engine, and the 9-phase roadmap.
- **[docs/PRODUCTIVEHIX_UX_CONTRACT.md](file:///c:/Users/prate/ProductiveHix/docs/PRODUCTIVEHIX_UX_CONTRACT.md)**: UX contract, presentation states, page layouts, and information architecture.

## 2. Inviolable Core Principles
1. **Zero Fake Data**: Never invent metrics, hardcoded trends (`+12%`), synthetic multipliers (`* 0.65`), or fake baseline placeholders. Use explicit `loading`, `empty`, or `insufficient` states.
2. **AI Never Receives Raw Telemetry**: Never dump hundreds of raw ActivityWatch events into an LLM context window. Raw telemetry must be aggregated and summarized via DuckDB and canonical feature extractors (`packages/analytics`).
3. **The Four Kinds of Truth**:
   - `Intention` (Daily Goal, Priorities, Tasks)
   - `Observation` (ActivityWatch desktop + browser telemetry)
   - `Reflection` (50m check-ins, focus debriefs, and **inactivity gap explanations**)
   - `Retention` (Spaced active recall testing, probe questions, knowledge gaps)
4. **Missing Telemetry ≠ Slacking**: Telemetry gaps (50+ min away or sleep/suspend) require checking machine availability and recovering the user explanation (e.g., "went to college"). Coverage is an analytical concept.
5. **Decouple the Epistemic Hierarchy**:
   - `Observation`: *"X happened."*
   - `Pattern`: *"X repeatedly happens across comparable sessions."*
   - `Insight`: *"X matters because it affects outcome Z."*
   - `Recommendation`: *"Consider doing Y."*
   Never collapse these four into one object.
6. **Decouple Goal Outcome from Task Completion**: Completing 5/5 tasks does not mean a Daily Goal was achieved. Goal outcome is a subjective self-assessment at day's end.
