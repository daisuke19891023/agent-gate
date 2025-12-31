import type { ExitCode } from "./exit-codes.js";

/**
 * Global options available to all commands.
 * Matches CLI contract in docs/reference/cli.md
 *
 * Note: logLevel uses kebab-case in CLI (--log-level) but camelCase here.
 * yargs automatically converts kebab-case to camelCase.
 */
export interface GlobalOptions {
  repo?: string;
  config?: string;
  scope?: "changed" | "all";
  pretty: boolean;
  "log-level": "error" | "warn" | "info" | "debug";
}

/**
 * Result returned by command handlers.
 * Commands don't directly call process.exit; they return this structure.
 */
export interface CommandResult {
  exitCode: ExitCode;
  output: unknown;
  pretty: boolean;
}

/**
 * Base structure for all command outputs.
 * All outputs include these fields per report-schema.md
 */
export interface BaseOutput {
  tool: "agent-gate";
  toolVersion: string;
  schemaVersion: number;
  command: string;
  generatedAt: string;
}

/**
 * Repository reference for outputs.
 */
export interface RepoRef {
  root: string;
  id: string;
  vcs?: {
    kind: "git";
    head?: string;
  };
}

/**
 * Project reference in analyze output.
 */
export interface AnalyzeProjectRef {
  id: string;
  kind: "node" | "python";
  name?: string;
  root: string;
  packageManager?: string;
}

/**
 * Changed file in analyze output.
 */
export interface AnalyzeChangedFile {
  path: string;
  changeType: "added" | "modified" | "deleted" | "renamed" | "copied" | "untracked";
}

/**
 * Analyze command output structure.
 */
export interface AnalyzeOutput extends BaseOutput {
  command: "analyze";
  repo: RepoRef;
  scope: {
    mode: "changed" | "all";
    changedFiles: AnalyzeChangedFile[];
    hasChanges: boolean;
  };
  projects: AnalyzeProjectRef[];
  selectedProjects: AnalyzeProjectRef[];
  warnings: string[];
  artifacts: {
    logDir: string;
    reportPath: string;
  };
}

/**
 * Step result for prepare command.
 */
export interface PrepareStep {
  name: "deps" | "toolchain";
  status: "success" | "failed" | "skipped";
  message?: string;
  durationMs?: number;
  logPath?: string;
  notes?: string[];
}

/**
 * Project install detail in prepare output.
 */
export interface PrepareProjectDetail {
  id: string;
  kind: "node" | "python";
  root: string;
  packageManager: {
    manager: string;
    lockfile?: string;
    lockfileExists: boolean;
    manifestPath: string;
    version?: string;
  };
  installResult: "success" | "failed" | "skipped";
  durationMs?: number;
  error?: {
    code: string;
    message: string;
  };
}

/**
 * Next action in prepare output.
 */
export interface PrepareNextAction {
  kind: string;
  message: string;
  commands?: string[];
  docs?: string[];
}

/**
 * Prepare command output structure.
 */
export interface PrepareOutput extends BaseOutput {
  command: "prepare";
  repo: RepoRef;
  steps: PrepareStep[];
  projects?: PrepareProjectDetail[];
  nextActions: PrepareNextAction[];
  artifacts: {
    logDir: string;
    reportPath: string;
  };
}

/**
 * Validate command output structure (ValidationReport).
 */
export interface ValidateOutput extends BaseOutput {
  command: "validate";
  repo: RepoRef;
  scope: {
    mode: "changed" | "all";
    changedFiles: string[];
    selectedProjects: ValidateProjectRef[];
    potentiallyImpactedProjects: ValidateProjectRef[];
  };
  environment: {
    runtime: {
      provider: string;
      networkPolicy: string;
    };
    fingerprints: Record<string, string>;
  };
  steps: ValidateStepResult[];
  diagnostics: ValidateDiagnostic[];
  warnings: ValidateWarning[];
  nextActions: ValidateNextAction[];
  summary: {
    ok: boolean;
    errors: number;
    warnings: number;
    durationMs: number;
  };
  artifacts: {
    logDir: string;
    reportPath: string;
  };
}

export interface ValidateProjectRef {
  id: string;
  kind: "node" | "python" | "java" | "csharp" | "unknown";
  name?: string;
  root: string;
  packageManager?: string;
  language?: string;
}

export interface ValidateStepResult {
  name: "deps" | "typecheck" | "compile" | "lspDiagnostics" | "tests";
  status: "ok" | "failed" | "skipped";
  startedAt?: string;
  durationMs?: number;
  command?: string;
  exitCode?: number;
  logPath?: string;
  notes?: string[];
}

export interface ValidateWarning {
  kind: string;
  message: string;
  projectId?: string;
  details?: Record<string, unknown>;
}

export interface ValidateNextAction {
  kind: string;
  message: string;
  commands?: string[];
  docs?: string[];
}

export interface ValidateDiagnostic {
  source: string;
  severity: "error" | "warning" | "info" | "hint";
  message: string;
  file?: string;
  range?: ValidateRange;
  code?: string | number;
  tags?: Array<"unnecessary" | "deprecated">;
  related?: ValidateRelatedDiagnostic[];
}

export interface ValidateRelatedDiagnostic {
  message: string;
  file?: string;
  range?: ValidateRange;
}

export interface ValidateRange {
  start: ValidatePosition;
  end: ValidatePosition;
  encoding?: "utf16" | "utf8" | "utf32" | "unknown";
}

export interface ValidatePosition {
  line: number;
  column: number;
}

/**
 * Daemon command output structure.
 */
export interface DaemonOutput extends BaseOutput {
  command: "daemon";
  action: "status" | "stop";
  status: "running" | "stopped" | "not_found";
  pid?: number;
  uptime?: number;
}
