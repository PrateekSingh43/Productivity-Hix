import type { DuckDBClient } from "./client";
import type { TelemetryEvent } from "@repo/telemetry";

export async function ingestTelemetryEvents(
  client: DuckDBClient,
  events: TelemetryEvent[],
): Promise<number> {
  if (events.length === 0) return 0;

  const conn = client.getConnection();
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
