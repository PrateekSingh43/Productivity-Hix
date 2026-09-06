import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  clean: true,
  format: ["esm"],
  platform: "node",
  target: "node24",
  sourcemap: true,
  dts: true,
  external: ["@prisma/adapter-pg", "@prisma/client"],
});
