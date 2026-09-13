import { DuckDBInstance, type DuckDBConnection } from "@duckdb/node-api";

export class DuckDBClient {
  private instance: DuckDBInstance | null = null;
  private connection: DuckDBConnection | null = null;
  private initialized = false;

  async initialize(dbPath = ":memory:"): Promise<void> {
    if (this.initialized) return;

    this.instance = await DuckDBInstance.create(dbPath);
    this.connection = await this.instance.connect();
    await this.setupSchema();
    this.initialized = true;
  }

  getConnection(): DuckDBConnection {
    if (!this.connection) {
      throw new Error("DuckDBClient is not initialized. Call initialize() first.");
    }
    return this.connection;
  }

  async isSchemaCompatible(): Promise<boolean> {
    const conn = this.getConnection();
    try {
      const res = await conn.runAndReadAll(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'telemetry_events';
      `);
      const rows = res.getRows();
      if (rows.length === 0) return false;
      const colNames = rows.map((r) => String(r[0]).toLowerCase());
      return colNames.includes("user_id") && colNames.includes("event_id");
    } catch {
      return false;
    }
  }

  async resetSchema(): Promise<void> {
    const conn = this.getConnection();
    await conn.run(`DROP TABLE IF EXISTS telemetry_events;`);
    await this.setupSchema();
  }

  private async setupSchema(): Promise<void> {
    const conn = this.getConnection();
    await conn.run(`
      CREATE TABLE IF NOT EXISTS telemetry_events (
        event_id VARCHAR NOT NULL,
        user_id VARCHAR NOT NULL,
        source VARCHAR NOT NULL,
        installation_id VARCHAR NOT NULL,
        event_type VARCHAR NOT NULL,
        timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
        duration_ms BIGINT NOT NULL,
        application VARCHAR,
        window_title VARCHAR,
        afk_state VARCHAR,
        domain VARCHAR,
        sanitized_url VARCHAR,
        page_title VARCHAR,
        collector VARCHAR,
        collector_name VARCHAR,
        bucket_id VARCHAR,
        raw_data JSON,
        PRIMARY KEY (user_id, event_id)
      );
    `);
  }

  async close(): Promise<void> {
    if (this.connection) {
      try {
        this.connection.closeSync();
      } catch {
        // ignore
      }
      this.connection = null;
    }
    if (this.instance) {
      try {
        this.instance.closeSync();
      } catch {
        // ignore
      }
      this.instance = null;
    }
    this.initialized = false;
  }
}
