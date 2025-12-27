import { spawn } from "node:child_process";

export interface RunCommandOptions {
  command: string;
  args?: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  signal?: AbortSignal;
  maxOutputBytes?: number;
}

export interface RunCommandResult {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  aborted: boolean;
  truncated: boolean;
}

export async function runCommand(options: RunCommandOptions): Promise<RunCommandResult> {
  const {
    command,
    args = [],
    cwd,
    env,
    timeoutMs = 60_000,
    signal,
    maxOutputBytes = 1024 * 1024
  } = options;

  let stdout = "";
  let stderr = "";
  let truncated = false;

  const child = spawn(command, args, {
    cwd,
    env,
    stdio: ["ignore", "pipe", "pipe"],
    detached: true
  });

  const appendOutput = (chunk: Buffer, current: string): { value: string; truncated: boolean } => {
    if (truncated) {
      return { value: current, truncated: true };
    }
    const remaining = maxOutputBytes - Buffer.byteLength(current, "utf8");
    if (remaining <= 0) {
      return { value: current, truncated: true };
    }
    const slice = chunk.length > remaining ? chunk.subarray(0, remaining) : chunk;
    return {
      value: current + slice.toString(),
      truncated: chunk.length > remaining
    };
  };

  child.stdout?.on("data", (chunk: Buffer) => {
    const result = appendOutput(chunk, stdout);
    stdout = result.value;
    truncated = truncated || result.truncated;
  });

  child.stderr?.on("data", (chunk: Buffer) => {
    const result = appendOutput(chunk, stderr);
    stderr = result.value;
    truncated = truncated || result.truncated;
  });

  let timedOut = false;
  let aborted = false;

  const killProcessTree = (reason: "timeout" | "abort"): void => {
    if (child.pid) {
      try {
        process.kill(-child.pid, "SIGTERM");
      } catch {
        // ignore
      }
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch {
        // ignore
      }
    }
    if (reason === "timeout") {
      timedOut = true;
    } else {
      aborted = true;
    }
  };

  const timeoutId =
    timeoutMs > 0
      ? setTimeout(() => {
          killProcessTree("timeout");
        }, timeoutMs)
      : null;

  const abortListener = (): void => {
    killProcessTree("abort");
  };

  if (signal) {
    if (signal.aborted) {
      abortListener();
    } else {
      signal.addEventListener("abort", abortListener, { once: true });
    }
  }

  return new Promise((resolve, reject) => {
    child.on("error", (error) => {
      if (timeoutId) clearTimeout(timeoutId);
      if (signal) {
        signal.removeEventListener("abort", abortListener);
      }
      reject(error);
    });

    child.on("close", (code, closeSignal) => {
      if (timeoutId) clearTimeout(timeoutId);
      if (signal) {
        signal.removeEventListener("abort", abortListener);
      }
      resolve({
        exitCode: code,
        signal: closeSignal,
        stdout,
        stderr,
        timedOut,
        aborted,
        truncated
      });
    });
  });
}
