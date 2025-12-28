/**
 * npm installer implementation.
 *
 * Runs `npm ci` for CI-mode installation.
 * npm ci requires package-lock.json and fails if it's out of sync.
 */

import * as path from "node:path";
import * as fs from "node:fs/promises";
import { runCommand } from "../../process/run-command.js";
import type { InstallOptions, InstallResult, PackageManagerInfo } from "../types.js";
import { troubleshootInstall } from "../install-troubleshooter.js";

const DEFAULT_TIMEOUT_MS = 300_000; // 5 minutes
const VERSION_TIMEOUT_MS = 5_000; // 5 seconds for version check

/**
 * Install dependencies using npm.
 *
 * Uses `npm ci` which:
 * - Requires package-lock.json
 * - Deletes node_modules and reinstalls from scratch
 * - Fails if package-lock.json is out of sync with package.json
 */
export async function installWithNpm(options: InstallOptions): Promise<InstallResult> {
  const { projectRoot, timeoutMs = DEFAULT_TIMEOUT_MS, signal, env } = options;

  const lockfilePath = path.join(projectRoot, "package-lock.json");
  const lockfileExists = await fileExists(lockfilePath);

  // Build package manager info for report
  let packageManager: PackageManagerInfo = {
    manager: "npm",
    lockfile: "package-lock.json",
    lockfileExists,
    manifestPath: "package.json",
    version: undefined
  };

  // Get npm version for reporting
  try {
    const versionResult = await runCommand({
      command: "npm",
      args: ["--version"],
      cwd: projectRoot,
      timeoutMs: VERSION_TIMEOUT_MS
    });
    if (versionResult.exitCode === 0) {
      packageManager = {
        ...packageManager,
        version: versionResult.stdout.trim()
      };
    }
  } catch {
    // Ignore version detection failure - will be caught during install
  }

  const startTime = Date.now();

  try {
    const result = await runCommand({
      command: "npm",
      args: ["ci"],
      cwd: projectRoot,
      timeoutMs,
      signal,
      env: {
        ...process.env,
        ...env,
        CI: "true" // Force CI mode
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
      "npm",
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
    const trouble = troubleshootInstall("npm", null, message, "", false);

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
