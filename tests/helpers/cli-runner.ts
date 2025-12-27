import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface CliResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  json: unknown;
}

export interface CliRunOptions {
  cwd?: string;
  env?: Record<string, string>;
  timeout?: number;
}

/**
 * Spawns the CLI process and captures output.
 *
 * @param args - CLI arguments (without 'agent-gate')
 * @param options - Spawn options
 * @returns Promise resolving to CLI result
 */
export async function runCli(args: string[], options: CliRunOptions = {}): Promise<CliResult> {
  const { cwd, env, timeout = 10000 } = options;

  // Path to the built CLI entry point
  const cliPath = path.resolve(__dirname, "../../dist/index.js");

  return new Promise((resolve, reject) => {
    const child = spawn("node", [cliPath, ...args], {
      cwd,
      env: { ...process.env, ...env },
      stdio: ["pipe", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data: Buffer) => {
      stdout += data.toString();
    });

    child.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`CLI timeout after ${timeout}ms`));
    }, timeout);

    child.on("close", (code) => {
      clearTimeout(timer);

      let json: unknown = null;
      try {
        json = JSON.parse(stdout.trim());
      } catch {
        // stdout is not valid JSON
      }

      resolve({
        stdout,
        stderr,
        exitCode: code ?? 1,
        json
      });
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}
