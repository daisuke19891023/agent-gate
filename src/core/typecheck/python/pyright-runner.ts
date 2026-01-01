/**
 * Pyright runner.
 *
 * Runs pyright for Python type checking.
 */

import type { TypecheckOptions, ProjectTypecheckResult, TypecheckDiagnostic } from "../types.js";
import { runCommand } from "../../process/run-command.js";
import { tryParsePyrightOutput } from "./pyright-parser.js";
import { troubleshootTypecheck } from "../troubleshooter.js";

/**
 * Default timeout for pyright (2 minutes).
 */
const DEFAULT_PYRIGHT_TIMEOUT_MS = 120_000;

/**
 * Run pyright for type checking.
 *
 * Uses `pyright --outputjson` for machine-readable output.
 *
 * @param options - Typecheck options
 * @param customCommand - Optional custom command override
 * @returns Project typecheck result
 */
export async function runPyright(
  options: TypecheckOptions,
  customCommand?: string
): Promise<ProjectTypecheckResult> {
  const { projectRoot, repoRoot, timeoutMs = DEFAULT_PYRIGHT_TIMEOUT_MS, signal, env } = options;

  const startTime = Date.now();

  // Build command
  let command: string;
  let args: string[];
  let commandDisplay: string;

  if (customCommand) {
    // Use custom command (split by spaces)
    const parts = customCommand.split(/\s+/);
    command = parts[0] ?? "pyright";
    args = parts.slice(1);
    commandDisplay = customCommand;
  } else {
    // Default: pyright --outputjson
    command = "pyright";
    args = ["--outputjson"];
    commandDisplay = "pyright --outputjson";
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

    // Try to parse JSON output
    const { diagnostics, parseSuccess } = tryParsePyrightOutput(
      result.stdout,
      projectRoot,
      repoRoot
    );

    // pyright exit codes:
    // 0: No errors
    // 1: Errors found
    // Other: Various failures

    // Check for success (exit code 0 and no errors in diagnostics)
    if (result.exitCode === 0 && !result.timedOut && !result.aborted) {
      return {
        projectId: "",
        kind: "python",
        root: projectRoot,
        success: true,
        durationMs,
        usedFallback: false,
        command: commandDisplay,
        exitCode: result.exitCode,
        diagnostics
      };
    }

    // Check if typecheck ran but found errors (exit code 1 with valid JSON)
    if (result.exitCode === 1 && parseSuccess && diagnostics.length > 0) {
      return {
        projectId: "",
        kind: "python",
        root: projectRoot,
        success: false,
        durationMs,
        usedFallback: false,
        command: commandDisplay,
        exitCode: result.exitCode,
        diagnostics,
        error: {
          code: "TYPECHECK_FAILED",
          message: `Pyright found ${diagnostics.filter((d) => d.severity === "error").length} error(s).`
        }
      };
    }

    // Classify other errors
    const troubleshoot = troubleshootTypecheck(
      "python",
      result.exitCode,
      result.stderr,
      result.stdout,
      result.timedOut
    );

    // If we couldn't parse output, add parse error info
    let finalDiagnostics: readonly TypecheckDiagnostic[] = diagnostics;
    if (!parseSuccess && result.stdout.trim()) {
      // Couldn't parse but there was output - might be an error message
      finalDiagnostics = [];
    }

    return {
      projectId: "",
      kind: "python",
      root: projectRoot,
      success: false,
      durationMs,
      usedFallback: false,
      command: commandDisplay,
      exitCode: result.exitCode,
      diagnostics: finalDiagnostics,
      error: {
        code: troubleshoot.code,
        message: troubleshoot.message
      }
    };
  } catch (err) {
    const durationMs = Date.now() - startTime;

    // Handle spawn errors (e.g., command not found)
    const errorMessage = err instanceof Error ? err.message : String(err);
    const troubleshoot = troubleshootTypecheck("python", null, errorMessage, "", false);

    return {
      projectId: "",
      kind: "python",
      root: projectRoot,
      success: false,
      durationMs,
      usedFallback: false,
      command: commandDisplay,
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
