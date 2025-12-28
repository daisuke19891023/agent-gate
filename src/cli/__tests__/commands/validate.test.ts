import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { validateCommand } from "../../commands/validate.js";
import { ExitCode } from "../../exit-codes.js";
import { version } from "../../version.js";

vi.mock("../../../daemon/manager.js", () => ({
  ensureDaemonRunning: vi.fn().mockResolvedValue({ status: "running" })
}));

describe("validateCommand", () => {
  const originalCwd = process.cwd;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "agent-gate-validate-"));
    process.cwd = vi.fn().mockReturnValue(tempDir);
  });

  afterEach(async () => {
    process.cwd = originalCwd;
    await rm(tempDir, { recursive: true, force: true });
  });

  describe("command metadata", () => {
    it('should have command name "validate"', () => {
      expect(validateCommand.command).toBe("validate");
    });

    it("should have description", () => {
      expect(validateCommand.describe).toBeDefined();
      expect(typeof validateCommand.describe).toBe("string");
    });
  });

  describe("handler", () => {
    const baseArgs = {
      scope: "changed" as const,
      pretty: false,
      "log-level": "info" as const
    };

    it("should return Success exit code (0)", async () => {
      const result = await validateCommand.handler(baseArgs);

      expect(result.exitCode).toBe(ExitCode.Success);
    });

    it("should return ValidateOutput structure", async () => {
      const result = await validateCommand.handler(baseArgs);

      expect(result.output).toMatchObject({
        tool: "agent-gate",
        command: "validate",
        repo: expect.any(Object),
        scope: expect.any(Object),
        environment: expect.any(Object),
        steps: expect.any(Array),
        diagnostics: expect.any(Array),
        warnings: expect.any(Array),
        nextActions: expect.any(Array),
        summary: expect.any(Object),
        artifacts: expect.any(Object)
      });
    });

    it("should use --repo option as repo root when provided", async () => {
      const customRepo = path.join(tempDir, "custom-path");
      const result = await validateCommand.handler({
        ...baseArgs,
        repo: customRepo
      });

      expect((result.output as { repo: { root: string } }).repo.root).toBe(customRepo);
    });

    it("should use process.cwd() when --repo not provided", async () => {
      const result = await validateCommand.handler(baseArgs);

      expect((result.output as { repo: { root: string } }).repo.root).toBe(tempDir);
    });

    it("should include scope information with mode from --scope", async () => {
      const changedResult = await validateCommand.handler({
        ...baseArgs,
        scope: "changed"
      });
      expect((changedResult.output as { scope: { mode: string } }).scope.mode).toBe("changed");

      const allResult = await validateCommand.handler({
        ...baseArgs,
        scope: "all"
      });
      expect((allResult.output as { scope: { mode: string } }).scope.mode).toBe("all");
    });

    it("should include environment with runtime info", async () => {
      const result = await validateCommand.handler(baseArgs);

      expect(result.output).toMatchObject({
        environment: {
          runtime: expect.any(Object),
          fingerprints: expect.any(Object)
        }
      });
    });

    it("should include steps array (deps, typecheck, lspDiagnostics)", async () => {
      const result = await validateCommand.handler(baseArgs);

      const output = result.output as { steps: Array<{ name: string }> };
      const stepNames = output.steps.map((s) => s.name);
      expect(stepNames).toContain("deps");
      expect(stepNames).toContain("typecheck");
      expect(stepNames).toContain("lspDiagnostics");
    });

    it("should include diagnostics array", async () => {
      const result = await validateCommand.handler(baseArgs);

      const output = result.output as { diagnostics: unknown[] };
      expect(Array.isArray(output.diagnostics)).toBe(true);
    });

    it("should include summary with ok, errors, warnings, durationMs", async () => {
      const result = await validateCommand.handler(baseArgs);

      expect(result.output).toMatchObject({
        summary: {
          ok: expect.any(Boolean),
          errors: expect.any(Number),
          warnings: expect.any(Number),
          durationMs: expect.any(Number)
        }
      });
    });

    it("should include tool metadata", async () => {
      const result = await validateCommand.handler(baseArgs);

      expect(result.output).toMatchObject({
        tool: "agent-gate",
        toolVersion: version,
        schemaVersion: 1
      });
    });

    it("should include artifacts paths", async () => {
      const result = await validateCommand.handler(baseArgs);

      expect(result.output).toMatchObject({
        artifacts: {
          logDir: expect.any(String),
          reportPath: expect.any(String)
        }
      });
    });

    it("should respect --pretty flag in result", async () => {
      const result = await validateCommand.handler({ ...baseArgs, pretty: true });

      expect(result.pretty).toBe(true);
    });

    it("should return NETWORK_BLOCKED when deps are missing under deny-all", async () => {
      await writeFile(
        path.join(tempDir, "agent-gate.config.json"),
        JSON.stringify({
          schemaVersion: 1,
          runtime: { network: { validate: "deny-all" } }
        })
      );
      await writeFile(path.join(tempDir, "package.json"), JSON.stringify({ name: "demo" }));

      const result = await validateCommand.handler({
        ...baseArgs,
        repo: tempDir
      });

      expect(result.exitCode).toBe(ExitCode.ValidationFailed);
      expect(result.output).toMatchObject({
        diagnostics: [expect.objectContaining({ code: "NETWORK_BLOCKED" })],
        nextActions: [expect.objectContaining({ commands: ["agent-gate prepare"] })]
      });
    });
  });
});
