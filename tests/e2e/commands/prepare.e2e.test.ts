import { describe, it, expect, afterAll } from "vitest";
import { runCli } from "../../helpers/cli-runner.js";
import { assertPrepareOutput } from "../../helpers/json-assertions.js";

describe("prepare command E2E", () => {
  afterAll(async () => {
    await runCli(["daemon", "stop"]);
  });

  it("should return PrepareOutput structure", async () => {
    const result = await runCli(["prepare"]);
    expect(result.exitCode).toBe(0);
    assertPrepareOutput(result.json);
  });

  it("should include deps step", async () => {
    const result = await runCli(["prepare"]);
    const output = result.json as { steps: Array<{ name: string }> };
    expect(output.steps.some((s) => s.name === "deps")).toBe(true);
  });

  it("should include nextActions array", async () => {
    const result = await runCli(["prepare"]);
    const output = result.json as { nextActions: unknown[] };
    expect(Array.isArray(output.nextActions)).toBe(true);
  });

  it("should use specified --repo path", async () => {
    const result = await runCli(["prepare", "--repo", "/tmp"]);
    const output = result.json as { repo: { root: string } };
    expect(output.repo.root).toBe("/tmp");
  });

  it("should include artifacts with logDir and reportPath", async () => {
    const result = await runCli(["prepare"]);
    const output = result.json as {
      artifacts: { logDir: string; reportPath: string };
    };
    expect(output.artifacts.logDir).toBeDefined();
    expect(output.artifacts.reportPath).toBeDefined();
  });
});
