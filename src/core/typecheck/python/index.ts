/**
 * Python typecheck engine.
 *
 * Runs typecheck for Python projects using pyright.
 * If pyright is not installed, returns warning + skip with nextActions.
 */

import * as path from "node:path";
import type { ProjectRef } from "../../projects/types.js";
import type { TypecheckOptions, ProjectTypecheckResult } from "../types.js";
import type { AgentGateConfig } from "../../../config/schema.js";
import { runPyright } from "./pyright-runner.js";

/**
 * Options for Python typecheck.
 */
export interface PythonTypecheckOptions extends TypecheckOptions {
  readonly config?: AgentGateConfig;
}

/**
 * Run typecheck for a Python project.
 *
 * Strategy:
 * 1. Check config for project-specific override
 * 2. Run pyright --outputjson
 * 3. If pyright not installed, return warning + skip with nextActions
 * 4. Parse output and return diagnostics
 *
 * @param project - Project reference
 * @param options - Typecheck options
 * @returns Project typecheck result with projectId filled in
 */
export async function typecheckPythonProject(
  project: ProjectRef,
  options: PythonTypecheckOptions
): Promise<ProjectTypecheckResult> {
  const { repoRoot, config } = options;
  const projectRoot = path.resolve(repoRoot, project.root);

  // Check for project-specific override
  const pythonConfig = config?.toolchains?.python;
  const overrides = pythonConfig?.typecheck?.overrides ?? [];
  const projectOverride = overrides.find(
    (o) => o.projectRoot === project.root || o.projectRoot === project.id
  );

  // Run pyright (with override if specified)
  const result = await runPyright({ ...options, projectRoot }, projectOverride?.command);

  return {
    ...result,
    projectId: project.id,
    root: project.root
  };
}

// Re-export types and utilities
export { parsePyrightOutput, tryParsePyrightOutput } from "./pyright-parser.js";
export { runPyright } from "./pyright-runner.js";
