/**
 * pip installer implementation.
 *
 * Runs `pip install -r requirements.txt` with automatic venv creation.
 */

import * as path from "node:path";
import * as fs from "node:fs/promises";
import { runCommand } from "../../process/run-command.js";
import type { InstallOptions, InstallResult, PackageManagerInfo } from "../types.js";
import { troubleshootInstall } from "../install-troubleshooter.js";

const DEFAULT_TIMEOUT_MS = 300_000; // 5 minutes
const VERSION_TIMEOUT_MS = 5_000; // 5 seconds for version check
const VENV_CREATE_TIMEOUT_MS = 60_000; // 1 minute for venv creation

/**
 * Install dependencies using pip.
 *
 * - Creates .venv if it doesn't exist
 * - Runs `pip install -r requirements.txt`
 */
export async function installWithPip(options: InstallOptions): Promise<InstallResult> {
  const { projectRoot, timeoutMs = DEFAULT_TIMEOUT_MS, signal, env } = options;

  const requirementsPath = path.join(projectRoot, "requirements.txt");
  const lockfileExists = await fileExists(requirementsPath);
  const venvPath = path.join(projectRoot, ".venv");

  // Build package manager info for report
  let packageManager: PackageManagerInfo = {
    manager: "pip",
    lockfile: "requirements.txt",
    lockfileExists,
    manifestPath: "requirements.txt",
    version: undefined
  };

  const startTime = Date.now();

  try {
    // Step 1: Create venv if it doesn't exist
    const venvExists = await fileExists(venvPath);
    if (!venvExists) {
      const venvResult = await runCommand({
        command: "python3",
        args: ["-m", "venv", ".venv"],
        cwd: projectRoot,
        timeoutMs: VENV_CREATE_TIMEOUT_MS,
        signal,
        env: {
          ...process.env,
          ...env
        }
      });

      if (venvResult.exitCode !== 0) {
        const durationMs = Date.now() - startTime;
        const trouble = troubleshootInstall(
          "pip",
          venvResult.exitCode,
          venvResult.stderr,
          venvResult.stdout,
          venvResult.timedOut
        );

        return {
          success: false,
          packageManager,
          exitCode: venvResult.exitCode,
          durationMs,
          stdout: venvResult.stdout,
          stderr: venvResult.stderr,
          error: {
            code: trouble.code,
            message: `Failed to create venv: ${trouble.message}`
          }
        };
      }
    }

    // Determine pip path inside venv
    const pipPath = path.join(venvPath, "bin", "pip");

    // Get pip version for reporting
    try {
      const versionResult = await runCommand({
        command: pipPath,
        args: ["--version"],
        cwd: projectRoot,
        timeoutMs: VERSION_TIMEOUT_MS
      });
      if (versionResult.exitCode === 0) {
        // pip outputs "pip X.Y.Z from ...", extract just the version
        const match = versionResult.stdout.match(/pip\s+(\S+)/);
        packageManager = {
          ...packageManager,
          version: match ? match[1] : undefined
        };
      }
    } catch {
      // Ignore version detection failure
    }

    // Step 2: Install dependencies
    if (!lockfileExists) {
      const durationMs = Date.now() - startTime;
      return {
        success: false,
        packageManager,
        exitCode: null,
        durationMs,
        stdout: "",
        stderr: "requirements.txt not found",
        error: {
          code: "LOCKFILE_DRIFT",
          message: "requirements.txt not found. Create it with pip freeze."
        }
      };
    }

    const result = await runCommand({
      command: pipPath,
      args: ["install", "-r", "requirements.txt"],
      cwd: projectRoot,
      timeoutMs,
      signal,
      env: {
        ...process.env,
        ...env,
        VIRTUAL_ENV: venvPath
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
      "pip",
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
    const trouble = troubleshootInstall("pip", null, message, "", false);

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
