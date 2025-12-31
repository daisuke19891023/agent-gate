/**
 * Scope resolver for determining which files to validate.
 *
 * Coordinates git diff detection, filtering, and scope resolution.
 */

import fs from "node:fs/promises";
import { minimatch } from "minimatch";
import type { ScopeOptions, ScopeResult, ChangedFile } from "./types.js";
import { ScopeError } from "./types.js";
import { getUncommittedChanges, getSubmoduleChanges } from "./git-diff.js";
import { findAllGitRoots } from "./git-root-finder.js";

/**
 * Default patterns to exclude from scope.
 */
const DEFAULT_EXCLUDE_PATTERNS = [
  "**/node_modules/**",
  "**/.git/**",
  "**/__pycache__/**",
  "**/.venv/**",
  "**/venv/**",
  "**/.tox/**",
  "**/dist/**",
  "**/build/**",
  "**/coverage/**",
  "**/.next/**",
  "**/.nuxt/**",
  "**/*.min.js",
  "**/*.min.css"
];

/**
 * Check if a file path matches any of the given glob patterns.
 *
 * @param filePath - Repo-relative file path
 * @param patterns - Array of glob patterns
 * @returns true if the path matches any pattern
 */
function matchesPatterns(filePath: string, patterns: readonly string[]): boolean {
  for (const pattern of patterns) {
    if (minimatch(filePath, pattern, { dot: true })) {
      return true;
    }
  }
  return false;
}

/**
 * Filter changed files based on include/exclude patterns.
 *
 * @param files - Array of changed files
 * @param include - Patterns to include (if empty, all files are included)
 * @param exclude - Patterns to exclude
 * @returns Filtered array of changed files
 */
function filterFiles(
  files: ChangedFile[],
  include: readonly string[] | undefined,
  exclude: readonly string[] | undefined
): ChangedFile[] {
  const excludePatterns = [...DEFAULT_EXCLUDE_PATTERNS, ...(exclude ?? [])];

  return files.filter((file) => {
    // Check exclude patterns first
    if (matchesPatterns(file.path, excludePatterns)) {
      return false;
    }

    // If include patterns are specified, file must match at least one
    if (include && include.length > 0) {
      return matchesPatterns(file.path, include);
    }

    return true;
  });
}

/**
 * Resolve the scope of files to validate.
 *
 * @param options - Scope resolution options
 * @returns ScopeResult with the resolved scope
 */
export async function resolveScope(options: ScopeOptions): Promise<ScopeResult> {
  const { repoRoot, mode, onNoChanges, include, exclude, includeSubmodules = true } = options;

  // Validate repo root exists
  try {
    const stats = await fs.stat(repoRoot);
    if (!stats.isDirectory()) {
      throw new ScopeError("INVALID_REPO_ROOT", `Not a directory: ${repoRoot}`, { repoRoot });
    }
  } catch (error) {
    if (error instanceof ScopeError) throw error;
    throw new ScopeError("INVALID_REPO_ROOT", `Cannot access repository root: ${repoRoot}`, {
      repoRoot
    });
  }

  // Find all git roots (main repo + submodules)
  const gitRoots = await findAllGitRoots(repoRoot);

  if (mode === "all") {
    // For 'all' mode, we don't need to detect changes
    // The caller will need to scan for all files separately
    return {
      mode: "all",
      changedFiles: [],
      hasChanges: true, // In 'all' mode, we always consider there to be "changes"
      gitRoots,
      repoRoot
    };
  }

  // Get uncommitted changes from main repo
  let changedFiles = await getUncommittedChanges(repoRoot);

  // Get changes from submodules if requested
  if (includeSubmodules) {
    const submoduleChanges = await getSubmoduleChanges(repoRoot);
    changedFiles = [...changedFiles, ...submoduleChanges];
  }

  // Filter files based on include/exclude patterns
  changedFiles = filterFiles(changedFiles, include, exclude);

  // Sort for deterministic output
  changedFiles.sort((a, b) => a.path.localeCompare(b.path));

  const hasChanges = changedFiles.length > 0;

  // Handle no changes case
  if (!hasChanges) {
    switch (onNoChanges) {
      case "fail":
        throw new ScopeError(
          "NO_CHANGES_FAIL",
          "No uncommitted changes detected and onNoChanges is set to fail",
          { mode, onNoChanges }
        );
      case "skip":
      case "ok":
      default:
        // Return empty result
        return {
          mode,
          changedFiles: [],
          hasChanges: false,
          gitRoots,
          repoRoot
        };
    }
  }

  return {
    mode,
    changedFiles,
    hasChanges: true,
    gitRoots,
    repoRoot
  };
}

/**
 * Create a scope resolver with default configuration.
 *
 * @param repoRoot - Repository root path
 * @returns Object with scope resolution methods
 */
export function createScopeResolver(repoRoot: string): {
  resolve: (options?: Partial<Omit<ScopeOptions, "repoRoot">>) => Promise<ScopeResult>;
  getChangedFiles: () => Promise<ChangedFile[]>;
} {
  return {
    resolve: async (options = {}) =>
      resolveScope({
        repoRoot,
        mode: options.mode ?? "changed",
        onNoChanges: options.onNoChanges ?? "ok",
        include: options.include,
        exclude: options.exclude,
        includeSubmodules: options.includeSubmodules ?? true
      }),
    getChangedFiles: async () => getUncommittedChanges(repoRoot)
  };
}
