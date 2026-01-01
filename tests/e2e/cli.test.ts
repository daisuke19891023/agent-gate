import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";
import { runCli } from "../helpers/cli-runner.js";
import { assertBaseOutput, assertErrorOutput } from "../helpers/json-assertions.js";

describe("CLI E2E Tests", () => {
  let fixtureDir: string;

  beforeAll(async () => {
    // Create a minimal git repo fixture for validate tests
    fixtureDir = await mkdtemp(path.join(os.tmpdir(), "agent-gate-cli-e2e-"));
    execSync("git init", { cwd: fixtureDir, stdio: "pipe" });
    execSync('git config user.email "test@test.com"', { cwd: fixtureDir, stdio: "pipe" });
    execSync('git config user.name "Test"', { cwd: fixtureDir, stdio: "pipe" });
    await writeFile(
      path.join(fixtureDir, "package.json"),
      JSON.stringify({ name: "test-project", scripts: {} })
    );
    execSync("git add -A && git commit -m 'initial'", { cwd: fixtureDir, stdio: "pipe" });
  });

  afterAll(async () => {
    if (fixtureDir) {
      await rm(fixtureDir, { recursive: true, force: true });
    }
  });

  describe("Exit Codes", () => {
    it("should exit with 0 on successful command", async () => {
      const result = await runCli(["analyze", "--repo", fixtureDir]);
      expect(result.exitCode).toBe(0);
    });

    it("should exit with 2 when no command specified", async () => {
      const result = await runCli([]);
      expect(result.exitCode).toBe(2);
    });

    it("should exit with 2 for unknown command", async () => {
      const result = await runCli(["unknown-command"]);
      expect(result.exitCode).toBe(2);
    });

    it("should exit with 2 for invalid options", async () => {
      const result = await runCli(["analyze", "--invalid-option"]);
      expect(result.exitCode).toBe(2);
    });
  });

  describe("JSON Output Contract", () => {
    it("should always output valid JSON to stdout", async () => {
      const result = await runCli(["analyze", "--repo", fixtureDir]);
      expect(result.json).not.toBeNull();
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    });

    it("should output JSON even on errors", async () => {
      const result = await runCli(["--invalid"]);
      expect(result.json).not.toBeNull();
      assertErrorOutput(result.json);
    });

    it("should output compact JSON by default", async () => {
      const result = await runCli(["analyze", "--repo", fixtureDir]);
      // Compact JSON should be a single line (except for trailing newline)
      const lines = result.stdout.trim().split("\n");
      expect(lines.length).toBe(1);
    });

    it("should output pretty JSON with --pretty flag", async () => {
      const result = await runCli(["analyze", "--repo", fixtureDir, "--pretty"]);
      // Pretty JSON should have multiple lines
      const lines = result.stdout.trim().split("\n");
      expect(lines.length).toBeGreaterThan(1);
    });

    it("should include base fields in all outputs", async () => {
      const result = await runCli(["analyze", "--repo", fixtureDir]);
      assertBaseOutput(result.json);
    });
  });

  describe("Global Options", () => {
    it("should accept --repo option", async () => {
      const result = await runCli(["analyze", "--repo", "/tmp"]);
      expect(result.exitCode).toBe(0);
      expect((result.json as { repo: { root: string } }).repo.root).toBe("/tmp");
    });

    it("should accept --scope changed", async () => {
      const result = await runCli(["validate", "--scope", "changed", "--repo", fixtureDir]);
      // Exit code can be 0 or 1 (validation result), but not 2 (usage error)
      expect([0, 1]).toContain(result.exitCode);
      expect(result.json).not.toBeNull();
    });

    it("should accept --scope all", async () => {
      const result = await runCli(["validate", "--scope", "all", "--repo", fixtureDir]);
      // Exit code can be 0 or 1 (validation result), but not 2 (usage error)
      expect([0, 1]).toContain(result.exitCode);
      expect(result.json).not.toBeNull();
    });

    it("should reject invalid --scope value", async () => {
      const result = await runCli(["validate", "--scope", "invalid", "--repo", fixtureDir]);
      expect(result.exitCode).toBe(2);
    });

    it("should accept --log-level error", async () => {
      const result = await runCli(["analyze", "--log-level", "error", "--repo", fixtureDir]);
      expect(result.exitCode).toBe(0);
    });

    it("should accept --log-level warn", async () => {
      const result = await runCli(["analyze", "--log-level", "warn", "--repo", fixtureDir]);
      expect(result.exitCode).toBe(0);
    });

    it("should accept --log-level info", async () => {
      const result = await runCli(["analyze", "--log-level", "info", "--repo", fixtureDir]);
      expect(result.exitCode).toBe(0);
    });

    it("should accept --log-level debug", async () => {
      const result = await runCli(["analyze", "--log-level", "debug", "--repo", fixtureDir]);
      expect(result.exitCode).toBe(0);
    });

    it("should reject invalid --log-level value", async () => {
      const result = await runCli(["analyze", "--log-level", "invalid", "--repo", fixtureDir]);
      expect(result.exitCode).toBe(2);
    });
  });

  describe("Error Output Structure", () => {
    it("should include tool name in error output", async () => {
      const result = await runCli([]);
      expect((result.json as { tool: string }).tool).toBe("agent-gate");
    });

    it("should include error type in error output", async () => {
      const result = await runCli([]);
      expect((result.json as { error: { type: string } }).error.type).toBe("usage");
    });

    it("should include error message in error output", async () => {
      const result = await runCli([]);
      expect((result.json as { error: { message: string } }).error.message).toBeDefined();
    });
  });
});
