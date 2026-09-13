import { Router, type RequestHandler } from "express";
import { requireAuth, userIdFrom } from "../middleware/auth";
import { telemetryBatchSchema } from "@repo/validation";
import { getDb } from "../lib/prisma";
import { getDuckDB } from "../services/data/duckdb";
import { ingestTelemetryEvents, updateTelemetryEvent } from "@repo/data";
import { wsManager } from "../services/websocket/server";
import type { TelemetryEvent } from "@repo/telemetry";

export const telemetryRouter: Router = Router();

const handleTelemetryBatch: RequestHandler = async (request, response, next) => {
  try {
    const userId = userIdFrom(request);
    const batch = telemetryBatchSchema.parse(request.body);

    const eventIds = batch.events.map((e: { eventId: string }) => e.eventId);

    // 1. First consolidate/deduplicate incoming events in batch by eventId (keep event with highest duration)
    const dedupedBatchMap = new Map<string, (typeof batch.events)[number]>();
    for (const ev of batch.events) {
      const existingInBatch = dedupedBatchMap.get(ev.eventId);
      if (!existingInBatch) {
        dedupedBatchMap.set(ev.eventId, ev);
      } else {
        const existingDur = existingInBatch.durationMs || 0;
        const incomingDur = ev.durationMs || 0;
        if (incomingDur >= existingDur) {
          dedupedBatchMap.set(ev.eventId, ev);
        }
      }
    }
    const dedupedEvents = Array.from(dedupedBatchMap.values());

    const externalIds = dedupedEvents.map((e) => e.eventId);
    const prisma = getDb();
    const existing = await prisma.normalizedActivity.findMany({
      where: {
        userId,
        externalId: { in: externalIds },
      },
      select: { id: true, externalId: true, duration: true },
    });

    const existingMap = new Map<string, { id: string; duration: number }>();
    for (const e of existing) {
      if (e.id && e.id.trim().length > 0) {
        existingMap.set(e.externalId, { id: e.id, duration: e.duration });
      }
    }

    const newEvents: TelemetryEvent[] = [];
    const updateEvents: Array<{
      id: string;
      eventId: string;
      duration: number;
      durationMs: number;
      data: Record<string, unknown>;
    }> = [];
    let duplicates = 0;

    for (const ev of dedupedEvents) {
      const match = existingMap.get(ev.eventId);
      if (match) {
        const incomingDurationSec = Math.max(0, (ev.durationMs || 0) / 1000);
        if (incomingDurationSec > match.duration + 0.5) {
          updateEvents.push({
            id: match.id,
            eventId: ev.eventId,
            duration: incomingDurationSec,
            durationMs: ev.durationMs || Math.round(incomingDurationSec * 1000),
            data: (ev.data ?? {}) as Record<string, unknown>,
          });
        } else {
          duplicates++;
        }
      } else {
        newEvents.push(ev as unknown as TelemetryEvent);
      }
    }

    // Step 1: PostgreSQL is authoritative. Persist updates and inserts to PostgreSQL first.
    if (updateEvents.length > 0) {
      for (const u of updateEvents) {
        if (!u.id || u.id.trim() === "") continue;
        await prisma.normalizedActivity.update({
          where: { id: u.id },
          data: {
            duration: u.duration,
            data: u.data as any,
          },
        });
      }
    }

    if (newEvents.length > 0) {
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
    }

    if (batch.source === "browser") {
      for (const ev of batch.events) {
        const domain = (ev.data as Record<string, unknown>)?.domain ?? "unknown";
        console.log(
          `[TELEMETRY RECEIVED] source: ${ev.source} | installationId: ${batch.installationId} | eventId: ${ev.eventId} | eventType: ${ev.eventType} | domain: ${domain} | timestamp: ${ev.timestamp}`
        );
      }
    }

    // Step 2: Project successfully persisted state to DuckDB analytical datastore.
    // If DuckDB projection fails, PostgreSQL remains committed; log error for later rebuild.
    if (updateEvents.length > 0) {
      try {
        const duckdb = await getDuckDB();
        for (const u of updateEvents) {
          await updateTelemetryEvent(duckdb, userId, u.eventId, u.durationMs, u.data);
        }
      } catch (duckdbErr) {
        console.error("[DuckDB Update Projection Error]:", duckdbErr);
      }
    }

    if (newEvents.length > 0) {
      try {
        const duckdb = await getDuckDB();
        await ingestTelemetryEvents(duckdb, userId, newEvents);
      } catch (duckdbErr) {
        console.error("[DuckDB Ingest Projection Error]:", duckdbErr);
      }

      // Broadcast live telemetry update to active Web UI clients
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
