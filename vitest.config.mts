import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/unit/**/*.test.ts", "tests/db/**/*.test.ts"],
    globalSetup: ["tests/global-setup.ts"],
    setupFiles: ["tests/setup.ts"],
    // DB tests share one database; run files one at a time.
    fileParallelism: false,
    testTimeout: 20_000,
  },
  resolve: {
    tsconfigPaths: true,
    alias: { "server-only": new URL("./tests/empty.ts", import.meta.url).pathname },
  },
});
