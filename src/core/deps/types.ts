/**
 * Dependency installation types and error taxonomy.
 *
 * This module defines the stable contract for dependency installation
 * error classification and result reporting.
 */

/**
 * Error codes for dependency installation failures.
 * These form a stable taxonomy that agents can rely on.
 */
export type DepsErrorCode =
  | "LOCKFILE_DRIFT" // lock and manifest are out of sync
  | "AUTH_REQUIRED" // registry requires authentication (401/403)
  | "NETWORK_BLOCKED" // network unavailable or blocked
  | "CACHE_CORRUPTION" // cache is corrupted, needs purge
  | "TOOLCHAIN_MISSING" // package manager not found in PATH
  | "PACKAGE_NOT_FOUND" // package does not exist on registry
  | "DISK_FULL" // no space left on device
  | "PERMISSION_DENIED" // file system permission error
  | "TIMEOUT" // command timed out
  | "UNKNOWN"; // unclassified failure

/**
 * Supported Node.js package managers.
 */
export type NodePackageManagerType = "pnpm" | "npm" | "yarn" | "bun";

/**
 * Supported Python package managers.
 */
export type PythonPackageManagerType = "uv" | "pip" | "poetry";

/**
 * All supported package managers.
 */
export type PackageManagerType = NodePackageManagerType | PythonPackageManagerType | "unknown";

/**
 * Package manager detection result for reporting.
 */
export interface PackageManagerInfo {
  readonly manager: PackageManagerType;
  readonly lockfile?: string;
  readonly lockfileExists: boolean;
  readonly manifestPath: string;
  readonly version?: string;
}

/**
 * Classified dependency error.
 */
export interface DepsError {
  readonly code: DepsErrorCode;
  readonly message: string;
  readonly details?: Record<string, unknown>;
}

/**
 * Error class for dependency installation failures.
 */
export class DepsInstallError extends Error {
  readonly code: DepsErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(code: DepsErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "DepsInstallError";
    this.code = code;
    this.details = details;
  }
}

/**
 * Next action suggestion for dependency errors.
 * Compatible with the CLI NextAction interface.
 */
export interface DepsNextAction {
  readonly kind: string;
  readonly message: string;
  readonly commands?: readonly string[];
  readonly docs?: readonly string[];
}

/**
 * Result of a dependency installation attempt.
 */
export interface InstallResult {
  readonly success: boolean;
  readonly packageManager: PackageManagerInfo;
  readonly exitCode: number | null;
  readonly durationMs: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly error?: DepsError;
}

/**
 * Options for running an install command.
 */
export interface InstallOptions {
  readonly projectRoot: string;
  readonly repoRoot: string;
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
  readonly env?: NodeJS.ProcessEnv;
}

/**
 * Result of installing dependencies for a single project.
 */
export interface ProjectInstallResult {
  readonly projectId: string;
  readonly kind: "node" | "python";
  readonly root: string;
  readonly packageManager: PackageManagerInfo;
  readonly success: boolean;
  readonly durationMs: number;
  readonly error?: DepsError;
}

/**
 * Result of installing dependencies for all projects.
 */
export interface InstallAllResult {
  readonly allSucceeded: boolean;
  readonly totalDurationMs: number;
  readonly projects: readonly ProjectInstallResult[];
  readonly notes: readonly string[];
}
