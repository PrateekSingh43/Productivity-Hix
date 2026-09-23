import { getDb as getBaseDb, disconnectDb as baseDisconnectDb } from "@repo/db";

type Database = ReturnType<typeof getBaseDb>;

let testDbOverride: Database | null = null;

export function getDb(): Database {
  if (testDbOverride) return testDbOverride;
  if (!process.env.DATABASE_URL) {
    return {} as Database;
  }
  return getBaseDb();
}

export function setTestDb(mockDb: any) {
  if (mockDb && typeof mockDb === "object") {
    if (!mockDb.$transaction) {
      mockDb.$transaction = async (fn: (tx: any) => any) => fn(mockDb);
    }
    if (!mockDb.timelineDayState) {
      mockDb.timelineDayState = {
        upsert: async () => ({ currentObservationRevision: 1, currentRuleRevision: 1 }),
        findUnique: async () => null,
      };
    }
    if (!mockDb.outboxEvent) {
      mockDb.outboxEvent = {
        create: async () => ({ id: "mock-outbox-id" }),
      };
    }
  }
  testDbOverride = mockDb as Database;
}

export function resetTestDb() {
  testDbOverride = null;
}

export const disconnectDb = baseDisconnectDb;

