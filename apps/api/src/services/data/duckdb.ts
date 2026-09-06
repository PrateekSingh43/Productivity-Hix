import { DuckDBClient } from "@repo/data";

let duckdbClient: DuckDBClient | null = null;

export async function getDuckDB(): Promise<DuckDBClient> {
  if (!duckdbClient) {
    duckdbClient = new DuckDBClient();
    await duckdbClient.initialize();
  }
  return duckdbClient;
}
