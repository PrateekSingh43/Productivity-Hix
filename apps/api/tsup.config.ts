import { defineConfig, type Options } from "tsup";

export default defineConfig((options: Options) => ({
  entry: ["src/index.ts"],
  clean: true,
  format: ["esm"],
  platform: "node",
  target: "node24",
  sourcemap: true,
  dts: true,
  external: ["@duckdb/node-api", "@repo/data", "@repo/db", "pg"],
  noExternal: [
    "@repo/validation",
    "@repo/analytics",
    "@repo/telemetry",
    "@repo/types",
  ],
  ...options,
}));
