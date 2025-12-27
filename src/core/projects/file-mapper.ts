/**
 * File to project mapper.
 *
 * Maps changed files to their containing projects.
 */

import type { ProjectRef, ProjectWarning } from "./types.js";
import { findNodeProjectForFile } from "./node/index.js";
import { findPythonProjectForFile } from "./python/index.js";

/**
 * Result of mapping files to projects.
 */
export interface FileMappingResult {
  /**
   * Projects that have changed files.
   */
  readonly selectedProjects: readonly ProjectRef[];

  /**
   * Files that could not be mapped to any project.
   */
  readonly unmappedFiles: readonly string[];

  /**
   * Warnings generated during mapping.
   */
  readonly warnings: readonly ProjectWarning[];
}

/**
 * Map changed files to their containing projects.
 *
 * @param changedFiles - Array of changed files with paths
 * @param projects - All detected projects
 * @returns Mapping result with selected projects and warnings
 */
export function mapFilesToProjects(
  changedFiles: readonly { path: string }[],
  projects: readonly ProjectRef[]
): FileMappingResult {
  const warnings: ProjectWarning[] = [];
  const unmappedFiles: string[] = [];
  const selectedProjectIds = new Set<string>();

  for (const file of changedFiles) {
    const project = findProjectForFile(file.path, projects);

    if (project) {
      selectedProjectIds.add(project.id);
    } else {
      unmappedFiles.push(file.path);
    }
  }

  // Generate warnings for unmapped files
  for (const filePath of unmappedFiles) {
    warnings.push({
      code: "UNASSIGNED_FILE",
      message: `File ${filePath} does not belong to any detected project`,
      path: filePath
    });
  }

  // Get selected projects in order
  const selectedProjects = projects.filter((p) => selectedProjectIds.has(p.id));

  return {
    selectedProjects,
    unmappedFiles,
    warnings
  };
}

/**
 * Find the project that contains a given file.
 *
 * Searches through all project kinds to find the best match.
 *
 * @param filePath - Repo-relative file path
 * @param projects - All detected projects
 * @returns The project that contains the file, or undefined
 */
export function findProjectForFile(
  filePath: string,
  projects: readonly ProjectRef[]
): ProjectRef | undefined {
  // Normalize the file path
  const normalizedPath = filePath.replace(/\\/g, "/");

  // Separate projects by kind
  const nodeProjects = projects.filter((p) => p.kind === "node");
  const pythonProjects = projects.filter((p) => p.kind === "python");

  // Try to find the most specific match (deepest project root)
  let bestMatch: ProjectRef | undefined;
  let bestMatchLength = -1;

  // Check Node projects
  const nodeMatch = findNodeProjectForFile(normalizedPath, nodeProjects);
  if (nodeMatch && nodeMatch.root.length > bestMatchLength) {
    bestMatch = nodeMatch;
    bestMatchLength = nodeMatch.root.length;
  }

  // Check Python projects
  const pythonMatch = findPythonProjectForFile(normalizedPath, pythonProjects);
  if (pythonMatch && pythonMatch.root.length > bestMatchLength) {
    bestMatch = pythonMatch;
    bestMatchLength = pythonMatch.root.length;
  }

  return bestMatch;
}

/**
 * Get all projects that are affected by the given changed files.
 *
 * This is a more comprehensive check that includes:
 * - Projects containing changed files
 * - Projects that depend on changed projects (future feature)
 *
 * @param changedFiles - Array of changed files with paths
 * @param projects - All detected projects
 * @returns Array of affected projects
 */
export function getAffectedProjects(
  changedFiles: readonly { path: string }[],
  projects: readonly ProjectRef[]
): readonly ProjectRef[] {
  const { selectedProjects } = mapFilesToProjects(changedFiles, projects);
  // Future: Add dependency analysis to find transitive impacts
  return selectedProjects;
}
