import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client.js";

let client: PrismaClient | undefined;

export function getDb() {
  if (client) return client;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not configured");
  client = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  return client;
}

export async function disconnectDb() {
  if (client) await client.$disconnect();
}

export type Database = PrismaClient;
export * from "./generated/prisma/enums.js";
export * from "./generated/prisma/models.js";
export * from "./generated/prisma/client.js";
