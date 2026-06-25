import { defineConfig } from "vitest/config";

// Integration tests run route handlers against a REAL Postgres (DATABASE_URL).
// Requires the DB up + migrated (see CI / docker). Runs serially since the suite
// shares one database and the in-memory rate limiter.
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["tests/integration/**/*.int.test.ts"],
    setupFiles: ["./tests/integration/setup.ts"],
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
