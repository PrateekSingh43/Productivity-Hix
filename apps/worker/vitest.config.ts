import { defineConfig } from "vitest/config";

// Serial file execution: real-Postgres suites share one small Supabase
// pooler (15 sessions) with other local tracks. Parallel files + default
// pg pools (10 each) exhaust it with EMAXCONNSESSION flakes that have nothing
// to do with the code under test. Mock suites stay fast; total runtime ~1min.
export default defineConfig({
  test: {
    pool: "forks",
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    testTimeout: 120_000,
  },
});
