import { readFile, writeFile, rm } from "node:fs/promises";

export interface DaemonState {
  pid: number;
  startedAt: string;
  socketPath: string;
}

export async function readDaemonState(statePath: string): Promise<DaemonState | null> {
  try {
    const raw = await readFile(statePath, "utf8");
    return JSON.parse(raw) as DaemonState;
  } catch {
    return null;
  }
}

export async function writeDaemonState(statePath: string, state: DaemonState): Promise<void> {
  await writeFile(statePath, JSON.stringify(state, null, 2) + "\n", "utf8");
}

export async function removeDaemonState(statePath: string): Promise<void> {
  await rm(statePath, { force: true });
}
