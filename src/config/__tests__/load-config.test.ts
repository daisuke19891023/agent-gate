import { describe, it, expect } from "vitest";
import path from "node:path";
import os from "node:os";
import { mkdtemp, writeFile } from "node:fs/promises";
import { loadConfig, ConfigError } from "../load-config.js";

describe("loadConfig", () => {
  it("loads explicit JSON config files", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "agent-gate-"));
    const configPath = path.join(tempDir, "agent-gate.config.json");

    await writeFile(
      configPath,
      JSON.stringify({ schemaVersion: 1, scope: { defaultMode: "changed" } })
    );

    const result = await loadConfig({
      configPath,
      repoRoot: tempDir,
      env: {}
    });

    expect(result.source).toBe("explicit");
    expect(result.path).toBe(configPath);
    expect(result.config.schemaVersion).toBe(1);
  });

  it("falls back to defaults when no config is present", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "agent-gate-"));

    const result = await loadConfig({
      repoRoot: tempDir,
      env: {}
    });

    expect(result.source).toBe("default");
    expect(result.config.schemaVersion).toBe(1);
  });

  it("throws ConfigError for invalid schema", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "agent-gate-"));
    const configPath = path.join(tempDir, "agent-gate.config.json");

    await writeFile(configPath, JSON.stringify({ schemaVersion: 2 }));

    await expect(
      loadConfig({
        configPath,
        repoRoot: tempDir,
        env: {}
      })
    ).rejects.toBeInstanceOf(ConfigError);
  });
});
