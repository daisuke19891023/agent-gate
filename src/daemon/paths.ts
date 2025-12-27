import path from "node:path";
import { mkdir } from "node:fs/promises";

export interface DaemonPaths {
  dirAbsolute: string;
  socketPath: string;
  statePath: string;
  lockPath: string;
}

export function resolveDaemonPaths(repoRoot: string): DaemonPaths {
  const dirAbsolute = path.resolve(repoRoot, ".agent-gate", "daemon");
  return {
    dirAbsolute,
    socketPath: path.join(dirAbsolute, "daemon.sock"),
    statePath: path.join(dirAbsolute, "daemon.json"),
    lockPath: path.join(dirAbsolute, "daemon.lock")
  };
}

export async function ensureDaemonDir(dirAbsolute: string): Promise<void> {
  await mkdir(dirAbsolute, { recursive: true });
}
