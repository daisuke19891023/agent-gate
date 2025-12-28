/**
 * Git diff detection for uncommitted changes.
 *
 * Detects both staged and unstaged changes, as well as untracked files.
 */

import { runCommand } from "../process/run-command.js";
import type { ChangedFile, ChangeType } from "./types.js";
import { ScopeError } from "./types.js";

/**
 * Status codes from git status --porcelain=v1
 * First character: index status, Second character: worktree status
 */
const STATUS_MAP: Record<string, ChangeType> = {
  M: "modified",
  A: "added",
  D: "deleted",
  R: "renamed",
  C: "copied",
  "?": "untracked"
};

/**
 * Parse a status character to a ChangeType.
 */
function parseStatusChar(char: string): ChangeType {
  return STATUS_MAP[char] ?? "modified";
}

/**
 * Parse git status --porcelain=v1 output into ChangedFile array.
 *
 * Porcelain v1 format:
 * XY PATH
 * XY ORIG_PATH -> PATH (for renames/copies)
 *
 * Where X is the index status and Y is the worktree status.
 *
 * @param output - Raw output from git status --porcelain
 * @returns Array of ChangedFile objects
 */
function parseGitStatusOutput(output: string): ChangedFile[] {
  const lines = output.split("\n").filter((line) => line.length > 0);
  const files: ChangedFile[] = [];

  for (const line of lines) {
    // Format: "XY PATH" or "XY ORIG -> PATH" for renames
    const indexStatus = line[0];
    const worktreeStatus = line[1];
    const pathPart = line.slice(3); // Skip "XY "

    // Handle renames and copies
    const arrowMatch = pathPart.match(/^(.+) -> (.+)$/);
    let filePath: string;
    let originalPath: string | undefined;

    if (arrowMatch) {
      originalPath = arrowMatch[1]?.replace(/^"|"$/g, "") ?? "";
      filePath = arrowMatch[2]?.replace(/^"|"$/g, "") ?? "";
    } else {
      filePath = pathPart.replace(/^"|"$/g, "");
    }

    // Normalize path separators
    filePath = filePath.replace(/\\/g, "/");
    if (originalPath) {
      originalPath = originalPath.replace(/\\/g, "/");
    }

    // Determine the change type
    // If index has a status, use that; otherwise use worktree status
    let changeType: ChangeType;

    if (indexStatus === "?" || worktreeStatus === "?") {
      changeType = "untracked";
    } else if (indexStatus === "R" || worktreeStatus === "R") {
      changeType = "renamed";
    } else if (indexStatus === "C" || worktreeStatus === "C") {
      changeType = "copied";
    } else if (indexStatus === "A") {
      changeType = "added";
    } else if (indexStatus === "D" || worktreeStatus === "D") {
      changeType = "deleted";
    } else if (indexStatus === "M" || worktreeStatus === "M") {
      changeType = "modified";
    } else if (indexStatus !== " " && indexStatus) {
      changeType = parseStatusChar(indexStatus);
    } else if (worktreeStatus !== " " && worktreeStatus) {
      changeType = parseStatusChar(worktreeStatus);
    } else {
      continue; // No change
    }

    const file: ChangedFile = {
      path: filePath,
      changeType,
      ...(originalPath && { originalPath })
    };

    files.push(file);
  }

  return files;
}

/**
 * Check if git is available in the system.
 *
 * @returns true if git is available
 */
