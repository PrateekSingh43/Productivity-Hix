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

function buildTimeFilter(from?: Date, to?: Date): string {
  let filter = "";
  if (from) {
    filter += ` AND timestamp >= TIMESTAMPTZ '${from.toISOString()}'`;
  }
  if (to) {
    filter += ` AND timestamp < TIMESTAMPTZ '${to.toISOString()}'`;
  }
  return filter;
}

export async function getTopApplications(
  client: DuckDBClient,
  userId: string,
  limit = 10,
  from?: Date,
  to?: Date,
): Promise<TopAppUsage[]> {
  if (!userId || userId.trim() === "") {
    throw new Error("userId is required for getTopApplications");
  }
  const conn = client.getConnection();
  const safeUserId = userId.replace(/'/g, "''");
  const timeFilter = buildTimeFilter(from, to);

  const res = await conn.runAndReadAll(`
    SELECT application, SUM(duration_ms) as total_duration
    FROM telemetry_events
    WHERE user_id = '${safeUserId}' AND application IS NOT NULL AND event_type = 'active_window'${timeFilter}
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
  userId: string,
  limit = 10,
  from?: Date,
  to?: Date,
): Promise<TopDomainUsage[]> {
  if (!userId || userId.trim() === "") {
    throw new Error("userId is required for getTopDomains");
  }
  const conn = client.getConnection();
  const safeUserId = userId.replace(/'/g, "''");
  const timeFilter = buildTimeFilter(from, to);

  const res = await conn.runAndReadAll(`
    SELECT domain, SUM(duration_ms) as total_duration
    FROM telemetry_events
    WHERE user_id = '${safeUserId}' AND domain IS NOT NULL AND event_type = 'active_tab'${timeFilter}
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
  userId: string,
  from?: Date,
  to?: Date,
): Promise<ActiveVsIdleSummary> {
  if (!userId || userId.trim() === "") {
    throw new Error("userId is required for getActiveVsIdleSummary");
  }
  const conn = client.getConnection();
  const safeUserId = userId.replace(/'/g, "''");
  const timeFilter = buildTimeFilter(from, to);

  const res = await conn.runAndReadAll(`
    SELECT
      COALESCE(SUM(CASE WHEN event_type = 'active_window' OR (event_type = 'afk' AND afk_state = 'active') THEN duration_ms ELSE 0 END), 0) as active_ms,
      COALESCE(SUM(CASE WHEN event_type = 'afk' AND afk_state = 'afk' THEN duration_ms ELSE 0 END), 0) as idle_ms
    FROM telemetry_events
    WHERE user_id = '${safeUserId}'${timeFilter};
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
  userId: string,
  from?: Date,
  to?: Date,
  timezone = "UTC",
): Promise<HourlyDistribution[]> {
  if (!userId || userId.trim() === "") {
    throw new Error("userId is required for getHourlyDistribution");
  }
  const conn = client.getConnection();
  const safeUserId = userId.replace(/'/g, "''");
  const safeTz = timezone.replace(/'/g, "''");
  const timeFilter = buildTimeFilter(from, to);

  const res = await conn.runAndReadAll(`
    SELECT EXTRACT(hour FROM timezone('${safeTz}', timestamp)) as hr, SUM(duration_ms) as total_duration
    FROM telemetry_events
    WHERE user_id = '${safeUserId}'${timeFilter}
    GROUP BY hr
    ORDER BY hr ASC;
  `);

  const rows = res.getRows();
  return rows.map((row) => ({
    hour: Number(row[0]),
    totalMs: Number(row[1] ?? 0),
  }));
}
