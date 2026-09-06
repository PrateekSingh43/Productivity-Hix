import "dotenv/config";
import { ApiTelemetryClient } from "./api/client";
import { DevicePairingManager } from "./auth/device-pairing";
import { DurableQueue } from "./queue/durable-queue";
import { BridgeStatusTracker } from "./status/status";
import { ActivityWatchSyncEngine } from "./activitywatch/sync";
import type { DesktopActivityEvent, TelemetryBatch } from "@repo/telemetry";

const VERSION = "0.2.0";

function nativeReply(value: unknown) {
  const payload = Buffer.from(JSON.stringify(value), "utf8");
  const header = Buffer.alloc(4);
  header.writeUInt32LE(payload.length, 0);
  process.stdout.write(Buffer.concat([header, payload]));
}

async function runNativeHost(pairing: DevicePairingManager) {
  let buffer = Buffer.alloc(0);
  process.stdin.on("data", (chunk: Buffer) => {
    buffer = Buffer.concat([buffer, chunk]);
    while (buffer.length >= 4) {
      const length = buffer.readUInt32LE(0);
      if (buffer.length < length + 4) return;
      const raw = buffer.subarray(4, length + 4).toString("utf8");
      buffer = buffer.subarray(length + 4);
      try {
        const request = JSON.parse(raw) as { type?: string };
        nativeReply({ connected: true, paired: pairing.isPaired(), version: VERSION });
      } catch {
        nativeReply({ connected: true, paired: pairing.isPaired(), version: VERSION });
      }
    }
  });
}

async function runAgent() {
  const pairing = new DevicePairingManager();
  if (process.argv.includes("--pair")) await pairing.pairDevice("ProductiveHix Desktop Agent");

  const queue = new DurableQueue();
  const api = new ApiTelemetryClient({ deviceToken: pairing.getDeviceToken() });
  const status = new BridgeStatusTracker();
  status.update({ bridgeVersion: VERSION, devicePaired: pairing.isPaired() });
  const intervalMs = Number.parseInt(process.env.PRODUCTIVEHIX_COLLECT_INTERVAL_MS ?? "5000", 10);

  console.log(`ProductiveHix Desktop Agent ${VERSION} started.`);
  console.log(pairing.isPaired() ? "Account connection: ready." : "Account connection: pending. Run with --pair to connect.");

  const awEngine = new ActivityWatchSyncEngine();
  let wasAwHealthy = false;

  const checkActivityWatch = async () => {
    const awHealthy = await awEngine.isHealthy();
    if (awHealthy && !wasAwHealthy) {
      const buckets = await awEngine.getDiscoveredBuckets();
      const windowStr = buckets.windowBucket ? buckets.windowBucket.id : "none";
      const afkStr = buckets.afkBucket ? buckets.afkBucket.id : "none";
      const inputStr = buckets.inputBucket ? buckets.inputBucket.id : "none";
      console.log("ActivityWatch detected locally on http://127.0.0.1:5600.");
      console.log(`Discovered ActivityWatch buckets: window=[${windowStr}], afk=[${afkStr}], input=[${inputStr}]`);
    } else if (!awHealthy && wasAwHealthy) {
      console.warn("ActivityWatch connection lost. Awaiting local ActivityWatch on http://127.0.0.1:5600.");
    } else if (!awHealthy && !wasAwHealthy) {
      console.log("ActivityWatch not running locally. Awaiting ActivityWatch service on http://127.0.0.1:5600 (REST only).");
    }
    wasAwHealthy = awHealthy;
    return awHealthy;
  };

  await checkActivityWatch();

  const cycle = async () => {
    const installationId = pairing.getInstallationId();

    // Ingest exclusively from ActivityWatch REST
    const awAvailable = await awEngine.isHealthy();
    if (awAvailable) {
      const awEvents: DesktopActivityEvent[] = await awEngine.sync(installationId);
      if (awEvents.length > 0) {
        await queue.enqueue(awEvents);
      }
    }

    status.update({ queueSize: queue.size(), apiReachable: await api.isReachable(), devicePaired: pairing.isPaired() });

    // Upload pending batches to Express API via HTTPS
    while (status.getStatus().apiReachable && (pairing.isPaired() || process.env.PRODUCTIVEHIX_DEV_USER_ID)) {
      const pending = queue.peek(100);
      if (!pending.length) break;
      const batch: TelemetryBatch = { installationId, source: "desktop", sentAt: new Date().toISOString(), events: pending };
      const result = await api.uploadBatch(batch);
      queue.acknowledge(pending.map((event) => event.eventId));
      status.recordSyncSuccess(result.accepted);
      status.update({ queueSize: queue.size() });
      if (pending.length < 100) break;
    }
  };

  let running = true;
  const shutdown = () => { running = false; console.log("Desktop Agent stopped."); process.exit(0); };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  while (running) {
    try { await cycle(); } catch (error) { console.warn("Collection cycle unavailable:", error instanceof Error ? error.message : error); }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

const pairingForNativeHost = new DevicePairingManager();
if (process.argv.includes("--native-host")) {
  void runNativeHost(pairingForNativeHost);
} else {
  void runAgent().catch((error) => { console.error("Desktop Agent failed:", error); process.exitCode = 1; });
}
