/**
 * Git root finder with submodule and worktree support.
 *
 * Detects git repositories, submodules, and worktrees by analyzing
 * the .git directory/file structure.
 */

import fs from "node:fs/promises";
import path from "node:path";
import {
  findNearestBoundary,
  findAllMarkersInTree,
  createBoundaryCache,
  MARKERS,
  type BoundaryCache
} from "../boundary/index.js";
import type { GitRootInfo } from "./types.js";
import { ScopeError } from "./types.js";

/**
 * Parse a .git file (used by submodules and worktrees) to get the actual git directory.
 *
 * The file format is: "gitdir: <path>"
 *
 * @param gitFilePath - Path to the .git file
 * @returns The resolved gitdir path, or null if parsing fails
 */
async function parseGitFile(gitFilePath: string): Promise<string | null> {
  try {
    const content = await fs.readFile(gitFilePath, "utf-8");
    const match = content.trim().match(/^gitdir:\s*(.+)$/);
    if (!match?.[1]) {
      return null;
    }

    const gitDir = match[1];

    // If the path is relative, resolve it relative to the .git file's parent directory
    if (!path.isAbsolute(gitDir)) {
      const gitFileDir = path.dirname(gitFilePath);
      return path.resolve(gitFileDir, gitDir);
    }

    return gitDir;
  } catch {
    return null;
  }
}

/**
 * Determine if a git root is a submodule.
 *
 * A submodule has its .git as a file pointing to a directory inside
 * the parent repo's .git/modules/ directory.
 *
 * @param gitDir - The gitdir path (from .git file or .git directory)
 * @returns true if this looks like a submodule
 */
function isSubmodule(gitDir: string): boolean {
  // Submodule git directories are typically inside .git/modules/
  return gitDir.includes(".git/modules/") || gitDir.includes(".git\\modules\\");
}

/**
 * Determine if a git root is a worktree.
 *
 * A worktree has its .git as a file pointing to a directory inside
 * the main repo's .git/worktrees/ directory.
 *
 * @param gitDir - The gitdir path (from .git file)
 * @returns true if this looks like a worktree
 */
function isWorktree(gitDir: string): boolean {
  return gitDir.includes(".git/worktrees/") || gitDir.includes(".git\\worktrees\\");
}

/**
 * Get information about a git root at the specified path.
 *
 * @param gitPath - Path to the .git file or directory
 * @returns GitRootInfo describing the git root
 */
async function getGitRootInfo(gitPath: string): Promise<GitRootInfo> {
  const normalizedPath = gitPath.replace(/\\/g, "/");
  const rootDir = path.dirname(normalizedPath);

  try {
    const stats = await fs.stat(gitPath);

    if (stats.isDirectory()) {
      // Regular git repository with .git directory
      return {
        path: rootDir.replace(/\\/g, "/"),
        isSubmodule: false,
        isWorktree: false,
        gitPath: normalizedPath
      };
    }

    if (stats.isFile()) {
      // Submodule or worktree with .git file
      const gitDir = await parseGitFile(gitPath);

      if (!gitDir) {
        // Couldn't parse the .git file, treat as regular
        return {
          path: rootDir.replace(/\\/g, "/"),
          isSubmodule: false,
          isWorktree: false,
          gitPath: normalizedPath
        };
      }

      const normalizedGitDir = gitDir.replace(/\\/g, "/");

      return {
        path: rootDir.replace(/\\/g, "/"),
        isSubmodule: isSubmodule(normalizedGitDir),
        isWorktree: isWorktree(normalizedGitDir),
        gitPath: normalizedPath,
        gitDir: normalizedGitDir
      };
    }
  } catch {
    // Path doesn't exist or is inaccessible
  }

  // Fallback
  return {
    path: rootDir.replace(/\\/g, "/"),
    isSubmodule: false,
    isWorktree: false,
    gitPath: normalizedPath
  };
}

/**
 * Find the git root for a specific file.
 *
 * This finds the nearest .git directory/file in the ancestor chain,
 * which is important for files in submodules.
 *
 * @param filePath - Path to the file
 * @param repoRoot - The main repository root (used as stop point)
 * @param cache - Optional boundary cache for performance
 * @returns GitRootInfo for the file, or null if not in a git repo
 */
export async function findGitRootForFile(
  filePath: string,
  repoRoot: string,
  cache?: BoundaryCache
): Promise<GitRootInfo | null> {
  const result = await findNearestBoundary(filePath, MARKERS.GIT, {
    cache
    // Don't stop at repoRoot - we want to find the nearest .git
  });

  if (!result) {
    return null;
  }

  return getGitRootInfo(result.markerPath);
}

/**
 * Find all git roots in a repository.
 *
 * This includes the main repository and any submodules.
 *
 * @param repoRoot - The main repository root
 * @returns Array of GitRootInfo for all git roots
 */
export async function findAllGitRoots(repoRoot: string): Promise<GitRootInfo[]> {
  const results: GitRootInfo[] = [];

  // First, check if the repo root itself has a .git
  const mainGitPath = path.join(repoRoot, ".git");
  try {
    await fs.access(mainGitPath);
    const mainRoot = await getGitRootInfo(mainGitPath);
    results.push(mainRoot);
  } catch {
    // No .git at repo root - not a git repository
    throw new ScopeError("NOT_A_GIT_REPO", `Not a git repository: ${repoRoot}`, {
      repoRoot
    });
  }

  // Find all .git files/directories in the tree (for submodules)
  const allGitMarkers = await findAllMarkersInTree(repoRoot, MARKERS.GIT, {
    excludeDirs: ["node_modules", ".git", "__pycache__", ".venv", "venv"],
    maxDepth: 10 // Limit depth for performance
  });

  // Process each found .git marker
  for (const marker of allGitMarkers) {
    // Skip the main .git we already processed
    if (marker.relativePath === ".") {
      continue;
    }

    const info = await getGitRootInfo(marker.markerPath);
    results.push(info);
  }

  // Sort by path for deterministic output
  results.sort((a, b) => a.path.localeCompare(b.path));

  return results;
}

/**
 * Check if a file is inside a submodule.
 *
 * @param filePath - Path to check
 * @param repoRoot - The main repository root
 * @param cache - Optional boundary cache
 * @returns true if the file is in a submodule
 */
export async function isFileInSubmodule(
  filePath: string,
  repoRoot: string,
  cache?: BoundaryCache
): Promise<boolean> {
  const gitRoot = await findGitRootForFile(filePath, repoRoot, cache);

  if (!gitRoot) {
    return false;
  }

  return gitRoot.isSubmodule;
}

/**
 * Create a git root finder with caching.
 *
 * @returns Object with cached git root finder methods
 */
export function createGitRootFinder(): {
  findForFile: (filePath: string, repoRoot: string) => Promise<GitRootInfo | null>;
  findAll: (repoRoot: string) => Promise<GitRootInfo[]>;
  isInSubmodule: (filePath: string, repoRoot: string) => Promise<boolean>;
  clearCache: () => void;
} {
  const cache = createBoundaryCache();

  return {
    findForFile: (filePath: string, repoRoot: string) =>
      findGitRootForFile(filePath, repoRoot, cache),
    findAll: findAllGitRoots,
    isInSubmodule: (filePath: string, repoRoot: string) =>
      isFileInSubmodule(filePath, repoRoot, cache),
    clearCache: () => cache.clear()
  };
}
