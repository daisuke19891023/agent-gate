/**
 * Scope module for detecting changed files and resolving validation scope.
 *
 * Provides utilities for:
 * - Detecting uncommitted changes in git repositories
 * - Finding git roots including submodules and worktrees
 * - Resolving which files/projects to validate
 */

// Types
export type {
  ChangeType,
  ChangedFile,
  GitRootInfo,
  ScopeResult,
  ScopeOptions,
  ScopeErrorCode,
  ScopeNextAction
} from "./types.js";

export { ScopeError, getScopeNextActions } from "./types.js";

// Git diff detection
export {
  isGitAvailable,
  isGitRepository,
  hasCommits,
  getUncommittedChanges,
  getStagedChanges,
  getSubmodules,
  getSubmoduleChanges
} from "./git-diff.js";

// Git root finder
export {
  findGitRootForFile,
  findAllGitRoots,
  isFileInSubmodule,
  createGitRootFinder
} from "./git-root-finder.js";

// Scope resolver
export { resolveScope, createScopeResolver } from "./scope-resolver.js";
