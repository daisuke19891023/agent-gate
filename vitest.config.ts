import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    passWithNoTests: true,

    // Include patterns for test files
    include: [
      "src/**/__tests__/**/*.test.ts", // Unit tests
      "tests/**/*.test.ts", // E2E tests
    ],

    // Exclude patterns
    exclude: ["node_modules", "dist"],

    // Timeout for E2E tests (they spawn processes)
    testTimeout: 30000,

    // Hooks timeout for beforeAll (build step)
    hookTimeout: 60000,

    // Global setup - build before E2E tests
    globalSetup: "./tests/setup.ts",

    coverage: {
      provider: "v8",
      reporter: ["text", "json", "lcov"],
      reportsDirectory: "./coverage",
    },
  },
});
