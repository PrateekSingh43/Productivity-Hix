# ProductiveHix

ProductiveHix is a personal productivity and learning feedback loop:

```text
ActivityWatch → normalized activity → Express API → PostgreSQL/Prisma
       ↑                                  ↓
   self-report ← Next.js + React Query ← analytics
```

ActivityWatch remains the raw telemetry source. The application stores identity, tasks, work sessions, check-ins, learning assessments, synchronization state, normalized activity, and deterministic summaries. Desktop/window, AFK/input, and browser events are identified by `packages/activitywatch`.

## Core Documentation

- **Master System Blueprint & Product Spec**: [docs/PRODUCTIVEHIX_SYSTEM_BLUEPRINT.md](file:///c:/Users/prate/ProductiveHix/docs/PRODUCTIVEHIX_SYSTEM_BLUEPRINT.md) — The locked single source of truth for the product mental model, the Four Kinds of Truth, DuckDB analytics engine, telemetry gap recovery, retention loops, and the 9-phase roadmap.
- **UX Contract & IA Spec**: [docs/PRODUCTIVEHIX_UX_CONTRACT.md](file:///c:/Users/prate/ProductiveHix/docs/PRODUCTIVEHIX_UX_CONTRACT.md) — Locked UX interaction contracts, navigation structures, page specifications, and zero-fake-data design principles.


## Development

```sh
pnpm install
pnpm --filter @repo/db db:generate
pnpm dev
```

Copy `apps/api/.env.example` and `apps/web/.env.example` as needed. The API runs on port 4000 and the web app on port 3000. Configure Google OAuth before enabling authenticated flows; password authentication is intentionally not supported.

Validation commands:

```sh
pnpm check-types
pnpm lint
pnpm test
pnpm build
pnpm --filter @repo/db db:validate
```
