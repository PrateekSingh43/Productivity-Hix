/// <reference types="node" />
import "dotenv/config";
import { defineConfig } from "prisma/config";

const args = process.argv.slice(2).join(" ");
const isSchemaCommand =
  /\b(db\s+(push|pull|seed|execute))\b/.test(args) ||
  /\bmigrate\b/.test(args) ||
  /\bstudio\b/.test(args);

const databaseUrl =
  isSchemaCommand && process.env.DIRECT_URL
    ? process.env.DIRECT_URL
    : process.env.DATABASE_URL;

if (!databaseUrl && isSchemaCommand) {
  throw new Error(
    "DATABASE_URL (and ideally DIRECT_URL) missing. Copy packages/db/.env.example to packages/db/.env."
  );
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: databaseUrl,
  },
});



