import { describe, it, expect } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { readDaemonState, writeDaemonState, removeDaemonState } from "../state.js";

describe("daemon state", () => {
  it("should write and read state", async () => {
    const repoRoot = await mkdtemp(path.join(os.tmpdir(), "agent-gate-"));
    const statePath = path.join(repoRoot, "daemon.json");

    try {
      await writeDaemonState(statePath, {
        pid: 1234,
        startedAt: "2024-01-01T00:00:00.000Z",
        socketPath: "/tmp/daemon.sock"
      });

      const state = await readDaemonState(statePath);
      expect(state).toMatchObject({
        pid: 1234,
        startedAt: "2024-01-01T00:00:00.000Z",
        socketPath: "/tmp/daemon.sock"
      });
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
    }
  });

  it("should return null for missing state", async () => {
    const repoRoot = await mkdtemp(path.join(os.tmpdir(), "agent-gate-"));
    const statePath = path.join(repoRoot, "missing.json");

    try {
      const state = await readDaemonState(statePath);
      expect(state).toBeNull();
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
    }
  });

  it("should remove state file", async () => {
    const repoRoot = await mkdtemp(path.join(os.tmpdir(), "agent-gate-"));
    const statePath = path.join(repoRoot, "daemon.json");

    try {
      await writeDaemonState(statePath, {
        pid: 1,
        startedAt: new Date().toISOString(),
        socketPath: "/tmp/daemon.sock"
      });
      await removeDaemonState(statePath);
      const state = await readDaemonState(statePath);
      expect(state).toBeNull();
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
    }
  });
});
