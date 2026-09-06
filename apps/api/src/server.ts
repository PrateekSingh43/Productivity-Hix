import { createApp } from "./app";
import { env } from "./config/env";
import { wsManager } from "./services/websocket/server";

const app = createApp();
const server = app.listen(env.API_PORT, () => {
  console.log(`ProductiveHix API listening on http://localhost:${env.API_PORT}`);
});

wsManager.attach(server);

function shutdown(signal: string) {
  console.log(`Received ${signal}; shutting down`);
  server.close(() => process.exit(0));
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
