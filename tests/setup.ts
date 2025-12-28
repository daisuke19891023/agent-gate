import { execSync } from "node:child_process";

/**
 * Global setup - runs before all tests.
 * Builds the CLI to ensure dist/index.js is available for E2E tests.
 */
export async function setup(): Promise<void> {
  console.log("Building CLI for E2E tests...");
  execSync("pnpm build", {
    cwd: process.cwd(),
    stdio: "inherit"
  });
  console.log("Build complete.");
}
