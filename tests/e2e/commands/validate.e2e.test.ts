import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";
import { runCli } from "../../helpers/cli-runner.js";
import { assertValidateOutput } from "../../helpers/json-assertions.js";

describe("validate command E2E", () => {
  let fixtureDir: string;

  beforeAll(async () => {
    // Create a minimal git repo fixture for testing
    fixtureDir = await mkdtemp(path.join(os.tmpdir(), "agent-gate-validate-e2e-"));

    // Initialize git repo
    execSync("git init", { cwd: fixtureDir, stdio: "pipe" });
    execSync('git config user.email "test@test.com"', { cwd: fixtureDir, stdio: "pipe" });
    execSync('git config user.name "Test"', { cwd: fixtureDir, stdio: "pipe" });

    // Create a minimal Node project
    await writeFile(
      path.join(fixtureDir, "package.json"),
      JSON.stringify({ name: "test-project", scripts: {} })
    );

    // Create initial commit
    execSync("git add -A && git commit -m 'initial'", { cwd: fixtureDir, stdio: "pipe" });
  });

  afterAll(async () => {
    await runCli(["daemon", "stop"]);
    if (fixtureDir) {
      await rm(fixtureDir, { recursive: true, force: true });
    }
  });

  it("should return ValidateOutput structure", async () => {
    const result = await runCli(["validate", "--repo", fixtureDir]);
    // Exit code can be 0 (success) or 1 (validation failed, e.g., deps missing)
    expect([0, 1]).toContain(result.exitCode);
    assertValidateOutput(result.json);
  });

  it("should include scope.mode matching --scope option (changed)", async () => {
    const result = await runCli(["validate", "--scope", "changed", "--repo", fixtureDir]);
    expect((result.json as { scope: { mode: string } }).scope.mode).toBe("changed");
  });

  it("should include scope.mode matching --scope option (all)", async () => {
    const result = await runCli(["validate", "--scope", "all", "--repo", fixtureDir]);
    expect((result.json as { scope: { mode: string } }).scope.mode).toBe("all");
  });

  it("should default scope to changed", async () => {
    const result = await runCli(["validate", "--repo", fixtureDir]);
    expect((result.json as { scope: { mode: string } }).scope.mode).toBe("changed");
  });

  it("should include required steps (deps, typecheck, lspDiagnostics)", async () => {
    const result = await runCli(["validate", "--repo", fixtureDir]);
    const output = result.json as { steps: Array<{ name: string }> };
    const stepNames = output.steps.map((s) => s.name);
    expect(stepNames).toContain("deps");
    expect(stepNames).toContain("typecheck");
    expect(stepNames).toContain("lspDiagnostics");
  });

  it("should include summary with ok flag", async () => {
    const result = await runCli(["validate", "--repo", fixtureDir]);
    const output = result.json as { summary: { ok: boolean } };
    expect(typeof output.summary.ok).toBe("boolean");
  });

  it("should include summary with errors count", async () => {
    const result = await runCli(["validate", "--repo", fixtureDir]);
    const output = result.json as { summary: { errors: number } };
    expect(typeof output.summary.errors).toBe("number");
  });

  it("should include summary with warnings count", async () => {
    const result = await runCli(["validate", "--repo", fixtureDir]);
    const output = result.json as { summary: { warnings: number } };
    expect(typeof output.summary.warnings).toBe("number");
  });

  it("should include summary with durationMs", async () => {
    const result = await runCli(["validate", "--repo", fixtureDir]);
    const output = result.json as { summary: { durationMs: number } };
    expect(typeof output.summary.durationMs).toBe("number");
  });

  it("should include diagnostics array", async () => {
    const result = await runCli(["validate", "--repo", fixtureDir]);
    const output = result.json as { diagnostics: unknown[] };
    expect(Array.isArray(output.diagnostics)).toBe(true);
  });

  it("should use specified --repo path", async () => {
    const result = await runCli(["validate", "--repo", "/tmp"]);
    const output = result.json as { repo: { root: string } };
    expect(output.repo.root).toBe("/tmp");
  });

  it("should write report and log files with env log dir override", async () => {
    const repoRoot = await mkdtemp(path.join(os.tmpdir(), "agent-gate-e2e-"));
    const customLogDir = path.join(repoRoot, "custom-logs");

    try {
      const result = await runCli(["validate", "--repo", repoRoot], {
        env: {
          AGENT_GATE_LOG_DIR: customLogDir
        }
      });

      const output = result.json as {
        artifacts: { logDir: string; reportPath: string };
      };

      expect(output.artifacts.logDir).toBe("custom-logs");

      const reportPath = path.resolve(repoRoot, output.artifacts.reportPath);
      await stat(reportPath);

      const logEntries = await readdir(customLogDir);
      expect(logEntries.length).toBeGreaterThan(0);

      const validateLog = logEntries.find((entry) => entry.startsWith("validate-"));
      expect(validateLog).toBeDefined();

      const logContents = await readFile(
        path.join(customLogDir, validateLog ?? logEntries[0]),
        "utf8"
      );
      const firstLine = logContents.trim().split("\n")[0];
      const payload = JSON.parse(firstLine) as Record<string, unknown>;

      expect(payload).toMatchObject({
        repoId: expect.any(String),
        command: "validate"
      });
      expect(typeof payload.sessionId).toBe("string");
      expect(typeof payload.step).toBe("string");
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
    }
  });

  it("should return NETWORK_BLOCKED when deps are missing under deny-all", async () => {
    const repoRoot = await mkdtemp(path.join(os.tmpdir(), "agent-gate-e2e-"));

    try {
      await writeFile(
        path.join(repoRoot, "agent-gate.config.json"),
        JSON.stringify({
          schemaVersion: 1,
          runtime: { network: { validate: "deny-all" } }
        })
      );
      await writeFile(path.join(repoRoot, "package.json"), JSON.stringify({ name: "demo" }));

      const result = await runCli(["validate", "--repo", repoRoot]);

      expect(result.exitCode).toBe(1);
      expect(result.json).toMatchObject({
        diagnostics: [expect.objectContaining({ code: "NETWORK_BLOCKED" })],
        nextActions: [expect.objectContaining({ commands: ["agent-gate prepare"] })]
      });
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
    }
  });
});
