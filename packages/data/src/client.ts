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

  private async setupSchema(): Promise<void> {
    const conn = this.getConnection();
    await conn.run(`
      CREATE TABLE IF NOT EXISTS telemetry_events (
        event_id VARCHAR PRIMARY KEY,
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
        raw_data JSON
      );
    `);
  }

  async close(): Promise<void> {
    this.connection = null;
    this.instance = null;
    this.initialized = false;
  }
}
