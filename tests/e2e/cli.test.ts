import { describe, it, expect } from "vitest";
import { runCli } from "../helpers/cli-runner.js";
import { assertBaseOutput, assertErrorOutput } from "../helpers/json-assertions.js";

describe("CLI E2E Tests", () => {
  describe("Exit Codes", () => {
    it("should exit with 0 on successful command", async () => {
      const result = await runCli(["analyze"]);
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
      const result = await runCli(["analyze"]);
      expect(result.json).not.toBeNull();
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    });

    it("should output JSON even on errors", async () => {
      const result = await runCli(["--invalid"]);
      expect(result.json).not.toBeNull();
      assertErrorOutput(result.json);
    });

    it("should output compact JSON by default", async () => {
      const result = await runCli(["analyze"]);
      // Compact JSON should be a single line (except for trailing newline)
      const lines = result.stdout.trim().split("\n");
      expect(lines.length).toBe(1);
    });

    it("should output pretty JSON with --pretty flag", async () => {
      const result = await runCli(["analyze", "--pretty"]);
      // Pretty JSON should have multiple lines
      const lines = result.stdout.trim().split("\n");
      expect(lines.length).toBeGreaterThan(1);
    });

    it("should include base fields in all outputs", async () => {
      const result = await runCli(["analyze"]);
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
      const result = await runCli(["validate", "--scope", "changed"]);
      expect(result.exitCode).toBe(0);
    });

    it("should accept --scope all", async () => {
      const result = await runCli(["validate", "--scope", "all"]);
      expect(result.exitCode).toBe(0);
    });

    it("should reject invalid --scope value", async () => {
      const result = await runCli(["validate", "--scope", "invalid"]);
      expect(result.exitCode).toBe(2);
    });

    it("should accept --log-level error", async () => {
      const result = await runCli(["analyze", "--log-level", "error"]);
      expect(result.exitCode).toBe(0);
    });

    it("should accept --log-level warn", async () => {
      const result = await runCli(["analyze", "--log-level", "warn"]);
      expect(result.exitCode).toBe(0);
    });

    it("should accept --log-level info", async () => {
      const result = await runCli(["analyze", "--log-level", "info"]);
      expect(result.exitCode).toBe(0);
    });

    it("should accept --log-level debug", async () => {
      const result = await runCli(["analyze", "--log-level", "debug"]);
      expect(result.exitCode).toBe(0);
    });

    it("should reject invalid --log-level value", async () => {
      const result = await runCli(["analyze", "--log-level", "invalid"]);
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
