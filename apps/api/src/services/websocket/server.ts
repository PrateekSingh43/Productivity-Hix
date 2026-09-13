import type { Server as HttpServer } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { authenticateWSConnection } from "./auth";
import { routeWSMessage } from "./router";

export class WebSocketManager {
  private wss: WebSocketServer | null = null;
  private userSockets: Map<string, Set<WebSocket>> = new Map();

  attach(server: HttpServer): void {
    this.wss = new WebSocketServer({ server, path: "/ws" });

    this.wss.on("connection", async (ws: WebSocket, req) => {
      const auth = await authenticateWSConnection(req);

      if (!auth) {
        ws.send(JSON.stringify({ type: "error", message: "Authentication required" }));
        ws.close(1008, "Authentication required");
        return;
      }

      const { userId } = auth;
      this.registerSocket(userId, ws);

      ws.send(
        JSON.stringify({
          type: "connection:established",
          userId,
          timestamp: new Date().toISOString(),
        }),
      );

      ws.on("message", (data) => {
        const raw = typeof data === "string" ? data : data.toString("utf8");
        routeWSMessage(ws, userId, raw);
      });

      ws.on("close", () => {
        this.unregisterSocket(userId, ws);
      });

      ws.on("error", (err) => {
        console.error(`WebSocket error for user ${userId}:`, err);
        this.unregisterSocket(userId, ws);
      });
    });

    console.log("WebSocket server attached on /ws");
  }

  broadcastToUser(userId: string, payload: unknown): void {
    const sockets = this.userSockets.get(userId);
    if (!sockets || sockets.size === 0) return;

    const message = JSON.stringify(payload);
    for (const ws of sockets) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(message);
      }
    }
  }

  broadcastToAll(payload: unknown): void {
    if (!this.wss) return;
    const message = JSON.stringify(payload);
    for (const client of this.wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  }

  /** Visible for testing — number of sockets registered for a user. */
  getSocketCount(userId: string): number {
    return this.userSockets.get(userId)?.size ?? 0;
  }

  private registerSocket(userId: string, ws: WebSocket): void {
    let set = this.userSockets.get(userId);
    if (!set) {
      set = new Set();
      this.userSockets.set(userId, set);
    }
    set.add(ws);
  }

  private unregisterSocket(userId: string, ws: WebSocket): void {
    const set = this.userSockets.get(userId);
    if (set) {
      set.delete(ws);
      if (set.size === 0) {
        this.userSockets.delete(userId);
      }
    }
  }
}

export const wsManager = new WebSocketManager();
