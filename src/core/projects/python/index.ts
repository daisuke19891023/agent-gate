/**
 * Python project detection for monorepos.
 *
 * Detects Python projects by finding pyproject.toml files.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { findAllMarkersInTree, MARKERS } from "../../boundary/index.js";
import type { PythonDetectionResult, ProjectRef, ProjectWarning } from "../types.js";
import { ProjectError } from "../types.js";
import { parsePyprojectToml, detectPythonPackageManager } from "./pyproject-parser.js";

/**
 * Detect Python projects in a repository.
 *
 * Finds all pyproject.toml files and parses them to extract project info.
 *
 * @param repoRoot - Repository root directory
 * @returns Detection result with projects and metadata
 */
export async function detectPythonProjects(repoRoot: string): Promise<{
  result: PythonDetectionResult;
  warnings: ProjectWarning[];
}> {
  const warnings: ProjectWarning[] = [];

  // Verify repoRoot exists
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

  // Use boundary module to find all pyproject.toml files
  // Note: findAllMarkersInTree already has default excludes for node_modules, .venv, etc.
  const pyprojectResults = await findAllMarkersInTree(repoRoot, MARKERS.PYPROJECT_TOML);

  if (pyprojectResults.length === 0) {
    // No pyproject.toml files found
    return {
      result: {
        packageManager: "unknown",
        projects: [],
        isMultiProject: false
      },
      warnings
    };
  }

  // Parse each pyproject.toml
  const projects: ProjectRef[] = [];
  let primaryPackageManager = await detectPythonPackageManager(repoRoot);

  for (const result of pyprojectResults) {
    const pyprojectPath = result.markerPath;
    const projectDir = path.dirname(pyprojectPath);
    const relativePath = path.relative(repoRoot, projectDir).replace(/\\/g, "/") || ".";

    try {
      const parsed = await parsePyprojectToml(pyprojectPath);

      if (!parsed) {
        warnings.push({
          code: "PARSE_ERROR",
          message: `Failed to parse pyproject.toml at ${relativePath}`,
          path: relativePath
        });
        continue;
      }

      // Use root pyproject.toml's package manager as primary
      if (relativePath === ".") {
        primaryPackageManager = parsed.packageManager;
      }

      if (!parsed.name) {
        warnings.push({
          code: "MISSING_NAME",
          message: `pyproject.toml at ${relativePath} has no project name`,
          path: relativePath
        });
      }

      const projectRef = createProjectRef(relativePath, parsed.name, parsed.packageManager);
      projects.push(projectRef);
    } catch (error) {
      warnings.push({
        code: "PARSE_ERROR",
        message: `Error parsing pyproject.toml at ${relativePath}: ${error instanceof Error ? error.message : String(error)}`,
        path: relativePath,
        context: { error: String(error) }
      });
    }
  }

  // Sort by root path for deterministic output
  projects.sort((a, b) => a.root.localeCompare(b.root));

  return {
    result: {
      packageManager: primaryPackageManager,
      projects,
      isMultiProject: projects.length > 1
    },
    warnings
  };
}

/**
 * Create a ProjectRef from Python project information.
 *
 * @param relativePath - Repo-relative path to the project
 * @param name - Project name (optional)
 * @param packageManager - Package manager
 * @returns ProjectRef
 */
function createProjectRef(
  relativePath: string,
  name: string | undefined,
  packageManager: string
): ProjectRef {
  // Normalize path to use forward slashes
  const normalizedPath = relativePath.replace(/\\/g, "/");

  // Generate ID: python:name or python:path
  const id = name ? `python:${name}` : `python:${normalizedPath}`;

  return {
    id,
    kind: "python",
    name,
    root: normalizedPath,
    packageManager: packageManager as ProjectRef["packageManager"]
  };
}

/**
 * Find which Python project contains a given file.
 *
 * @param filePath - Repo-relative file path
 * @param projects - List of detected projects
 * @returns The project that contains the file, or undefined
 */
export function findPythonProjectForFile(
  filePath: string,
  projects: readonly ProjectRef[]
): ProjectRef | undefined {
  // Normalize the file path
  const normalizedPath = filePath.replace(/\\/g, "/");

  // Find the deepest matching project (longest root that is a prefix)
  let bestMatch: ProjectRef | undefined;
  let bestMatchLength = -1;

  for (const project of projects) {
    if (project.kind !== "python") continue;

    // Check if file is under this project's root
    const projectRoot = project.root === "." ? "" : project.root + "/";

    if (normalizedPath.startsWith(projectRoot) || project.root === ".") {
      const matchLength = project.root.length;
      if (matchLength > bestMatchLength) {
        bestMatch = project;
        bestMatchLength = matchLength;
      }
    }
  }

  return bestMatch;
}
