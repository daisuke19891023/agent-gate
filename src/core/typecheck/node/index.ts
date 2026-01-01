/**
 * Node.js typecheck engine.
 *
 * Runs typecheck for Node.js/TypeScript projects.
 * Strategy: scripts.typecheck → fallback tsc --noEmit (with warning).
 */

import * as path from "node:path";
import type { ProjectRef } from "../../projects/types.js";
import type { TypecheckOptions, ProjectTypecheckResult } from "../types.js";
import type { AgentGateConfig } from "../../../config/schema.js";
import { detectTypecheckScript } from "./script-detector.js";
import { runTypecheckScript } from "./script-runner.js";
import { runTscFallback } from "./tsc-runner.js";

/**
 * Options for Node.js typecheck.
 */
export interface NodeTypecheckOptions extends TypecheckOptions {
  readonly config?: AgentGateConfig;
}

/**
 * Run typecheck for a Node.js project.
 *
 * Strategy:
 * 1. Check config for project-specific override
 * 2. Check if scripts.typecheck (or configured scriptName) exists
 * 3. If yes, run it via package manager
 * 4. If no, check config.toolchains.node.typecheck.fallback.enabled
 * 5. If fallback enabled (default true), run tsc --noEmit
 * 6. Parse output and return diagnostics
 *
 * @param project - Project reference
 * @param options - Typecheck options
 * @returns Project typecheck result with projectId filled in
 */
export async function typecheckNodeProject(
  project: ProjectRef,
  options: NodeTypecheckOptions
): Promise<ProjectTypecheckResult> {
  const { repoRoot, config } = options;
  const projectRoot = path.resolve(repoRoot, project.root);

  // Check for project-specific override
  const nodeConfig = config?.toolchains?.node;
  const overrides = nodeConfig?.typecheck?.overrides ?? [];
  const projectOverride = overrides.find(
    (o) => o.projectRoot === project.root || o.projectRoot === project.id
  );

  if (projectOverride) {
    // Use override command directly
    const result = await runTscFallback(
      { ...options, projectRoot },
      "npm", // Default to npm for custom commands
      projectOverride.command
    );
    return {
      ...result,
      projectId: project.id,
      root: project.root
    };
  }

  // Detect script and package manager
  const scriptNameOverride = nodeConfig?.typecheck?.scriptName;
  const detection = await detectTypecheckScript(projectRoot, scriptNameOverride, repoRoot);

  // If typecheck script exists, run it
  if (detection.hasTypecheckScript && detection.scriptName) {
    const result = await runTypecheckScript(
      { ...options, projectRoot },
      detection.scriptName,
      detection.packageManager
    );
    return {
      ...result,
      projectId: project.id,
      root: project.root
    };
  }

  // No script found - check if fallback is enabled
  const fallbackEnabled = nodeConfig?.typecheck?.fallback?.enabled ?? true;

  if (!fallbackEnabled) {
    // Fallback disabled, return error
    return {
      projectId: project.id,
      kind: "node",
      root: project.root,
      success: false,
      durationMs: 0,
      usedFallback: false,
      diagnostics: [],
      error: {
        code: "TYPECHECK_SCRIPT_MISSING",
        message: `No typecheck script found in ${project.id} and fallback is disabled.`
      }
    };
  }

  // Check if tsconfig.json exists
  if (!detection.hasTsconfig) {
    // No tsconfig.json, return error with suggestion
    return {
      projectId: project.id,
      kind: "node",
      root: project.root,
      success: false,
      durationMs: 0,
      usedFallback: true,
      diagnostics: [],
      error: {
        code: "TSCONFIG_MISSING",
        message: `No tsconfig.json found in ${project.id}.`
      }
    };
  }

  // Run fallback (tsc --noEmit)
  const fallbackCommand = nodeConfig?.typecheck?.fallback?.command;
  const result = await runTscFallback(
    { ...options, projectRoot },
    detection.packageManager,
    fallbackCommand
  );

  return {
    ...result,
    projectId: project.id,
    root: project.root
  };
}

// Re-export types and utilities
export {
  detectTypecheckScript,
  buildScriptCommand,
  buildTscFallbackCommand
} from "./script-detector.js";
export { parseTscOutput, countDiagnostics } from "./tsc-parser.js";
export { runTscFallback } from "./tsc-runner.js";
export { runTypecheckScript } from "./script-runner.js";
