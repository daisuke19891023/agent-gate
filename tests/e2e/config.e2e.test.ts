import { describe, it, expect } from "vitest";
import path from "node:path";
import os from "node:os";
import { mkdtemp, writeFile } from "node:fs/promises";
import { runCli } from "../helpers/cli-runner.js";
import { assertErrorOutput } from "../helpers/json-assertions.js";

describe("config validation E2E", () => {
  it("should return config error for invalid config file", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "agent-gate-"));
    const configPath = path.join(tempDir, "agent-gate.config.json");

    await writeFile(configPath, JSON.stringify({ schemaVersion: 1, runtime: { invalid: true } }));

    const result = await runCli(["validate", "--config", configPath]);

    expect(result.exitCode).toBe(2);
    assertErrorOutput(result.json);
    expect((result.json as { error: { type: string } }).error.type).toBe("config");
  });
});
