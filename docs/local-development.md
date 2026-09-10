# Local Development Guide (End-to-End Telemetry)

This guide walks you through setting up and running the core components of ProductiveHix to verify the ActivityWatch -> Desktop Bridge -> API -> WebSocket UI telemetry pipeline.

## Prerequisites

1. **ActivityWatch v0.13.2**
   Ensure it is installed and running.
   Download: [activitywatch-v0.13.2-windows-x86_64-setup.exe](https://github.com/ActivityWatch/activitywatch/releases/download/v0.13.2/activitywatch-v0.13.2-windows-x86_64-setup.exe)
2. **Node.js 24+**
3. **pnpm** (Package manager)
4. **PostgreSQL Database** (A remote Supabase instance is pre-configured for this demo, no local setup required).

---

## 1. Environment Setup

Copy the example configuration files and configure them if necessary. The provided examples include bypass tokens for local development authentication (`ALLOW_DEV_AUTH`).

```bash
# In the root directory:
cp apps/api/.env.example apps/api/.env
cp apps/desktop/.env.example apps/desktop/.env
cp apps/web/.env.example apps/web/.env
```

*Note: The `.env` variables default to testing values:*
- `API_PORT`: 4000
- `WEB_PORT`: 3000
- `ACTIVITYWATCH_BASE_URL`: http://127.0.0.1:5600
- `DEV_USER_ID`: 00000000-0000-0000-0000-000000000001 (Bypasses OAuth)

---

## 2. Installation and Build

From the root directory, install the workspace dependencies and ensure everything is built.

```bash
pnpm install
pnpm run check-types
pnpm run build
```

---

## 3. Verify Database Connectivity

Before starting the API, ensure the database schema is synchronized:

```bash
pnpm --filter @repo/db run db:generate
pnpm --filter @repo/db run db:push
```

---

## 4. Startup Procedure

You will need to open **three separate terminals** to run the three primary components.

### Terminal 1: Start Express API
The API receives telemetry batches, stores them in PostgreSQL/DuckDB, and broadcasts live events.
```bash
pnpm --filter @repo/api run dev
```

### Terminal 2: Start Desktop Bridge
The Bridge queries local ActivityWatch, normalizes events, deduplicates them, queues them, and sends them to the API.
```bash
pnpm --filter @repo/desktop run dev
```

### Terminal 3: Start Next.js Web UI
The Web UI provides the dashboard where you can see live activity updates via WebSocket.
```bash
pnpm --filter web run dev
```

---

## 5. First Activity Test (Manual Verification)

1. Ensure **ActivityWatch** is running (`aw-server` on port `5600`).
2. Open the **ProductiveHix Dashboard** in your browser at `http://localhost:3000`.
3. Locate the **Live Activity** card. Verify that the **WebSocket Status** indicator turns green ("Live WS").
4. **Switch Applications** in Windows (e.g., click on VS Code, then switch back to Chrome).
5. Watch the dashboard. You will see the **Foreground Application** immediately update with the newly active window!

---

## Troubleshooting

- **ActivityWatch not running or bucket not found:** Check `http://127.0.0.1:5600` in your browser. Ensure `aw-watcher-window` and `aw-watcher-afk` are active. The Desktop Bridge will automatically retry discovering buckets if ActivityWatch restarts.
- **WebSocket connection failure:** Ensure the Express API is running on port 4000. Look for `WebSocket server attached on /ws` in the API terminal.
- **DuckDB initialization error:** The DuckDB instance is created lazily using an in-memory (`:memory:`) database by default for local development. If it fails, ensure Node 24+ is used.
- **Authentication failure:** For local testing, ensure `ALLOW_DEV_AUTH=true` is set in `apps/api/.env` and `DEV_USER_ID` is set in `apps/desktop/.env`. OAuth is intentionally bypassed for development.
