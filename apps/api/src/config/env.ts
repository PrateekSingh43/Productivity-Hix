import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const configDirectory = path.dirname(fileURLToPath(import.meta.url));

// Explicitly load configuration from multiple candidate locations
// to ensure deterministic configuration whether run from root, apps/api, or dist.
const envCandidatePaths = [
  path.resolve(configDirectory, "../../.env"),
  path.resolve(configDirectory, "../.env"),
  path.resolve(configDirectory, ".env"),
  path.resolve(process.cwd(), "apps/api/.env"),
  path.resolve(process.cwd(), ".env"),
  path.resolve(configDirectory, "../../../../packages/db/.env"),
  path.resolve(configDirectory, "../../../packages/db/.env"),
  path.resolve(process.cwd(), "packages/db/.env"),
  path.resolve(configDirectory, "../../../ai/.env"),
  path.resolve(configDirectory, "../../ai/.env"),
  path.resolve(process.cwd(), "apps/ai/.env"),
];

for (const envPath of envCandidatePaths) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath, quiet: true });
  }
}

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: z.coerce.number().int().positive().default(5000),
  WEB_ORIGIN: z.string().default("http://localhost:5173"),
  DATABASE_URL: z.string().optional(),
  ACTIVITYWATCH_BASE_URL: z.string().url().default("http://localhost:5600"),
  OAUTH_CLIENT_ID: z.string().optional(),
  OAUTH_CLIENT_SECRET: z.string().optional(),
  OAUTH_CALLBACK_URL: z.string().url().optional(),
  SESSION_SECRET: z.string().min(32).optional(),
  DUCKDB_PATH: z.string().optional(),
  ALLOW_DEV_AUTH: z
    .string()
    .optional()
    .transform((value) => value === "true"),
  AI_PROVIDER: z.string().optional(),
  AI_MODEL: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  GROQ_API_KEY: z.string().optional(),
  AI_TEMPERATURE: z.coerce.number().min(0).max(2).optional(),
  AI_DEFAULT_MAX_OUTPUT_TOKENS: z.coerce.number().int().positive().max(8192).optional(),
  AI_MAX_OUTPUT_TOKENS: z.coerce.number().int().positive().max(8192).optional(),
});

export type Env = z.infer<typeof envSchema>;
export const env = envSchema.parse(process.env);
