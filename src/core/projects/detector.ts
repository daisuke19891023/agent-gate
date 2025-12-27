/**
 * Project detection orchestrator.
 *
 * Coordinates detection of all project types and aggregates results.
 */

import fs from "node:fs/promises";
import type {
  ProjectDetectionResult,
  ProjectDetectionOptions,
  ProjectRef,
  ProjectWarning,
  ProjectKind
} from "./types.js";
import { ProjectError } from "./types.js";
import { detectNodeProjects } from "./node/index.js";
import { detectPythonProjects } from "./python/index.js";
import { mapFilesToProjects } from "./file-mapper.js";

/**
 * Detect all projects in a repository.
 *
 * @param options - Detection options
 * @returns Detection result with all projects and selected projects
 */
export async function detectProjects(
  options: ProjectDetectionOptions
): Promise<ProjectDetectionResult> {
  const { repoRoot, kinds = ["node", "python"], changedFiles, exclude } = options;

  // Validate repo root
  try {
    const stats = await fs.stat(repoRoot);
    if (!stats.isDirectory()) {
      throw new ProjectError("INVALID_ROOT", `Not a directory: ${repoRoot}`, { repoRoot });
    }
  } catch (error) {
    if (error instanceof ProjectError) throw error;
    throw new ProjectError("INVALID_ROOT", `Cannot access directory: ${repoRoot}`, {
      repoRoot
    });
  }

  const allProjects: ProjectRef[] = [];
  const allWarnings: ProjectWarning[] = [];

  // Run detection for each requested kind
  const detectionPromises: Promise<void>[] = [];

  if (kinds.includes("node")) {
    detectionPromises.push(
      detectNodeProjects(repoRoot).then(({ result, warnings }) => {
        allProjects.push(...result.packages);
        allWarnings.push(...warnings);
      })
    );
  }

  if (kinds.includes("python")) {
    detectionPromises.push(
      detectPythonProjects(repoRoot).then(({ result, warnings }) => {
        allProjects.push(...result.projects);
        allWarnings.push(...warnings);
      })
    );
  }

  await Promise.all(detectionPromises);

  // Filter out excluded projects
  let filteredProjects = allProjects;
  if (exclude && exclude.length > 0) {
    filteredProjects = allProjects.filter((project) => {
      // Simple prefix matching for exclude patterns
      return !exclude.some((pattern) => {
        // Handle glob patterns like **/test/**
        if (pattern.startsWith("**/")) {
          const suffix = pattern.slice(3);
          if (suffix.endsWith("/**")) {
            const middle = suffix.slice(0, -3);
            return project.root.includes(`/${middle}/`) || project.root.includes(middle);
          }
          return project.root.includes(suffix);
        }
        return project.root.startsWith(pattern);
      });
    });
  }

  // Sort projects by root path for deterministic output
  filteredProjects.sort((a, b) => a.root.localeCompare(b.root));

  // Map changed files to projects if provided
  let selectedProjects: readonly ProjectRef[] = [];
  if (changedFiles && changedFiles.length > 0) {
    const mappingResult = mapFilesToProjects(changedFiles, filteredProjects);
    selectedProjects = mappingResult.selectedProjects;
    allWarnings.push(...mappingResult.warnings);
  }

  return {
    projects: filteredProjects,
    selectedProjects,
    warnings: allWarnings
  };
}

/**
 * Create a project detector with default configuration.
 *
 * @param repoRoot - Repository root path
 * @returns Object with detection methods
 */
export function createProjectDetector(repoRoot: string): {
  detect: (
    options?: Partial<Omit<ProjectDetectionOptions, "repoRoot">>
  ) => Promise<ProjectDetectionResult>;
  detectForFiles: (changedFiles: readonly { path: string }[]) => Promise<ProjectDetectionResult>;
} {
  return {
    detect: async (options = {}) =>
      detectProjects({
        repoRoot,
        kinds: options.kinds ?? (["node", "python"] as ProjectKind[]),
        changedFiles: options.changedFiles,
        exclude: options.exclude
      }),
    detectForFiles: async (changedFiles) =>
      detectProjects({
        repoRoot,
        kinds: ["node", "python"],
        changedFiles
      })
  };
}
