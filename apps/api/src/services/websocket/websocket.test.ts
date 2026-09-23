import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { createServer, type Server as HttpServer } from "node:http";
import { WebSocket } from "ws";
import { WebSocketManager } from "./server";

// Ensure test environment
process.env.NODE_ENV = "test";
process.env.ALLOW_DEV_AUTH = "true";

const DEV_USER_ID = "00000000-0000-0000-0000-000000000001";

function waitForMessage(ws: WebSocket): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Timeout waiting for WS message")), 5000);
    ws.once("message", (data) => {
      clearTimeout(timeout);
      resolve(JSON.parse(data.toString()));
    });
  });
}

function waitForClose(ws: WebSocket): Promise<{ code: number; reason: string }> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Timeout waiting for WS close")), 5000);
    ws.once("close", (code, reason) => {
      clearTimeout(timeout);
      resolve({ code, reason: reason.toString() });
    });
  });
}

function connectWS(port: number, query = ""): WebSocket {
  return new WebSocket(`ws://127.0.0.1:${port}/ws${query}`);
}

function waitForOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    if (ws.readyState === WebSocket.OPEN) {
      resolve();
      return;
    }
    const timeout = setTimeout(() => reject(new Error("Timeout waiting for WS open")), 5000);
    ws.once("open", () => {
      clearTimeout(timeout);
      resolve();
    });
    ws.once("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

describe("WebSocket integration", () => {
  let httpServer: HttpServer;
  let wsManager: WebSocketManager;
  let port: number;
  const openSockets: WebSocket[] = [];

  beforeEach(async () => {
    wsManager = new WebSocketManager();
    httpServer = createServer();
    wsManager.attach(httpServer);

    await new Promise<void>((resolve) => {
      httpServer.listen(0, "127.0.0.1", () => resolve());
    });

    const address = httpServer.address();
    if (!address || typeof address === "string") throw new Error("Failed to bind");
    port = address.port;
  });

  afterEach(async () => {
    // Close all test sockets
    for (const ws of openSockets) {
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
    }
    openSockets.length = 0;

    await new Promise<void>((resolve, reject) => {
      httpServer.close((err) => (err ? reject(err) : resolve()));
    });
  });

  function track(ws: WebSocket): WebSocket {
    openSockets.push(ws);
    return ws;
  }

  // ── Authentication ─────────────────────────────────────────────

  it("authenticated connection (dev-auth) receives connection:established", async () => {
    const ws = track(connectWS(port));
    const msg = await waitForMessage(ws);

    expect(msg.type).toBe("connection:established");
    expect(msg.userId).toBe(DEV_USER_ID);
    expect(msg.timestamp).toBeDefined();
  });

  it("unauthenticated connection is rejected with 1008", async () => {
    // Temporarily disable dev auth
    const original = process.env.ALLOW_DEV_AUTH;
    process.env.ALLOW_DEV_AUTH = "false";

    try {
      const ws = track(connectWS(port));

      // Should receive error then close
      const msg = await waitForMessage(ws);
      expect(msg.type).toBe("error");
      expect(msg.message).toBe("Authentication required");

      const close = await waitForClose(ws);
      expect(close.code).toBe(1008);
    } finally {
      process.env.ALLOW_DEV_AUTH = original;
    }
  });

  it("?userId= query parameter alone cannot establish identity", async () => {
    const original = process.env.ALLOW_DEV_AUTH;
    process.env.ALLOW_DEV_AUTH = "false";

    try {
      const ws = track(connectWS(port, "?userId=attacker-id"));

      const msg = await waitForMessage(ws);
      expect(msg.type).toBe("error");

      const close = await waitForClose(ws);
      expect(close.code).toBe(1008);
    } finally {
      process.env.ALLOW_DEV_AUTH = original;
    }
  });

  it("rejects dev auth in production even if ALLOW_DEV_AUTH=true", async () => {
    const origNodeEnv = process.env.NODE_ENV;
    const origDevAuth = process.env.ALLOW_DEV_AUTH;
    process.env.NODE_ENV = "production";
    process.env.ALLOW_DEV_AUTH = "true";

    try {
      const ws = track(connectWS(port));
      const msg = await waitForMessage(ws);
      expect(msg.type).toBe("error");
      expect(msg.message).toBe("Authentication required");

      const close = await waitForClose(ws);
      expect(close.code).toBe(1008);
    } finally {
      process.env.NODE_ENV = origNodeEnv;
      process.env.ALLOW_DEV_AUTH = origDevAuth;
    }
  });

  // ── Protocol ───────────────────────────────────────────────────

  it("responds to ping with pong", async () => {
    const ws = track(connectWS(port));
    await waitForMessage(ws); // consume connection:established
    await waitForOpen(ws);

    ws.send(JSON.stringify({ type: "ping" }));
    const msg = await waitForMessage(ws);

    expect(msg.type).toBe("pong");
    expect(msg.timestamp).toBeDefined();
  });

  it("rejects malformed JSON", async () => {
    const ws = track(connectWS(port));
    await waitForMessage(ws); // consume connection:established
    await waitForOpen(ws);

    ws.send("not-json{{{");
    const msg = await waitForMessage(ws);

    expect(msg.type).toBe("error");
    expect(msg.error).toBe("Invalid JSON");
  });

  it("rejects unknown message type", async () => {
    const ws = track(connectWS(port));
    await waitForMessage(ws); // consume connection:established
    await waitForOpen(ws);

    ws.send(JSON.stringify({ type: "unknown:type" }));
    const msg = await waitForMessage(ws);

    expect(msg.type).toBe("error");
    expect(msg.error).toContain("Unknown or invalid message type");
  });

  // ── AI handler boundary ────────────────────────────────────────

  it("ai:message reaches the AI handler and returns a structured event", async () => {
    const ws = track(connectWS(port));
    await waitForMessage(ws); // consume connection:established
    await waitForOpen(ws);

    ws.send(JSON.stringify({
      type: "ai:message",
      conversationId: "conv-123",
      messageId: "msg-456",
      content: "What did I work on today?",
    }));

    const started = await waitForMessage(ws);
    expect(started.type).toBe("ai:started");
    const msg = await waitForMessage(ws);
    expect(msg.type).toBe("ai:error");
    expect(msg.conversationId).toBe("conv-123");
    expect(msg.messageId).toBe("msg-456");
    expect(msg.error).toBeDefined();
  });

  // ── Connection cleanup ─────────────────────────────────────────

  it("disconnection removes socket from manager", async () => {
    const ws = track(connectWS(port));
    await waitForMessage(ws); // consume connection:established
    await waitForOpen(ws);

    // Socket should be registered
    expect(wsManager.getSocketCount(DEV_USER_ID)).toBe(1);

    // Close and wait
    ws.close();
    await waitForClose(ws);

    // Give the server a tick to process the close event
    await new Promise((r) => setTimeout(r, 50));
    expect(wsManager.getSocketCount(DEV_USER_ID)).toBe(0);
  });
});
