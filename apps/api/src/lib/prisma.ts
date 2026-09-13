import { getDb as getBaseDb, disconnectDb as baseDisconnectDb } from "@repo/db";

type Database = ReturnType<typeof getBaseDb>;

let testDbOverride: Database | null = null;

export function getDb(): Database {
  if (testDbOverride) return testDbOverride;
  return getBaseDb();
}

export function setTestDb(mockDb: any) {
  testDbOverride = mockDb as Database;
}

export function resetTestDb() {
  testDbOverride = null;
}

export const disconnectDb = baseDisconnectDb;

