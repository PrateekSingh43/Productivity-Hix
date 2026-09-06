// ProductiveHix DB config (Prisma 7)
//
// Prisma 7 moved datasource URLs out of schema.prisma into this config file.
// NOTE: `Datasource` in @prisma/config 7.4 supports only { url, shadowDatabaseUrl }
// — there is NO directUrl option. Supabase setups therefore need routing here:
//   - Runtime/app traffic uses DATABASE_URL (transaction pooler, port 6543).
//   - Schema commands (migrate / db push / pull / studio) need the DIRECT
//     connection — DDL over the transaction pooler hangs.
import "dotenv/config";
import { defineConfig } from "prisma/config";

const args = process.argv.slice(2).join(" ");
const isSchemaCommand =
  /\b(db\s+(push|pull|seed))\b/.test(args) ||
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
