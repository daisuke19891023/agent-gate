/**
 * Scope resolution types.
 *
 * This module provides types for detecting changed files and resolving
 * the scope of validation (which projects/files to validate).
 */

/**
 * Type of change detected for a file.
 */
export type ChangeType = "added" | "modified" | "deleted" | "renamed" | "copied" | "untracked";

/**
 * A file that has been changed in the repository.
 */
export interface ChangedFile {
  /**
   * Repository-relative path to the file.
   * Uses forward slashes regardless of platform.
   */
  readonly path: string;

  /**
   * Type of change detected.
   */
  readonly changeType: ChangeType;

  /**
   * For renamed or copied files, the original path.
   */
  readonly originalPath?: string;

  /**
   * The git root this file belongs to.
   * For submodules, this may differ from the main repo root.
   */
  readonly gitRoot?: string;
}

/**
 * Information about a detected git root.
 */
export interface GitRootInfo {
  /**
   * Absolute path to the git root directory.
   */
  readonly path: string;

  /**
   * Whether this is a git submodule.
   */
  readonly isSubmodule: boolean;

  /**
   * Whether this is a git worktree.
   */
  readonly isWorktree: boolean;

  /**
   * Path to the actual .git directory or file.
   */
  readonly gitPath: string;

  /**
   * For worktrees/submodules, the path referenced in the .git file.
   */
  readonly gitDir?: string;
}

/**
 * Result of scope resolution.
 */
export interface ScopeResult {
  /**
   * The scope mode that was used.
   */
  readonly mode: "changed" | "all";

  /**
   * List of changed files (sorted by path for determinism).
   */
  readonly changedFiles: readonly ChangedFile[];

  /**
   * Whether any changes were detected.
   */
  readonly hasChanges: boolean;

  /**
   * All detected git roots in the repository.
   * Includes the main repo and any submodules.
   */
  readonly gitRoots: readonly GitRootInfo[];

  /**
   * The main repository root.
   */
  readonly repoRoot: string;
}

/**
 * Options for scope resolution.
 */
export interface ScopeOptions {
  /**
   * Absolute path to the repository root.
   */
  readonly repoRoot: string;

  /**
   * Scope mode: 'changed' for uncommitted changes only, 'all' for all files.
   */
  readonly mode: "changed" | "all";

  /**
   * Behavior when no changes are detected.
   * - 'ok': Return success with empty changedFiles
   * - 'skip': Return success but mark as skipped
   * - 'fail': Return an error
   */
  readonly onNoChanges: "ok" | "skip" | "fail";

  /**
   * Glob patterns to include. If not specified, all files are included.
   */
  readonly include?: readonly string[];

  /**
   * Glob patterns to exclude.
   */
  readonly exclude?: readonly string[];

  /**
   * Whether to include submodule changes.
   * @default true
   */
  readonly includeSubmodules?: boolean;
}

/**
 * Error codes for scope resolution failures.
 */
export type ScopeErrorCode =
  | "GIT_NOT_FOUND"
  | "NOT_A_GIT_REPO"
  | "GIT_COMMAND_FAILED"
  | "NO_CHANGES_FAIL"
  | "INVALID_REPO_ROOT";

/**
 * Error thrown during scope resolution.
 */
export class ScopeError extends Error {
  readonly code: ScopeErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(code: ScopeErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "ScopeError";
    this.code = code;
    this.details = details;
  }
}

/**
 * Next action suggestion for scope resolution errors.
 */
export interface ScopeNextAction {
  readonly kind: string;
  readonly message: string;
  readonly commands?: readonly string[];
}

/**
 * Get suggested next actions for a scope error.
 */
export function getScopeNextActions(error: ScopeError): readonly ScopeNextAction[] {
  switch (error.code) {
    case "GIT_NOT_FOUND":
      return [
        {
          kind: "install-toolchain",
          message: "Git is required but not found in PATH.",
          commands: ["apt-get install git", "brew install git"]
        }
      ];
    case "NOT_A_GIT_REPO":
      return [
        {
          kind: "check-usage",
          message: "Run agent-gate from within a git repository.",
          commands: ["git init"]
        }
      ];
    case "GIT_COMMAND_FAILED":
      return [
        {
          kind: "check-git-state",
          message: "Check git repository state and permissions.",
          commands: ["git status"]
        }
      ];
    case "NO_CHANGES_FAIL":
      return [
        {
          kind: "check-scope",
          message: "No uncommitted changes detected. Use --scope=all to validate all files."
        }
      ];
    case "INVALID_REPO_ROOT":
      return [
        {
          kind: "check-usage",
          message: "Specify a valid repository root with --repo."
        }
      ];
    default:
      return [];
  }
}
