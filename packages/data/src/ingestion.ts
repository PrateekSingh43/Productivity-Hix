import type { DuckDBClient } from "./client";
import type { TelemetryEvent } from "@repo/telemetry";

export async function ingestTelemetryEvents(
  client: DuckDBClient,
  userId: string,
  events: TelemetryEvent[],
): Promise<number> {
  if (events.length === 0) return 0;
  if (!userId || userId.trim() === "") {
    throw new Error("userId is required for ingestTelemetryEvents");
  }

  const conn = client.getConnection();
  const safeUserId = userId.replace(/'/g, "''");
  let count = 0;

  for (const event of events) {
    const rawDataJson = JSON.stringify(event.data || {}).replace(/'/g, "''");
    const app = (event.data as { application?: string }).application?.replace(/'/g, "''") ?? null;
    const title = (event.data as { windowTitle?: string }).windowTitle?.replace(/'/g, "''") ?? null;
    const afkState = (event.data as { state?: string }).state?.replace(/'/g, "''") ?? null;
    const domain = (event.data as { domain?: string }).domain?.replace(/'/g, "''") ?? null;
    const sanitizedUrl = (event.data as { sanitizedUrl?: string }).sanitizedUrl?.replace(/'/g, "''") ?? null;
    const pageTitle = (event.data as { pageTitle?: string }).pageTitle?.replace(/'/g, "''") ?? null;

    const collector = event.provenance?.collector ? `'${event.provenance.collector.replace(/'/g, "''")}'` : "NULL";
    const collectorName = event.provenance?.collectorName ? `'${event.provenance.collectorName.replace(/'/g, "''")}'` : "NULL";
    const bucketId = event.provenance?.bucketId ? `'${event.provenance.bucketId.replace(/'/g, "''")}'` : "NULL";

    const sql = `
      INSERT OR REPLACE INTO telemetry_events (
        event_id,
        user_id,
        source,
        installation_id,
        event_type,
        timestamp,
        duration_ms,
        application,
        window_title,
        afk_state,
        domain,
        sanitized_url,
        page_title,
        collector,
        collector_name,
        bucket_id,
        raw_data
      ) VALUES (
        '${event.eventId.replace(/'/g, "''")}',
        '${safeUserId}',
        '${event.source}',
        '${event.installationId.replace(/'/g, "''")}',
        '${event.eventType}',
        TIMESTAMPTZ '${event.timestamp}',
        ${event.durationMs},
        ${app ? `'${app}'` : "NULL"},
        ${title ? `'${title}'` : "NULL"},
        ${afkState ? `'${afkState}'` : "NULL"},
        ${domain ? `'${domain}'` : "NULL"},
        ${sanitizedUrl ? `'${sanitizedUrl}'` : "NULL"},
        ${pageTitle ? `'${pageTitle}'` : "NULL"},
        ${collector},
        ${collectorName},
        ${bucketId},
        '${rawDataJson}'
      );
    `;

    await conn.run(sql);
    count++;
  }

  return count;
}

export async function updateTelemetryEvent(
  client: DuckDBClient,
  userId: string,
  eventId: string,
  durationMs: number,
  data?: Record<string, unknown>,
): Promise<void> {
  if (!userId || userId.trim() === "") {
    throw new Error("userId is required for updateTelemetryEvent");
  }
  const conn = client.getConnection();
  const safeUserId = userId.replace(/'/g, "''");
  const safeEventId = eventId.replace(/'/g, "''");

  const app = (data as { application?: string })?.application?.replace(/'/g, "''") ?? null;
  const title = (data as { windowTitle?: string })?.windowTitle?.replace(/'/g, "''") ?? null;
  const afkState = (data as { state?: string })?.state?.replace(/'/g, "''") ?? null;
  const domain = (data as { domain?: string })?.domain?.replace(/'/g, "''") ?? null;
  const sanitizedUrl = (data as { sanitizedUrl?: string })?.sanitizedUrl?.replace(/'/g, "''") ?? null;
  const pageTitle = (data as { pageTitle?: string })?.pageTitle?.replace(/'/g, "''") ?? null;
  const rawDataJson = data ? JSON.stringify(data).replace(/'/g, "''") : null;

  let updateSetClauses = `duration_ms = ${Math.round(durationMs)}`;
  if (app !== null) updateSetClauses += `, application = '${app}'`;
  if (title !== null) updateSetClauses += `, window_title = '${title}'`;
  if (afkState !== null) updateSetClauses += `, afk_state = '${afkState}'`;
  if (domain !== null) updateSetClauses += `, domain = '${domain}'`;
  if (sanitizedUrl !== null) updateSetClauses += `, sanitized_url = '${sanitizedUrl}'`;
  if (pageTitle !== null) updateSetClauses += `, page_title = '${pageTitle}'`;
  if (rawDataJson !== null) updateSetClauses += `, raw_data = '${rawDataJson}'`;

  await conn.run(`
    UPDATE telemetry_events
    SET ${updateSetClauses}
    WHERE user_id = '${safeUserId}' AND event_id = '${safeEventId}';
  `);
}

export async function updateTelemetryEventDuration(
  client: DuckDBClient,
  userId: string,
  eventId: string,
  durationMs: number,
): Promise<void> {
  return updateTelemetryEvent(client, userId, eventId, durationMs);
}

