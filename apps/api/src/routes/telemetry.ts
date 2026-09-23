import { Router, type RequestHandler } from "express";
import { requireAuth, userIdFrom } from "../middleware/auth";
import { telemetryBatchSchema } from "@repo/validation";
import { getDatesIntersectingInterval } from "@repo/types";
import { getDb } from "../lib/prisma";
import { getDuckDB, invalidateDuckDBSynchronization } from "../services/data/duckdb";
import { ingestTelemetryEvents, updateTelemetryEvent } from "@repo/data";
import { wsManager } from "../services/websocket/server";
import type { TelemetryEvent } from "@repo/telemetry";

export const telemetryRouter: Router = Router();

export const handleTelemetryBatch: RequestHandler = async (request, response, next) => {
  try {
    const userId = userIdFrom(request);
    const batch = telemetryBatchSchema.parse(request.body);

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

    // Query user's authoritative timezone (never silently fall back to UTC if configured)
    const userPref = await prisma.userPreference?.findUnique?.({
      where: { userId },
      select: { timezone: true },
    });
    const timezone = userPref?.timezone || "UTC";

    // Query existing events including original observation timestamp
    const existing = await prisma.normalizedActivity.findMany({
      where: {
        userId,
        externalId: { in: externalIds },
      },
      select: { id: true, externalId: true, duration: true, timestamp: true },
    });

    const existingMap = new Map<string, { id: string; duration: number; timestamp: Date }>();
    for (const e of existing) {
      if (e.id && e.id.trim().length > 0) {
        existingMap.set(e.externalId, { id: e.id, duration: e.duration, timestamp: e.timestamp });
      }
    }

    const newEvents: TelemetryEvent[] = [];
    const updateEvents: Array<{
      id: string;
      eventId: string;
      duration: number;
      durationMs: number;
      oldDurationMs: number;
      timestamp: Date;
      data: Record<string, unknown>;
    }> = [];
    let batchDuplicates = 0;

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
            oldDurationMs: Math.round(match.duration * 1000),
            timestamp: match.timestamp, // Original observation timestamp
            data: (ev.data ?? {}) as Record<string, unknown>,
          });
        } else {
          batchDuplicates++;
        }
      } else {
        newEvents.push(ev as unknown as TelemetryEvent);
      }
    }

    // Step 1: PostgreSQL is authoritative. Persist updates, inserts, day revision, and outbox in ONE transaction.
    const correlationId =
      (request.headers?.["x-correlation-id"] as string) ||
      `corr-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    let actuallyInsertedCount = 0;

    await prisma.$transaction(async (tx) => {
      if (updateEvents.length > 0) {
        for (const u of updateEvents) {
          if (!u.id || u.id.trim() === "") continue;
          await tx.normalizedActivity.update({
            where: { id: u.id },
            data: {
              duration: u.duration,
              data: u.data as any,
            },
          });
        }
      }

      let insertedRows: Array<{ id: string; externalId: string; timestamp: Date; duration: number }> = [];
      if (newEvents.length > 0) {
        const insertData = newEvents.map((e) => {
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
            duration: (e.durationMs || 0) / 1000,
            data: normalizedData as any,
          };
        });

        if (typeof (tx.normalizedActivity as any).createManyAndReturn === "function") {
          insertedRows = await (tx.normalizedActivity as any).createManyAndReturn({
            data: insertData,
            skipDuplicates: true,
            select: {
              id: true,
              externalId: true,
              timestamp: true,
              duration: true,
            },
          });
        } else if (typeof (tx.normalizedActivity as any).createMany === "function") {
          await (tx.normalizedActivity as any).createMany({
            data: insertData,
            skipDuplicates: true,
          });
          insertedRows = insertData.map((d: any, idx: number) => ({
            id: d.id || `mock-${idx}`,
            externalId: d.externalId,
            timestamp: d.timestamp,
            duration: d.duration,
          }));
        }
      }

      actuallyInsertedCount = insertedRows.length;

      // ACTUAL-MUTATION RULE:
      // A Timeline revision may advance ONLY for an authoritative database mutation.
      // If no mutations occurred (e.g. concurrent duplicate batch), do not bump revision or emit outbox event
      if (updateEvents.length === 0 && insertedRows.length === 0) {
        return;
      }

      // Group affected mutations by localDate using canonical half-open interval semantics [start, end)
      // For duration updates: affected interval is strictly OLD interval ∪ NEW interval!
      const dateMap = new Map<string, { start: Date; end: Date }>();

      for (const u of updateEvents) {
        const itemStart = u.timestamp;
        const oldEnd = new Date(itemStart.getTime() + Math.max(u.oldDurationMs, 0));
        const newEnd = new Date(itemStart.getTime() + Math.max(u.durationMs, 0));
        const unionEnd = new Date(Math.max(oldEnd.getTime(), newEnd.getTime()));
        const touched = getDatesIntersectingInterval(itemStart, unionEnd, timezone);

        for (const { localDate, interval } of touched) {
          const scopeStart = new Date(Math.max(itemStart.getTime(), interval.start.getTime()));
          const scopeEnd = new Date(Math.min(unionEnd.getTime(), interval.end.getTime()));
          const existingScope = dateMap.get(localDate);
          if (!existingScope) {
            dateMap.set(localDate, { start: scopeStart, end: scopeEnd });
          } else {
            if (scopeStart < existingScope.start) existingScope.start = scopeStart;
            if (scopeEnd > existingScope.end) existingScope.end = scopeEnd;
          }
        }
      }

      for (const r of insertedRows) {
        const itemStart = r.timestamp;
        const itemEnd = new Date(r.timestamp.getTime() + Math.max(Math.round(r.duration * 1000), 0));
        const touched = getDatesIntersectingInterval(itemStart, itemEnd, timezone);

        for (const { localDate, interval } of touched) {
          const scopeStart = new Date(Math.max(itemStart.getTime(), interval.start.getTime()));
          const scopeEnd = new Date(Math.min(itemEnd.getTime(), interval.end.getTime()));
          const existingScope = dateMap.get(localDate);
          if (!existingScope) {
            dateMap.set(localDate, { start: scopeStart, end: scopeEnd });
          } else {
            if (scopeStart < existingScope.start) existingScope.start = scopeStart;
            if (scopeEnd > existingScope.end) existingScope.end = scopeEnd;
          }
        }
      }

      // For each affected date: update TimelineDayState revision and emit canonical minimal OutboxEvent
      for (const [localDate, scope] of dateMap.entries()) {
        const dayState = await tx.timelineDayState.upsert({
          where: { userId_localDate: { userId, localDate } },
          create: {
            userId,
            localDate,
            currentObservationRevision: 1,
            currentRuleRevision: 0,
            status: "STALE",
          },
          update: {
            currentObservationRevision: { increment: 1 },
            status: "STALE",
            updatedAt: new Date(),
          },
        });

        await tx.outboxEvent.create({
          data: {
            eventType: "telemetry.ingested",
            aggregateType: "user",
            aggregateId: userId,
            payload: {
              userId,
              localDate,
              sourceRevision: dayState.currentObservationRevision,
              scope: {
                start: scope.start.toISOString(),
                end: scope.end.toISOString(),
              },
              reason: "telemetry_ingested",
              ruleRevision: dayState.currentRuleRevision,
            },
            correlationId,
            causationId: null,
            schemaVersion: "1.0.0",
            occurredAt: new Date(),
            status: "PENDING",
            publicationAttemptCount: 0,
            maxAttempts: 5,
            availableAt: new Date(),
          },
        });
      }
    });

    if (batch.source === "browser") {
      for (const ev of batch.events) {
        const domain = (ev.data as Record<string, unknown>)?.domain ?? "unknown";
        console.log(
          `[TELEMETRY RECEIVED] source: ${ev.source} | installationId: ${batch.installationId} | eventId: ${ev.eventId} | eventType: ${ev.eventType} | domain: ${domain} | timestamp: ${ev.timestamp}`
        );
      }
    }

    // Step 2: Project successfully persisted state to DuckDB analytical datastore.
    // If DuckDB projection fails, PostgreSQL remains committed; invalidate DuckDB readiness and log error.
    if (updateEvents.length > 0) {
      try {
        const duckdb = await getDuckDB();
        for (const u of updateEvents) {
          await updateTelemetryEvent(duckdb, userId, u.eventId, u.durationMs, u.data);
        }
      } catch (duckdbErr) {
        invalidateDuckDBSynchronization();
        console.error("[DuckDB Update Projection Error]: Projection invalidated:", duckdbErr);
      }
    }

    if (newEvents.length > 0) {
      try {
        const duckdb = await getDuckDB();
        await ingestTelemetryEvents(duckdb, userId, newEvents);
      } catch (duckdbErr) {
        invalidateDuckDBSynchronization();
        console.error("[DuckDB Ingest Projection Error]: Projection invalidated:", duckdbErr);
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

    const totalDuplicates = batchDuplicates + (newEvents.length - actuallyInsertedCount);
    response.json({
      accepted: actuallyInsertedCount + updateEvents.length,
      duplicates: totalDuplicates,
      rejected: 0,
    });
  } catch (error) {
    next(error);
  }
};

telemetryRouter.post("/batch", requireAuth, handleTelemetryBatch);
telemetryRouter.post("/desktop", requireAuth, handleTelemetryBatch);
telemetryRouter.post("/browser", requireAuth, handleTelemetryBatch);
