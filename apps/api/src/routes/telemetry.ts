import { Router, type RequestHandler } from "express";
import { requireAuth, userIdFrom } from "../middleware/auth";
import { telemetryBatchSchema } from "@repo/validation";
import { getDb } from "../lib/prisma";
import { getDuckDB } from "../services/data/duckdb";
import { ingestTelemetryEvents } from "@repo/data";
import { wsManager } from "../services/websocket/server";
import type { TelemetryEvent } from "@repo/telemetry";

export const telemetryRouter: Router = Router();

const handleTelemetryBatch: RequestHandler = async (request, response, next) => {
  try {
    const userId = userIdFrom(request);
    const batch = telemetryBatchSchema.parse(request.body);

    const eventIds = batch.events.map((e: { eventId: string }) => e.eventId);

    // 1. Check existing events in PostgreSQL for deduplication
    const prisma = getDb();
    const existing = await prisma.normalizedActivity.findMany({
      where: {
        userId,
        externalId: { in: eventIds },
      },
      select: { externalId: true },
    });

    const existingSet = new Set(existing.map((e: { externalId: string }) => e.externalId));
    const newEvents: TelemetryEvent[] = [];
    let duplicates = 0;

    for (const ev of batch.events) {
      if (existingSet.has(ev.eventId)) {
        duplicates++;
      } else {
        existingSet.add(ev.eventId);
        newEvents.push(ev as unknown as TelemetryEvent);
      }
    }

    if (batch.source === "browser") {
      for (const ev of batch.events) {
        const domain = (ev.data as Record<string, unknown>)?.domain ?? "unknown";
        console.log(
          `[TELEMETRY RECEIVED] source: ${ev.source} | installationId: ${batch.installationId} | eventId: ${ev.eventId} | eventType: ${ev.eventType} | domain: ${domain} | timestamp: ${ev.timestamp}`
        );
      }
    }

    // 2. Ingest into DuckDB (analytical datastore)
    if (newEvents.length > 0) {
      const duckdb = await getDuckDB();
      await ingestTelemetryEvents(duckdb, newEvents);

      // 3. Persist normalized activity in PostgreSQL (relational source of truth)
      await prisma.normalizedActivity.createMany({
        data: newEvents.map((e) => {
          const rawData = (e.data ?? {}) as Record<string, unknown>;
          const normalizedData: Record<string, unknown> = {
            ...rawData,
            provenance: e.provenance ?? {
              collector: e.source === "browser" ? "browser-extension" : "activitywatch",
              bucketId: batch.installationId,
            },
          };
          return {
            userId,
            externalId: e.eventId,
            bucketId: e.provenance?.bucketId ?? batch.installationId,
            source: e.source,
            watcher: e.eventType,
            timestamp: new Date(e.timestamp),
            duration: e.durationMs / 1000,
            data: normalizedData as any,
          };
        }),
        skipDuplicates: true,
      });

      // 4. Broadcast live telemetry update to active Web UI clients
      const latestEvent = newEvents[newEvents.length - 1];
      wsManager.broadcastToUser(userId, {
        type: "telemetry:event",
        source: batch.source,
        event: latestEvent,
        timestamp: new Date().toISOString(),
      });
      wsManager.broadcastToUser(userId, {
        type: "device:sync",
        source: batch.source,
        accepted: newEvents.length,
        timestamp: new Date().toISOString(),
      });
    }

    response.json({
      accepted: newEvents.length,
      duplicates,
      rejected: 0,
    });
  } catch (error) {
    next(error);
  }
};

telemetryRouter.post("/batch", requireAuth, handleTelemetryBatch);
telemetryRouter.post("/desktop", requireAuth, handleTelemetryBatch);
telemetryRouter.post("/browser", requireAuth, handleTelemetryBatch);
