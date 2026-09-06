import type { DuckDBClient } from "../client";

export type TopAppUsage = {
  application: string;
  totalDurationMs: number;
};

export type TopDomainUsage = {
  domain: string;
  totalDurationMs: number;
};

export type ActiveVsIdleSummary = {
  activeMs: number;
  idleMs: number;
};

export type HourlyDistribution = {
  hour: number;
  totalMs: number;
};

export async function getTopApplications(
  client: DuckDBClient,
  limit = 10,
): Promise<TopAppUsage[]> {
  const conn = client.getConnection();
  const res = await conn.runAndReadAll(`
    SELECT application, SUM(duration_ms) as total_duration
    FROM telemetry_events
    WHERE application IS NOT NULL AND event_type = 'active_window'
    GROUP BY application
    ORDER BY total_duration DESC
    LIMIT ${limit};
  `);

  const rows = res.getRows();
  return rows.map((row) => ({
    application: String(row[0]),
    totalDurationMs: Number(row[1] ?? 0),
  }));
}

export async function getTopDomains(
  client: DuckDBClient,
  limit = 10,
): Promise<TopDomainUsage[]> {
  const conn = client.getConnection();
  const res = await conn.runAndReadAll(`
    SELECT domain, SUM(duration_ms) as total_duration
    FROM telemetry_events
    WHERE domain IS NOT NULL AND event_type = 'active_tab'
    GROUP BY domain
    ORDER BY total_duration DESC
    LIMIT ${limit};
  `);

  const rows = res.getRows();
  return rows.map((row) => ({
    domain: String(row[0]),
    totalDurationMs: Number(row[1] ?? 0),
  }));
}

export async function getActiveVsIdleSummary(
  client: DuckDBClient,
): Promise<ActiveVsIdleSummary> {
  const conn = client.getConnection();
  const res = await conn.runAndReadAll(`
    SELECT
      COALESCE(SUM(CASE WHEN event_type = 'active_window' OR (event_type = 'afk' AND afk_state = 'active') THEN duration_ms ELSE 0 END), 0) as active_ms,
      COALESCE(SUM(CASE WHEN event_type = 'afk' AND afk_state = 'afk' THEN duration_ms ELSE 0 END), 0) as idle_ms
    FROM telemetry_events;
  `);

  const rows = res.getRows();
  if (rows.length === 0) return { activeMs: 0, idleMs: 0 };
  return {
    activeMs: Number(rows[0][0] ?? 0),
    idleMs: Number(rows[0][1] ?? 0),
  };
}

export async function getHourlyDistribution(
  client: DuckDBClient,
): Promise<HourlyDistribution[]> {
  const conn = client.getConnection();
  const res = await conn.runAndReadAll(`
    SELECT EXTRACT(hour FROM timestamp) as hr, SUM(duration_ms) as total_duration
    FROM telemetry_events
    GROUP BY hr
    ORDER BY hr ASC;
  `);

  const rows = res.getRows();
  return rows.map((row) => ({
    hour: Number(row[0]),
    totalMs: Number(row[1] ?? 0),
  }));
}
