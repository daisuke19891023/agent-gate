/**
 * Type definitions for project detection.
 *
 * Provides interfaces for detecting and describing projects in monorepos.
 */

/**
 * Project kinds supported by the detector.
 */
export type ProjectKind = "node" | "python";

/**
 * Package manager types for Node projects.
 */
export type NodePackageManager = "pnpm" | "npm" | "yarn" | "unknown";

/**
 * Package manager types for Python projects.
 */
export type PythonPackageManager = "uv" | "poetry" | "pip" | "unknown";

/**
 * Reference to a detected project.
 */
export interface ProjectRef {
  /**
   * Unique identifier for the project.
   * Format: `${kind}:${name}` or `${kind}:${root}` if name is not available.
   */
  readonly id: string;

  /**
   * Project kind (node or python).
   */
  readonly kind: ProjectKind;

  /**
   * Human-readable name of the project.
   * For Node: package.json name field.
   * For Python: pyproject.toml project.name or tool.poetry.name.
   */
  readonly name?: string;

  /**
   * Root directory of the project (repo-relative path with forward slashes).
   */
  readonly root: string;

  /**
   * Package manager used by the project.
   */
  readonly packageManager?: NodePackageManager | PythonPackageManager;
}

/**
 * Result of Node project detection.
 */
export interface NodeDetectionResult {
  /**
   * Detected package manager.
   */
  readonly packageManager: NodePackageManager;

  /**
   * List of detected packages.
   */
  readonly packages: readonly ProjectRef[];

  /**
   * Whether the root is a monorepo with workspaces.
   */
  readonly isMonorepo: boolean;

  /**
   * Root package.json name if available.
   */
  readonly rootName?: string;
}

/**
 * Result of Python project detection.
 */
export interface PythonDetectionResult {
  /**
   * Detected package manager.
   */
  readonly packageManager: PythonPackageManager;

  /**
   * List of detected projects.
   */
  readonly projects: readonly ProjectRef[];

  /**
   * Whether multiple pyproject.toml files were found.
   */
  readonly isMultiProject: boolean;
}

/**
 * Warning during project detection.
 */
export interface ProjectWarning {
  /**
   * Warning code.
   */
  readonly code: ProjectWarningCode;

  /**
   * Human-readable warning message.
   */
  readonly message: string;

  /**
   * Related file path if applicable.
   */
  readonly path?: string;

  /**
   * Additional context.
   */
  readonly context?: Record<string, unknown>;
}

/**
 * Warning codes for project detection.
 */
export type ProjectWarningCode =
  | "UNASSIGNED_FILE"
  | "PARSE_ERROR"
  | "MISSING_NAME"
  | "MULTIPLE_MATCHES"
  | "DETECTION_FAILED";

/**
 * Overall project detection result.
 */
export interface ProjectDetectionResult {
  /**
   * All detected projects (sorted by root path).
   */
  readonly projects: readonly ProjectRef[];

  /**
   * Projects that have changes (when changedFiles is provided).
   */
  readonly selectedProjects: readonly ProjectRef[];

  /**
   * Warnings generated during detection.
   */
  readonly warnings: readonly ProjectWarning[];
}

/**
 * Options for project detection.
 */
export interface ProjectDetectionOptions {
  /**
   * Repository root path.
   */
  readonly repoRoot: string;

  /**
   * Which project types to detect.
   * @default ['node', 'python']
   */
  readonly kinds?: readonly ProjectKind[];

  /**
   * Changed files to map to projects.
   * If not provided, only detection is performed.
   */
  readonly changedFiles?: readonly { path: string }[];

  /**
   * Glob patterns to exclude from detection.
   */
  readonly exclude?: readonly string[];
}

/**
 * Error codes for project detection failures.
 */
export type ProjectErrorCode = "INVALID_ROOT" | "DETECTION_FAILED" | "PARSE_ERROR" | "IO_ERROR";

/**
 * Error during project detection.
 */
export class ProjectError extends Error {
  constructor(
    public readonly code: ProjectErrorCode,
    message: string,
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = "ProjectError";
  }
}
