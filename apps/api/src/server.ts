import { createApp } from "./app";
import { env } from "./config/env";
import { wsManager } from "./services/websocket/server";
import { closeDuckDB, ensureDuckDBSynchronized } from "./services/data/duckdb";

async function bootstrap() {
  // Phase 5 de-gating: the analytical projection is a best-effort accelerator
  // (no production read path queries it). A projection failure must not take
  // down the API — log loudly and serve from PostgreSQL instead.
  try {
    await ensureDuckDBSynchronized();
    console.log("[DuckDB] Analytical projection synchronized and ready.");
  } catch (err) {
    console.error(
      "[DuckDB] Projection unavailable at boot — continuing without it. Reads fall back to PostgreSQL:",
      err instanceof Error ? err.message : String(err)
    );
  }

  const app = createApp();
  const server = app.listen(env.API_PORT, () => {
    console.log(`ProductiveHix API listening on http://localhost:${env.API_PORT}`);
  });

  wsManager.attach(server);

  async function shutdown(signal: string) {
    console.log(`Received ${signal}; shutting down`);
    try {
      await closeDuckDB();
    } catch (err) {
      console.error("[DuckDB Shutdown Warning]:", err);
    }
    server.close(() => process.exit(0));
  }

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

bootstrap().catch((err) => {
  console.error("[FATAL] DuckDB analytical projection startup synchronization failed. HTTP server startup aborted:", err);
  process.exit(1);
});

