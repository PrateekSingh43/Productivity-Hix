import { createApp } from "./app";
import { env } from "./config/env";
import { wsManager } from "./services/websocket/server";
import { closeDuckDB, ensureDuckDBSynchronized } from "./services/data/duckdb";

async function bootstrap() {
  try {
    await ensureDuckDBSynchronized();
    console.log("[DuckDB] Analytical projection synchronized and ready.");
  } catch (err) {
    console.error("[DuckDB Sync Error]: Startup synchronization deferred or failed:", err);
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

void bootstrap();

