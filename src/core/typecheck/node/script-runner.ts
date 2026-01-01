/**
 * Script runner for package.json typecheck scripts.
 *
 * Runs typecheck scripts via the detected package manager.
 */

import type { TypecheckOptions, ProjectTypecheckResult, TypecheckDiagnostic } from "../types.js";
import { runCommand } from "../../process/run-command.js";
import { parseTscOutput } from "./tsc-parser.js";
import { buildScriptCommand } from "./script-detector.js";
import { troubleshootTypecheck } from "../troubleshooter.js";
import type { NodePackageManager } from "../types.js";

/**
 * Default timeout for script execution (2 minutes).
 */
const DEFAULT_SCRIPT_TIMEOUT_MS = 120_000;

/**
 * Run a typecheck script from package.json.
 *
 * @param options - Typecheck options
 * @param scriptName - The script name to run
 * @param packageManager - Package manager to use
 * @returns Project typecheck result
 */
export async function runTypecheckScript(
  options: TypecheckOptions,
  scriptName: string,
  packageManager: NodePackageManager
): Promise<ProjectTypecheckResult> {
  const { projectRoot, repoRoot, timeoutMs = DEFAULT_SCRIPT_TIMEOUT_MS, signal, env } = options;

  const startTime = Date.now();
  const commandParts = buildScriptCommand(scriptName, packageManager);
  const [command, ...args] = commandParts;

  if (!command) {
    return {
      projectId: "",
      kind: "node",
      root: projectRoot,
      success: false,
      durationMs: 0,
      usedFallback: false,
      diagnostics: [],
      error: {
        code: "TYPECHECK_SCRIPT_MISSING",
        message: "Failed to build script command."
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
    // Note: npm/pnpm/yarn may wrap tsc output, but the pattern should still match
    let diagnostics: readonly TypecheckDiagnostic[] = [];
    try {
      diagnostics = parseTscOutput(combinedOutput, projectRoot, repoRoot);
    } catch {
      // Parsing failed, continue without diagnostics
    }

    // Update source to indicate it came from npm script
    const sourcePrefix = `${packageManager}:${scriptName}`;
    const updatedDiagnostics = diagnostics.map((d) => ({
      ...d,
      source: sourcePrefix
    }));

    // Success if exit code is 0
    if (result.exitCode === 0 && !result.timedOut && !result.aborted) {
      return {
        projectId: "",
        kind: "node",
        root: projectRoot,
        success: true,
        durationMs,
        usedFallback: false,
        command: commandParts.join(" "),
        exitCode: result.exitCode,
        diagnostics: updatedDiagnostics
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
      usedFallback: false,
      command: commandParts.join(" "),
      exitCode: result.exitCode,
      diagnostics: updatedDiagnostics,
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
      usedFallback: false,
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