export async function isGitAvailable(): Promise<boolean> {
  try {
    const result = await runCommand({
      command: "git",
      args: ["--version"],
      timeoutMs: 5000
    });
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

/**
 * Check if a directory is inside a git repository.
 *
 * @param cwd - Directory to check
 * @returns true if inside a git repository
 */
export async function isGitRepository(cwd: string): Promise<boolean> {
  try {
    const result = await runCommand({
      command: "git",
      args: ["rev-parse", "--git-dir"],
      cwd,
      timeoutMs: 5000
    });
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

/**
 * Check if the repository has any commits.
 *
 * @param cwd - Repository root
 * @returns true if the repo has at least one commit
 */
export async function hasCommits(cwd: string): Promise<boolean> {
  try {
    const result = await runCommand({
      command: "git",
      args: ["rev-parse", "HEAD"],
      cwd,
      timeoutMs: 5000
    });
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

/**
 * Get uncommitted changes in a git repository.
 *
 * This includes:
 * - Staged changes (git add)
 * - Unstaged changes (modified but not staged)
 * - Untracked files
 *
 * @param repoRoot - Root directory of the git repository
 * @param options - Options for the git command
 * @returns Array of changed files
 */
export async function getUncommittedChanges(
  repoRoot: string,
  options: {
    includeUntracked?: boolean;
    timeoutMs?: number;
    signal?: AbortSignal;
  } = {}
): Promise<ChangedFile[]> {
  const { includeUntracked = true, timeoutMs = 30000, signal } = options;

  // Check if git is available
  if (!(await isGitAvailable())) {
    throw new ScopeError("GIT_NOT_FOUND", "Git is not installed or not in PATH");
  }

  // Check if this is a git repository
  if (!(await isGitRepository(repoRoot))) {
    throw new ScopeError("NOT_A_GIT_REPO", `Not a git repository: ${repoRoot}`, {
      repoRoot
    });
  }

  // Build git status arguments
  const args = ["status", "--porcelain"];

  // Include untracked files if requested
  if (includeUntracked) {
    args.push("-uall"); // Show all untracked files
  } else {
    args.push("-uno"); // Don't show untracked files
  }

  // Run git status
  const result = await runCommand({
    command: "git",
    args,
    cwd: repoRoot,
    timeoutMs,
    signal
  });

  if (result.exitCode !== 0) {
    throw new ScopeError(
      "GIT_COMMAND_FAILED",
      `git status failed with exit code ${result.exitCode}`,
      {
        exitCode: result.exitCode,
        stderr: result.stderr,
        command: `git ${args.join(" ")}`
      }
    );
  }

  // Parse the output
  const files = parseGitStatusOutput(result.stdout);

  // Sort by path for deterministic output
  files.sort((a, b) => a.path.localeCompare(b.path));

  return files;
}

/**
 * Get staged changes only.
 *
 * @param repoRoot - Root directory of the git repository
 * @param options - Options for the git command
 * @returns Array of staged files
 */
export async function getStagedChanges(
  repoRoot: string,
  options: {
    timeoutMs?: number;
    signal?: AbortSignal;
  } = {}
): Promise<ChangedFile[]> {
  const { timeoutMs = 30000, signal } = options;

  // Check if git is available
  if (!(await isGitAvailable())) {
    throw new ScopeError("GIT_NOT_FOUND", "Git is not installed or not in PATH");
  }

  // Check if this is a git repository
  if (!(await isGitRepository(repoRoot))) {
    throw new ScopeError("NOT_A_GIT_REPO", `Not a git repository: ${repoRoot}`, {
      repoRoot
    });
  }

  // Check if there are any commits
  const hasAnyCommits = await hasCommits(repoRoot);

  let result;
  if (hasAnyCommits) {
    // Normal case: compare against HEAD
    result = await runCommand({
      command: "git",
      args: ["diff", "--cached", "--name-status"],
      cwd: repoRoot,
      timeoutMs,
      signal
    });
  } else {
    // Fresh repo without commits: all staged files are "new"
    result = await runCommand({
      command: "git",
      args: ["diff", "--cached", "--name-only"],
      cwd: repoRoot,
      timeoutMs,
      signal
    });

    // For fresh repos, treat all files as added
    if (result.exitCode === 0 && result.stdout) {
      const files: ChangedFile[] = result.stdout
        .split("\n")
        .filter((line) => line.length > 0)
        .map((path) => ({
          path: path.replace(/\\/g, "/"),
          changeType: "added" as const
        }));

      files.sort((a, b) => a.path.localeCompare(b.path));
      return files;
    }
  }

  if (result.exitCode !== 0) {
    throw new ScopeError(
      "GIT_COMMAND_FAILED",
      `git diff --cached failed with exit code ${result.exitCode}`,
      {
        exitCode: result.exitCode,
        stderr: result.stderr
      }
    );
  }

  // Parse the output (format: "STATUS\tPATH" or "STATUS\tORIG\tPATH" for renames)
  const lines = result.stdout.split("\n").filter((line) => line.length > 0);
  const files: ChangedFile[] = [];

  for (const line of lines) {
    const parts = line.split("\t");
    if (parts.length < 2) continue;

    const status = parts[0]?.[0] ?? "";
    const changeType = parseStatusChar(status);

    let filePath: string;
    let originalPath: string | undefined;

    if (parts.length === 3 && (status === "R" || status === "C")) {
      // Rename or copy: STATUS\tORIG\tNEW
      originalPath = parts[1]?.replace(/\\/g, "/");
      filePath = parts[2]?.replace(/\\/g, "/") ?? "";
    } else {
      filePath = parts[1]?.replace(/\\/g, "/") ?? "";
    }

    files.push({
      path: filePath,
      changeType,
      ...(originalPath && { originalPath })
    });
  }

  files.sort((a, b) => a.path.localeCompare(b.path));
  return files;
}

/**
 * Get list of submodules in the repository.
 *
 * @param repoRoot - Root directory of the git repository
 * @returns Array of submodule paths (repo-relative)
 */
export async function getSubmodules(repoRoot: string): Promise<string[]> {
  try {
    const result = await runCommand({
      command: "git",
      args: ["submodule", "status", "--recursive"],
      cwd: repoRoot,
      timeoutMs: 10000
    });

    if (result.exitCode !== 0) {
      return [];
    }

    // Parse submodule status output
    // Format: " HASH path (description)" or "+HASH path (description)" for modified
    const submodules: string[] = [];
    const lines = result.stdout.split("\n").filter((line) => line.length > 0);

    for (const line of lines) {
      // Skip the first character (status) and hash, get the path
      const match = line.match(/^[ +-]?[a-f0-9]+ (.+?)(?: \(.+\))?$/);
      if (match?.[1]) {
        submodules.push(match[1].replace(/\\/g, "/"));
      }
    }

    submodules.sort();
    return submodules;
  } catch {
    return [];
  }
}

/**
 * Get changes in submodules.
 *
 * @param repoRoot - Root directory of the main repository
 * @returns Array of changed files with gitRoot set to the submodule path
 */
export async function getSubmoduleChanges(repoRoot: string): Promise<ChangedFile[]> {
  const submodules = await getSubmodules(repoRoot);
  const allChanges: ChangedFile[] = [];

  for (const submodulePath of submodules) {
    const submoduleRoot = `${repoRoot}/${submodulePath}`;

    try {
      const changes = await getUncommittedChanges(submoduleRoot);

      // Add gitRoot to each change and prefix the path with submodule path
      for (const change of changes) {
        allChanges.push({
          ...change,
          path: `${submodulePath}/${change.path}`,
          gitRoot: submodulePath
        });
      }
    } catch {
      // Submodule might not be initialized or accessible
      continue;
    }
  }

  allChanges.sort((a, b) => a.path.localeCompare(b.path));
  return allChanges;
}
