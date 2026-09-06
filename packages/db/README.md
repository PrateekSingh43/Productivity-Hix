# @repo/db

Prisma 7 + PostgreSQL for ProductiveHix. The schema intentionally starts with the smallest domain needed for identity, tasks, sessions, check-ins, learning validation, and incremental ActivityWatch synchronization.

```sh
pnpm db:generate
pnpm db:validate
pnpm db:push
```

Runtime traffic uses `DATABASE_URL`. Schema commands prefer `DIRECT_URL`, as configured in `prisma.config.ts`. Both values belong only in the local `packages/db/.env`; never commit secrets.
