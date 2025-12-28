/**
 * Node project detection for monorepos.
 *
 * Detects Node/TypeScript packages using workspace configurations.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { getPackages } from "@manypkg/get-packages";
import type { NodeDetectionResult, ProjectRef, ProjectWarning } from "../types.js";
import { ProjectError } from "../types.js";
import { detectPackageManager, hasWorkspaces, readPackageJson } from "./workspace-detector.js";

/**
 * Detect Node projects in a repository.
 *
 * Uses @manypkg/get-packages to detect workspace packages in pnpm/npm/yarn monorepos.
 *
 * @param repoRoot - Repository root directory
 * @returns Detection result with packages and metadata
 */
export async function detectNodeProjects(repoRoot: string): Promise<{
  result: NodeDetectionResult;
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

  // Check if package.json exists at root
  const rootPackageJson = await readPackageJson(repoRoot);
  if (!rootPackageJson) {
    // No package.json at root - not a Node project
    return {
      result: {
        packageManager: "unknown",
        packages: [],
        isMonorepo: false
      },
      warnings
    };
  }

  // Detect package manager
  const packageManager = await detectPackageManager(repoRoot);

  // Check if it's a monorepo with workspaces
  const isMonorepo = await hasWorkspaces(repoRoot, packageManager);

  if (!isMonorepo) {
    // Single package project
    const projectRef = createProjectRef(repoRoot, ".", rootPackageJson.name, packageManager);
    return {
      result: {
        packageManager,
        packages: [projectRef],
        isMonorepo: false,
        rootName: rootPackageJson.name
      },
      warnings
    };
  }

  // Use manypkg to get all workspace packages
  try {
    const { packages, rootPackage } = await getPackages(repoRoot);

    const projectRefs: ProjectRef[] = [];

    // Add root package if it has a name
    if (rootPackage?.packageJson.name) {
      projectRefs.push(
        createProjectRef(repoRoot, ".", rootPackage.packageJson.name, packageManager)
      );
    }

    // Add workspace packages
    for (const pkg of packages) {
      const relativePath = path.relative(repoRoot, pkg.dir).replace(/\\/g, "/");

      if (!pkg.packageJson.name) {
        warnings.push({
          code: "MISSING_NAME",
          message: `Package at ${relativePath} has no name in package.json`,
          path: relativePath
        });
      }

      projectRefs.push(
        createProjectRef(repoRoot, relativePath, pkg.packageJson.name, packageManager)
      );
    }

    // Sort by root path for deterministic output
    projectRefs.sort((a, b) => a.root.localeCompare(b.root));

    return {
      result: {
        packageManager,
        packages: projectRefs,
        isMonorepo: true,
        rootName: rootPackage?.packageJson.name
      },
      warnings
    };
  } catch (error) {
    // manypkg failed - fallback to basic detection
    warnings.push({
      code: "DETECTION_FAILED",
      message: `Workspace detection failed: ${error instanceof Error ? error.message : String(error)}`,
      context: { error: String(error) }
    });

    // Return just the root package
    const projectRef = createProjectRef(repoRoot, ".", rootPackageJson.name, packageManager);
    return {
      result: {
        packageManager,
        packages: [projectRef],
        isMonorepo: false,
        rootName: rootPackageJson.name
      },
      warnings
    };
  }
}

/**
 * Create a ProjectRef from package information.
 *
 * @param repoRoot - Repository root directory
 * @param relativePath - Repo-relative path to the package
 * @param name - Package name (optional)
 * @param packageManager - Package manager
 * @returns ProjectRef
 */
function createProjectRef(
  _repoRoot: string,
  relativePath: string,
  name: string | undefined,
  packageManager: string
): ProjectRef {
  // Normalize path to use forward slashes
  const normalizedPath = relativePath.replace(/\\/g, "/");

  // Generate ID: node:name or node:path
  const id = name ? `node:${name}` : `node:${normalizedPath}`;

  return {
    id,
    kind: "node",
    name,
    root: normalizedPath,
    packageManager: packageManager as ProjectRef["packageManager"]
  };
}

/**
 * Find which Node project contains a given file.
 *
 * @param filePath - Repo-relative file path
 * @param projects - List of detected projects
 * @returns The project that contains the file, or undefined
 */
export function findNodeProjectForFile(
  filePath: string,
  projects: readonly ProjectRef[]
): ProjectRef | undefined {
  // Normalize the file path
  const normalizedPath = filePath.replace(/\\/g, "/");

  // Find the deepest matching project (longest root that is a prefix)
  let bestMatch: ProjectRef | undefined;
  let bestMatchLength = -1;

  for (const project of projects) {
    if (project.kind !== "node") continue;

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
