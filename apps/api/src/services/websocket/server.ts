import type { Server as HttpServer } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { parse } from "node:url";
import { env } from "../../config/env";
import { validateDeviceToken } from "../auth/device-auth";

export class WebSocketManager {
  private wss: WebSocketServer | null = null;
  private userSockets: Map<string, Set<WebSocket>> = new Map();

  attach(server: HttpServer): void {
    this.wss = new WebSocketServer({ server, path: "/ws" });

    this.wss.on("connection", async (ws: WebSocket, req) => {
      const parsed = parse(req.url || "", true);
      const queryUserId = parsed.query.userId as string | undefined;
      const queryToken = parsed.query.token as string | undefined;

      // Extract user ID (from query, token, or dev auth)
      let userId = queryUserId;
      if (!userId && queryToken && queryToken.startsWith("phix_dt_")) {
        const validated = await validateDeviceToken(queryToken);
        if (validated) {
          userId = validated.userId;
        }
      }
      if (!userId && env.ALLOW_DEV_AUTH) {
        userId = "00000000-0000-0000-0000-000000000001";
      }

      if (!userId) {
        ws.send(JSON.stringify({ type: "error", message: "Authentication required" }));
        ws.close(1008, "Authentication required");
        return;
      }

      this.registerSocket(userId, ws);

      ws.send(
        JSON.stringify({
          type: "connection:established",
          userId,
          timestamp: new Date().toISOString(),
        }),
      );

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
