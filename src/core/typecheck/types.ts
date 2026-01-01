/**
 * Typecheck types and interfaces.
 *
 * Defines the contract for typecheck results, diagnostics, and error taxonomy.
 */

/**
 * Typecheck error codes taxonomy.
 * Stable contract for agents.
 */
export type TypecheckErrorCode =
  | "TYPECHECK_SCRIPT_MISSING" // No typecheck script in package.json
  | "TSC_NOT_FOUND" // tsc binary not in PATH
  | "PYRIGHT_NOT_FOUND" // pyright binary not in PATH
  | "TSCONFIG_MISSING" // No tsconfig.json found
  | "PYRIGHTCONFIG_MISSING" // No pyrightconfig.json (warning only)
  | "TYPECHECK_FAILED" // Typecheck ran but found errors
  | "TIMEOUT" // Command timed out
  | "PARSE_ERROR" // Failed to parse output
  | "UNKNOWN"; // Unclassified failure

/**
 * Diagnostic severity normalized across tools.
 */
export type DiagnosticSeverity = "error" | "warning" | "info" | "hint";

/**
 * Position in a file (1-based for agent friendliness).
 */
export interface Position {
  readonly line: number; // 1-based
  readonly column: number; // 1-based
}

/**
 * Range in a file.
 */
export interface Range {
  readonly start: Position;
  readonly end: Position;
  readonly encoding?: "utf16" | "utf8" | "utf32" | "unknown";
}

/**
 * Related diagnostic location.
 */
export interface RelatedDiagnostic {
  readonly file: string;
  readonly range?: Range;
  readonly message: string;
}

/**
 * Normalized diagnostic from typecheck tools.
 */
export interface TypecheckDiagnostic {
  readonly source: string; // e.g., "tsc", "pyright", "npm:typecheck"
  readonly severity: DiagnosticSeverity;
  readonly message: string;
  readonly file?: string; // Repo-relative path
  readonly range?: Range;
  readonly code?: string | number;
  readonly tags?: readonly ("unnecessary" | "deprecated")[];
  readonly related?: readonly RelatedDiagnostic[];
}

/**
 * Typecheck error details.
 */
export interface TypecheckError {
  readonly code: TypecheckErrorCode;
  readonly message: string;
  readonly details?: Record<string, unknown>;
}

/**
 * Error class for typecheck failures.
 */
export class TypecheckFailure extends Error {
  readonly code: TypecheckErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(code: TypecheckErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "TypecheckFailure";
    this.code = code;
    this.details = details;
  }
}

/**
 * Next action for typecheck errors.
 */
export interface TypecheckNextAction {
  readonly kind: string;
  readonly message: string;
  readonly commands?: readonly string[];
  readonly docs?: readonly string[];
}

/**
 * Result of typechecking a single project.
 */
export interface ProjectTypecheckResult {
  readonly projectId: string;
  readonly kind: "node" | "python";
  readonly root: string;
  readonly success: boolean;
  readonly durationMs: number;
  readonly usedFallback: boolean;
  readonly command?: string; // Sanitized command that was run
  readonly exitCode?: number | null;
  readonly diagnostics: readonly TypecheckDiagnostic[];
  readonly error?: TypecheckError;
  readonly logPath?: string;
}

/**
 * Result of typechecking all projects.
 */
export interface TypecheckAllResult {
  readonly allSucceeded: boolean;
  readonly totalDurationMs: number;
  readonly projects: readonly ProjectTypecheckResult[];
  readonly diagnostics: readonly TypecheckDiagnostic[]; // Aggregated, sorted
  readonly warnings: readonly string[];
}

/**
 * Options for running typecheck on a single project.
 */
export interface TypecheckOptions {
  readonly projectRoot: string; // Absolute path to project
  readonly repoRoot: string; // Absolute path to repo
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
  readonly env?: NodeJS.ProcessEnv;
}

/**
 * Package manager type for Node.js projects.
 */
export type NodePackageManager = "pnpm" | "npm" | "yarn" | "bun" | "unknown";

/**
 * Script detection result for Node.js projects.
 */
export interface ScriptDetectionResult {
  readonly hasTypecheckScript: boolean;
  readonly scriptName: string | null; // e.g., "typecheck", "type-check", "tsc"
  readonly hasTsconfig: boolean;
  readonly packageManager: NodePackageManager;
}
