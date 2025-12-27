import { describe, it, expect } from "vitest";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { sendDaemonRequest, tryGetDaemonStatus } from "../client.js";

describe("daemon entrypoint", () => {
  it("should exit with error when required args are missing", async () => {
    const entrypoint = path.resolve(process.cwd(), "dist/daemon/entrypoint.js");
    const result = await runNode([entrypoint]);
    expect(result.exitCode).toBe(1);
  });

  it("should start and stop via IPC", async () => {
    const repoRoot = await mkdtemp(path.join(os.tmpdir(), "agent-gate-"));
    const socketPath = path.join(repoRoot, "daemon.sock");
    const statePath = path.join(repoRoot, "daemon.json");
    const lockPath = path.join(repoRoot, "daemon.lock");
    const logDir = path.join(repoRoot, "logs");
    const entrypoint = path.resolve(process.cwd(), "dist/daemon/entrypoint.js");

    const child = spawn(process.execPath, [
      entrypoint,
      "--repo",
      repoRoot,
      "--socket",
      socketPath,
      "--state",
      statePath,
      "--lock",
      lockPath,
      "--log-dir",
      logDir,
      "--log-level",
      "info"
    ]);

    try {
      const ready = await waitForSocket(socketPath);
      expect(ready).toBe(true);

      const status = await tryGetDaemonStatus({ socketPath });
      expect(status?.status).toBe("running");

      await sendDaemonRequest({ type: "stop" }, { socketPath });
      const exitCode = await waitForExit(child);
      expect(exitCode).toBe(0);
    } finally {
      child.kill();
      await rm(repoRoot, { recursive: true, force: true });
    }
  });
});

async function runNode(args: string[]): Promise<{ exitCode: number | null }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, { stdio: "ignore" });
    child.on("exit", (code) => resolve({ exitCode: code }));
  });
}

async function waitForSocket(socketPath: string): Promise<boolean> {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const status = await tryGetDaemonStatus({ socketPath });
    if (status?.status === "running") {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return false;
}

async function waitForExit(child: ReturnType<typeof spawn>): Promise<number | null> {
  return new Promise((resolve) => {
    child.on("exit", (code) => resolve(code));
  });
}
