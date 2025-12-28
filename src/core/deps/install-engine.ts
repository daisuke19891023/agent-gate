/**
 * Install Engine - Orchestrates dependency installation across projects.
 *
 * Coordinates installation for Node.js and Python projects,
 * collecting results and generating actionable reports.
 */

import * as path from "node:path";
import type { ProjectRef, NodePackageManager, PythonPackageManager } from "../projects/types.js";
import type {
  InstallAllResult,
  InstallOptions,
  ProjectInstallResult,
  NodePackageManagerType,
  PythonPackageManagerType
} from "./types.js";
import { installNodeDependencies } from "./node/index.js";
import { installPythonDependencies } from "./python/index.js";
import { getDepsNextActions } from "./install-troubleshooter.js";

/**
 * Options for the install engine.
 */
export interface InstallEngineOptions {
  readonly repoRoot: string;
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
  readonly env?: NodeJS.ProcessEnv;
}

/**
 * Install engine instance.
 */
export interface InstallEngine {
  /**
   * Install dependencies for all projects.
   */
  installAll(projects: readonly ProjectRef[]): Promise<InstallAllResult>;

  /**
   * Install dependencies for a single project.
   */
  installProject(project: ProjectRef): Promise<ProjectInstallResult>;
}

/**
 * Create an install engine.
 */
export function createInstallEngine(options: InstallEngineOptions): InstallEngine {
  const { repoRoot, timeoutMs, signal, env } = options;

  return {
    async installAll(projects: readonly ProjectRef[]): Promise<InstallAllResult> {
      const startTime = Date.now();
      const results: ProjectInstallResult[] = [];
      const notes: string[] = [];

      // Install dependencies for each project sequentially
      // (parallel installation could cause conflicts with shared caches)
      for (const project of projects) {
        // Check if aborted
        if (signal?.aborted) {
          results.push({
            projectId: project.id,
            kind: project.kind,
            root: project.root,
            packageManager: {
              manager: "unknown",
              lockfileExists: false,
              manifestPath: ""
            },
            success: false,
            durationMs: 0,
            error: {
              code: "TIMEOUT",
              message: "Installation was aborted."
            }
          });
          continue;
        }

        const result = await this.installProject(project);
        results.push(result);

        if (!result.success && result.error) {
          const nextActions = getDepsNextActions(result.error);
          for (const action of nextActions) {
            notes.push(`[${project.id}] ${action.message}`);
          }
        }
      }

      const totalDurationMs = Date.now() - startTime;
      const allSucceeded = results.every((r) => r.success);

      return {
        allSucceeded,
        totalDurationMs,
        projects: results,
        notes
      };
    },

    async installProject(project: ProjectRef): Promise<ProjectInstallResult> {
      const projectRoot = path.resolve(repoRoot, project.root);
      const installOptions: InstallOptions = {
        projectRoot,
        repoRoot,
        timeoutMs,
        signal,
        env
      };

      if (project.kind === "node") {
        const manager = mapNodePackageManager(project.packageManager);
        const result = await installNodeDependencies(manager, installOptions);
        return {
          projectId: project.id,
          kind: "node",
          root: project.root,
          packageManager: result.packageManager,
          success: result.success,
          durationMs: result.durationMs,
          error: result.error
        };
      }

      if (project.kind === "python") {
        const manager = mapPythonPackageManager(project.packageManager);
        const result = await installPythonDependencies(manager, installOptions);
        return {
          projectId: project.id,
          kind: "python",
          root: project.root,
          packageManager: result.packageManager,
          success: result.success,
          durationMs: result.durationMs,
          error: result.error
        };
      }

      // Unknown kind - should not happen with proper typing
      return {
        projectId: project.id,
        kind: project.kind,
        root: project.root,
        packageManager: {
          manager: "unknown",
          lockfileExists: false,
          manifestPath: ""
        },
        success: false,
        durationMs: 0,
        error: {
          code: "TOOLCHAIN_MISSING",
          message: `Unknown project kind: ${project.kind}`
        }
      };
    }
  };
}

/**
 * Map project's package manager to Node package manager type.
 * Falls back to pnpm if unknown.
 */
function mapNodePackageManager(
  pm: NodePackageManager | PythonPackageManager | undefined
): NodePackageManagerType {
  if (pm === "pnpm" || pm === "npm" || pm === "yarn") {
    return pm;
  }
  // Treat "unknown" or undefined as pnpm (most common in monorepos)
  // bun is not in the original NodePackageManager type, but we support it
  return "pnpm";
}

/**
 * Map project's package manager to Python package manager type.
 * Falls back to pip if unknown.
 */
function mapPythonPackageManager(
  pm: NodePackageManager | PythonPackageManager | undefined
): PythonPackageManagerType {
  if (pm === "uv" || pm === "pip" || pm === "poetry") {
    return pm;
  }
  // Treat "unknown" or undefined as pip (most common)
  return "pip";
}
