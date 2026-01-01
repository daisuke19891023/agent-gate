/**
 * Typecheck engine - orchestrates typecheck for all projects.
 *
 * Runs typecheck for Node and Python projects, aggregates results,
 * and provides sorted diagnostics.
 */

import type { ProjectRef } from "../projects/types.js";
import type {
  TypecheckOptions,
  TypecheckAllResult,
  ProjectTypecheckResult,
  TypecheckDiagnostic
} from "./types.js";
import type { AgentGateConfig } from "../../config/schema.js";
import { typecheckNodeProject } from "./node/index.js";
import { typecheckPythonProject } from "./python/index.js";

/**
 * Options for the typecheck engine.
 */
export interface TypecheckEngineOptions {
  readonly repoRoot: string;
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
  readonly env?: NodeJS.ProcessEnv;
  readonly config?: AgentGateConfig;
}

/**
 * Typecheck engine interface.
 */
export interface TypecheckEngine {
  /**
   * Run typecheck for all projects.
   */
  typecheckAll(projects: readonly ProjectRef[]): Promise<TypecheckAllResult>;

  /**
   * Run typecheck for a single project.
   */
  typecheckProject(project: ProjectRef): Promise<ProjectTypecheckResult>;
}

/**
 * Create a typecheck engine.
 *
 * @param options - Engine options
 * @returns Typecheck engine instance
 */
export function createTypecheckEngine(options: TypecheckEngineOptions): TypecheckEngine {
  const { repoRoot, timeoutMs, signal, env, config } = options;

  /**
   * Run typecheck for a single project.
   */
  async function typecheckProject(project: ProjectRef): Promise<ProjectTypecheckResult> {
    const typecheckOptions: TypecheckOptions & { config?: AgentGateConfig } = {
      projectRoot: "", // Will be set by the specific implementation
      repoRoot,
      timeoutMs,
      signal,
      env,
      config
    };

    switch (project.kind) {
      case "node":
        return typecheckNodeProject(project, typecheckOptions);
      case "python":
        return typecheckPythonProject(project, typecheckOptions);
      default:
        // Unknown project kind
        return {
          projectId: project.id,
          kind: project.kind,
          root: project.root,
          success: true,
          durationMs: 0,
          usedFallback: false,
          diagnostics: []
        };
    }
  }

  /**
   * Run typecheck for all projects.
   */
  async function typecheckAll(projects: readonly ProjectRef[]): Promise<TypecheckAllResult> {
    const startTime = Date.now();
    const results: ProjectTypecheckResult[] = [];
    const warnings: string[] = [];

    // Run typecheck for each project sequentially
    // (Could be parallelized in the future with slot management)
    for (const project of projects) {
      // Check for abort signal
      if (signal?.aborted) {
        results.push({
          projectId: project.id,
          kind: project.kind,
          root: project.root,
          success: false,
          durationMs: 0,
          usedFallback: false,
          diagnostics: [],
          error: {
            code: "TIMEOUT",
            message: "Typecheck was aborted."
          }
        });
        continue;
      }

      const result = await typecheckProject(project);
      results.push(result);

      // Collect warnings for fallback usage
      if (result.usedFallback && result.success) {
        warnings.push(`FALLBACK_TYPECHECK_USED: ${project.id}`);
      } else if (result.usedFallback && !result.success) {
        warnings.push(`FALLBACK_TYPECHECK_FAILED: ${project.id}`);
      }

      // Add warning for pyright not found (skip case)
      if (result.error?.code === "PYRIGHT_NOT_FOUND") {
        warnings.push(`PYRIGHT_NOT_FOUND: ${project.id} - Python typecheck skipped`);
      }
    }

    const totalDurationMs = Date.now() - startTime;

    // Aggregate diagnostics from all projects
    const allDiagnostics = results.flatMap((r) => r.diagnostics);

    // Sort diagnostics by file, then by line, then by column
    const sortedDiagnostics = [...allDiagnostics].sort((a, b) => {
      const fileCompare = (a.file ?? "").localeCompare(b.file ?? "");
      if (fileCompare !== 0) return fileCompare;

      const aLine = a.range?.start.line ?? 0;
      const bLine = b.range?.start.line ?? 0;
      if (aLine !== bLine) return aLine - bLine;

      const aCol = a.range?.start.column ?? 0;
      const bCol = b.range?.start.column ?? 0;
      return aCol - bCol;
    });

    // Check if all succeeded
    // Note: PYRIGHT_NOT_FOUND is treated as a skip (warning), not a failure
    const allSucceeded = results.every((r) => r.success || r.error?.code === "PYRIGHT_NOT_FOUND");

    return {
      allSucceeded,
      totalDurationMs,
      projects: results,
      diagnostics: sortedDiagnostics,
      warnings
    };
  }

  return {
    typecheckAll,
    typecheckProject
  };
}

/**
 * Count diagnostics by severity.
 */
export function countDiagnosticsBySeverity(diagnostics: readonly TypecheckDiagnostic[]): {
  errors: number;
  warnings: number;
  info: number;
  hints: number;
} {
  let errors = 0;
  let warnings = 0;
  let info = 0;
  let hints = 0;

  for (const d of diagnostics) {
    switch (d.severity) {
      case "error":
        errors++;
        break;
      case "warning":
        warnings++;
        break;
      case "info":
        info++;
        break;
      case "hint":
        hints++;
        break;
    }
  }

  return { errors, warnings, info, hints };
}
