import { defineConfig, type Options } from "tsup";

export default defineConfig((options: Options) => ({
  entry: ["src/main.ts"],
  clean: true,
  format: ["esm"],
  platform: "node",
  target: "node24",
  sourcemap: true,
  dts: false,
  noExternal: [
    "@repo/telemetry",
    "@repo/types",
    "@repo/validation",
  ],
  ...options,
}));
