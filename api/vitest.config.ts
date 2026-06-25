import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    setupFiles: ["./vitest.setup.ts"],
    // NOTE: the `test` npm script passes --no-file-parallelism. Vitest 4's
    // multi-worker pool races on init under Windows (every file fails
    // identically with "Cannot read properties of undefined (reading
    // 'config')"); running files serially avoids it. Each file passes in
    // isolation — this is a pool bug, not a test defect.
  },
});
