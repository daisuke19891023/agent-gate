/**
 * Node workspace detection utilities.
 *
 * Detects package manager and workspace configuration from lockfiles and config.
 */

import fs from "node:fs/promises";
import path from "node:path";
import type { NodePackageManager } from "../types.js";

/**
 * Lockfile names and their corresponding package managers.
 */
const LOCKFILE_MAP: Record<string, NodePackageManager> = {
  "pnpm-lock.yaml": "pnpm",
  "package-lock.json": "npm",
  "yarn.lock": "yarn",
  "bun.lockb": "npm" // Treat bun as npm-compatible for now
};

/**
 * Order of priority when multiple lockfiles exist.
 */
const LOCKFILE_PRIORITY: readonly string[] = [
  "pnpm-lock.yaml",
  "yarn.lock",
  "package-lock.json",
  "bun.lockb"
];

/**
 * Detect the package manager by looking for lockfiles.
 *
 * @param repoRoot - Repository root directory
 * @returns Detected package manager or 'unknown'
 */
export async function detectPackageManager(repoRoot: string): Promise<NodePackageManager> {
  for (const lockfile of LOCKFILE_PRIORITY) {
    const lockfilePath = path.join(repoRoot, lockfile);
    try {
      await fs.access(lockfilePath);
      return LOCKFILE_MAP[lockfile] ?? "unknown";
    } catch {
      // File doesn't exist, continue
    }
  }

  return "unknown";
}

/**
 * Check if a directory has a pnpm workspace configuration.
 *
 * @param repoRoot - Repository root directory
 * @returns true if pnpm-workspace.yaml exists
 */
export async function hasPnpmWorkspace(repoRoot: string): Promise<boolean> {
  try {
    await fs.access(path.join(repoRoot, "pnpm-workspace.yaml"));
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if a directory has npm/yarn workspaces in package.json.
 *
 * @param repoRoot - Repository root directory
 * @returns true if package.json has workspaces field
 */
export async function hasPackageJsonWorkspaces(repoRoot: string): Promise<boolean> {
  try {
    const packageJsonPath = path.join(repoRoot, "package.json");
    const content = await fs.readFile(packageJsonPath, "utf-8");
    const pkg = JSON.parse(content) as { workspaces?: unknown };
    return "workspaces" in pkg && pkg.workspaces !== undefined;
  } catch {
    return false;
  }
}

/**
 * Check if the repository uses workspaces (monorepo pattern).
 *
 * @param repoRoot - Repository root directory
 * @param packageManager - Package manager type
 * @returns true if workspaces are configured
 */
export async function hasWorkspaces(
  repoRoot: string,
  packageManager: NodePackageManager
): Promise<boolean> {
  if (packageManager === "pnpm") {
    return hasPnpmWorkspace(repoRoot);
  }

  // npm and yarn use package.json workspaces
  return hasPackageJsonWorkspaces(repoRoot);
}

/**
 * Read package.json from a directory.
 *
 * @param dir - Directory containing package.json
 * @returns Parsed package.json or null if not found
 */
export async function readPackageJson(
  dir: string
): Promise<{ name?: string; workspaces?: string[] | { packages?: string[] } } | null> {
  try {
    const packageJsonPath = path.join(dir, "package.json");
    const content = await fs.readFile(packageJsonPath, "utf-8");
    return JSON.parse(content) as {
      name?: string;
      workspaces?: string[] | { packages?: string[] };
    };
  } catch {
    return null;
  }
}
