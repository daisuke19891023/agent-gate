import { describe, it, expect } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { resolveArtifacts, resolveLogLevel, writeReportFile } from "../artifacts.js";
import { configSchema } from "../../config/schema.js";

describe("artifacts helpers", () => {
  it("resolves default logDir and reportPath under .agent-gate", async () => {
    const repoRoot = await mkdtemp(path.join(os.tmpdir(), "agent-gate-artifacts-"));
    try {
      const config = configSchema.parse({ schemaVersion: 1 });
      const artifacts = resolveArtifacts(repoRoot, "analyze", config, undefined);

      expect(artifacts.logDir).toBe(".agent-gate/logs");
      expect(artifacts.reportPath).toBe(".agent-gate/reports/analyze.json");
      expect(artifacts.reportPathAbsolute).toBe(path.resolve(repoRoot, artifacts.reportPath));
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
    }
  });

  it("resolves logDir from env override", async () => {
    const repoRoot = await mkdtemp(path.join(os.tmpdir(), "agent-gate-artifacts-"));
    try {
      const config = configSchema.parse({ schemaVersion: 1 });
      const customLogDir = path.join(repoRoot, "custom-logs");
      const artifacts = resolveArtifacts(repoRoot, "prepare", config, {
        AGENT_GATE_LOG_DIR: customLogDir
      });

      expect(artifacts.logDir).toBe("custom-logs");
      expect(artifacts.logDirAbsolute).toBe(customLogDir);
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
    }
  });

  it("prefers env log level when valid", () => {
    const level = resolveLogLevel("info", { AGENT_GATE_LOG_LEVEL: "debug" });

    expect(level).toBe("debug");
  });

  it("writes report JSON file to disk", async () => {
    const repoRoot = await mkdtemp(path.join(os.tmpdir(), "agent-gate-artifacts-"));
    try {
      const reportPath = path.join(repoRoot, "report.json");
      const output = { ok: true, value: 42 };

      await writeReportFile(output, reportPath, true);

      const contents = await readFile(reportPath, "utf8");
      expect(JSON.parse(contents)).toEqual(output);
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
    }
  });
});
