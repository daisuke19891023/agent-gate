import { spawn } from "node:child_process";
import { rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { LogLevel } from "../core/log-level.js";
import { tryGetDaemonStatus, sendDaemonRequest } from "./client.js";
import { ensureDaemonDir, resolveDaemonPaths } from "./paths.js";
import { readDaemonState } from "./state.js";

export interface DaemonStatus {
  status: "running" | "stopped" | "not_found";
  pid?: number;
  startedAt?: string;
}

export interface EnsureDaemonOptions {
  repoRoot: string;
  logDirAbsolute: string;
  logLevel: LogLevel;
}

export async function ensureDaemonRunning(options: EnsureDaemonOptions): Promise<DaemonStatus> {
  const paths = resolveDaemonPaths(options.repoRoot);
  await ensureDaemonDir(paths.dirAbsolute);

  const status = await tryGetDaemonStatus({ socketPath: paths.socketPath });
  if (status?.status === "running") {
    return {
      status: "running",
      pid: status.pid,
      startedAt: status.startedAt
    };
  }

  const lockState = await readDaemonState(paths.lockPath);
  if (lockState?.pid && isProcessAlive(lockState.pid)) {
    const ready = await waitForDaemonReady(paths.socketPath);
    if (ready?.status === "running") {
      return {
        status: "running",
        pid: ready.pid,
        startedAt: ready.startedAt
      };
    }
  }

  await cleanupStaleArtifacts(paths.socketPath, paths.statePath, paths.lockPath);
  await startDaemonProcess(options, paths);

  const ready = await waitForDaemonReady(paths.socketPath);
  if (ready?.status === "running") {
    return {
      status: "running",
      pid: ready.pid,
      startedAt: ready.startedAt
    };
  }

  return { status: "not_found" };
}

export async function getDaemonStatus(repoRoot: string): Promise<DaemonStatus> {
  const paths = resolveDaemonPaths(repoRoot);
  const status = await tryGetDaemonStatus({ socketPath: paths.socketPath });
  if (status) {
    return {
      status: status.status,
      pid: status.pid,
      startedAt: status.startedAt
    };
  }

  const state = await readDaemonState(paths.statePath);
  if (state) {
    return { status: "stopped", pid: state.pid, startedAt: state.startedAt };
  }

  return { status: "not_found" };
}

export async function stopDaemon(repoRoot: string): Promise<DaemonStatus> {
  const paths = resolveDaemonPaths(repoRoot);
  const status = await tryGetDaemonStatus({ socketPath: paths.socketPath });
  if (!status) {
    return { status: "not_found" };
  }
  try {
    const response = await sendDaemonRequest({ type: "stop" }, { socketPath: paths.socketPath });
    return {
      status: response.status,
      pid: response.pid,
      startedAt: response.startedAt
    };
  } catch {
    return { status: "not_found" };
  }
}

async function cleanupStaleArtifacts(
  socketPath: string,
  statePath: string,
  lockPath: string
): Promise<void> {
  await rm(socketPath, { force: true }).catch(() => undefined);
  await rm(statePath, { force: true }).catch(() => undefined);
  await rm(lockPath, { force: true }).catch(() => undefined);
}

async function startDaemonProcess(
  options: EnsureDaemonOptions,
  paths: ReturnType<typeof resolveDaemonPaths>
): Promise<void> {
  const entrypoint = resolveDaemonEntrypoint();
  const child = spawn(
    process.execPath,
    [
      entrypoint,
      "--repo",
      options.repoRoot,
      "--socket",
      paths.socketPath,
      "--state",
      paths.statePath,
      "--lock",
      paths.lockPath,
      "--log-dir",
      options.logDirAbsolute,
      "--log-level",
      options.logLevel
    ],
    {
      stdio: "ignore",
      detached: true
    }
  );
  child.unref();
}

async function waitForDaemonReady(
  socketPath: string,
  timeoutMs = 2000
): Promise<DaemonStatus | null> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const status = await tryGetDaemonStatus({ socketPath, timeoutMs: 250 });
    if (status?.status === "running") {
      return {
        status: "running",
        pid: status.pid,
        startedAt: status.startedAt
      };
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return null;
}

function resolveDaemonEntrypoint(): string {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  return path.join(currentDir, "entrypoint.js");
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
