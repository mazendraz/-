import { defineConfig } from "vitest/config";

// Concurrency / stress suite. Same contract as vitest.integration.config.ts —
// real route handlers against a REAL local Postgres — but these files fire many
// requests at once on purpose, so they are kept in their own suite:
//
//   • they are slower and noisier than the integration suite, and a red result
//     here is a *finding about concurrency*, not a broken build;
//   • they need the site-wide lead circuit breaker raised (see tests/stress/
//     setup.ts), which must not leak into the integration suite that asserts
//     the shipped default.
//
// Serial across files (fileParallelism:false) for the same reason the
// integration suite is: one shared database and one in-memory rate limiter.
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["tests/stress/**/*.stress.test.ts"],
    setupFiles: ["./tests/stress/setup.ts"],
    fileParallelism: false,
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
