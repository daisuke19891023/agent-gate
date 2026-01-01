/**
 * TSC fallback runner.
 *
 * Runs tsc --noEmit as a fallback when no typecheck script exists.
 */

import type { TypecheckOptions, ProjectTypecheckResult, TypecheckDiagnostic } from "../types.js";
import { runCommand } from "../../process/run-command.js";
import { parseTscOutput } from "./tsc-parser.js";
import { buildTscFallbackCommand } from "./script-detector.js";
import { troubleshootTypecheck } from "../troubleshooter.js";
import type { NodePackageManager } from "../types.js";

/**
 * Default timeout for tsc (2 minutes).
 */
const DEFAULT_TSC_TIMEOUT_MS = 120_000;

/**
 * Run tsc --noEmit as fallback typecheck.
 *
 * @param options - Typecheck options
 * @param packageManager - Package manager for npx equivalent
 * @param customCommand - Optional custom fallback command
 * @returns Project typecheck result
 */
export async function runTscFallback(
  options: TypecheckOptions,
  packageManager: NodePackageManager,
  customCommand?: string
): Promise<ProjectTypecheckResult> {
  const { projectRoot, repoRoot, timeoutMs = DEFAULT_TSC_TIMEOUT_MS, signal, env } = options;

  const startTime = Date.now();
  const commandParts = buildTscFallbackCommand(packageManager, customCommand);
  const [command, ...args] = commandParts;

  if (!command) {
    return {
      projectId: "",
      kind: "node",
      root: projectRoot,
      success: false,
      durationMs: 0,
      usedFallback: true,
      diagnostics: [],
      error: {
        code: "TSC_NOT_FOUND",
        message: "Failed to build tsc command."
      }
    };
  }

  try {
    const result = await runCommand({
      command,
      args,
      cwd: projectRoot,
      env: env ?? process.env,
      timeoutMs,
      signal
    });

    const durationMs = Date.now() - startTime;
    const combinedOutput = `${result.stdout}\n${result.stderr}`;

    // Parse diagnostics from output
    let diagnostics: readonly TypecheckDiagnostic[] = [];
    try {
      diagnostics = parseTscOutput(combinedOutput, projectRoot, repoRoot);
    } catch {
      // Parsing failed, continue without diagnostics
    }

    // Success if exit code is 0
    if (result.exitCode === 0 && !result.timedOut && !result.aborted) {
      return {
        projectId: "",
        kind: "node",
        root: projectRoot,
        success: true,
        durationMs,
        usedFallback: true,
        command: commandParts.join(" "),
        exitCode: result.exitCode,
        diagnostics
      };
    }

    // Classify the error
    const troubleshoot = troubleshootTypecheck(
      "node",
      result.exitCode,
      result.stderr,
      result.stdout,
      result.timedOut
    );

    return {
      projectId: "",
      kind: "node",
      root: projectRoot,
      success: false,
      durationMs,
      usedFallback: true,
      command: commandParts.join(" "),
      exitCode: result.exitCode,
      diagnostics,
      error: {
        code: troubleshoot.code,
        message: troubleshoot.message
      }
    };
  } catch (err) {
    const durationMs = Date.now() - startTime;

    // Handle spawn errors (e.g., command not found)
    const errorMessage = err instanceof Error ? err.message : String(err);
    const troubleshoot = troubleshootTypecheck("node", null, errorMessage, "", false);

    return {
      projectId: "",
      kind: "node",
      root: projectRoot,
      success: false,
      durationMs,
      usedFallback: true,
      command: commandParts.join(" "),
      exitCode: null,
      diagnostics: [],
      error: {
        code: troubleshoot.code,
        message: troubleshoot.message,
        details: { originalError: errorMessage }
      }
    };
  }
}
