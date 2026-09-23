import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { PrismaClient } from "./generated/prisma/client.js";

let client: PrismaClient | undefined;

export function getDb() {
  if (client) return client;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not configured");
  // Optional cap on pg pool size (e.g. PGPOOL_MAX=2 in tests sharing a small
  // Supabase pooler). Unset = adapter default; production behavior unchanged.
  const poolMax = Number(process.env.PGPOOL_MAX ?? 0);
  const adapter =
    Number.isSafeInteger(poolMax) && poolMax > 0
      ? new PrismaPg(new Pool({ connectionString, max: poolMax }))
      : new PrismaPg({ connectionString });
  client = new PrismaClient({ adapter });
  return client;
}

export async function disconnectDb() {
  if (client) await client.$disconnect();
}

export type Database = PrismaClient;
export * from "./generated/prisma/enums.js";
export * from "./generated/prisma/models.js";
export * from "./generated/prisma/client.js";
