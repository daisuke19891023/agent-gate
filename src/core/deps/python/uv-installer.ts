/**
 * uv installer implementation.
 *
 * Runs `uv sync --frozen` for CI-mode installation.
 */

import * as path from "node:path";
import * as fs from "node:fs/promises";
import { runCommand } from "../../process/run-command.js";
import type { InstallOptions, InstallResult, PackageManagerInfo } from "../types.js";
import { troubleshootInstall } from "../install-troubleshooter.js";

const DEFAULT_TIMEOUT_MS = 300_000; // 5 minutes
const VERSION_TIMEOUT_MS = 5_000; // 5 seconds for version check

/**
 * Install dependencies using uv.
 *
 * Uses `uv sync --frozen` which:
 * - Syncs dependencies from uv.lock
 * - Fails if uv.lock is outdated
 */
export async function installWithUv(options: InstallOptions): Promise<InstallResult> {
  const { projectRoot, timeoutMs = DEFAULT_TIMEOUT_MS, signal, env } = options;

  const lockfilePath = path.join(projectRoot, "uv.lock");
  const lockfileExists = await fileExists(lockfilePath);

  // Build package manager info for report
  let packageManager: PackageManagerInfo = {
    manager: "uv",
    lockfile: "uv.lock",
    lockfileExists,
    manifestPath: "pyproject.toml",
    version: undefined
  };

  // Get uv version for reporting
  try {
    const versionResult = await runCommand({
      command: "uv",
      args: ["--version"],
      cwd: projectRoot,
      timeoutMs: VERSION_TIMEOUT_MS
    });
    if (versionResult.exitCode === 0) {
      // uv outputs "uv 0.x.y", extract just the version
      const match = versionResult.stdout.match(/uv\s+(\S+)/);
      packageManager = {
        ...packageManager,
        version: match ? match[1] : versionResult.stdout.trim()
      };
    }
  } catch {
    // Ignore version detection failure - will be caught during install
  }

  const startTime = Date.now();

  try {
    const result = await runCommand({
      command: "uv",
      args: ["sync", "--frozen"],
      cwd: projectRoot,
      timeoutMs,
      signal,
      env: {
        ...process.env,
        ...env
      }
    });

    const durationMs = Date.now() - startTime;

    if (result.exitCode === 0) {
      return {
        success: true,
        packageManager,
        exitCode: result.exitCode,
        durationMs,
        stdout: result.stdout,
        stderr: result.stderr
      };
    }

    // Classify the error
    const trouble = troubleshootInstall(
      "uv",
      result.exitCode,
      result.stderr,
      result.stdout,
      result.timedOut
    );

    return {
      success: false,
      packageManager,
      exitCode: result.exitCode,
      durationMs,
      stdout: result.stdout,
      stderr: result.stderr,
      error: {
        code: trouble.code,
        message: trouble.message
      }
    };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const message = error instanceof Error ? error.message : String(error);

    // Likely ENOENT (command not found)
    const trouble = troubleshootInstall("uv", null, message, "", false);

    return {
      success: false,
      packageManager,
      exitCode: null,
      durationMs,
      stdout: "",
      stderr: message,
      error: {
        code: trouble.code,
        message: trouble.message
      }
    };
  }
}

/**
 * Check if a file exists.
 */
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
