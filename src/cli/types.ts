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
  scope: "changed" | "all";
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
  repo: {
    root: string;
    id: string;
  };
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
 * Prepare command output structure.
 */
export interface PrepareOutput extends BaseOutput {
  command: "prepare";
  repo: {
    root: string;
    id: string;
  };
  steps: unknown[];
  nextActions: unknown[];
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
  repo: {
    root: string;
    id: string;
  };
  scope: {
    mode: "changed" | "all";
    changedFiles: string[];
    selectedProjects: unknown[];
    potentiallyImpactedProjects: unknown[];
  };
  environment: {
    runtime: {
      provider: string;
      networkPolicy: string;
    };
    fingerprints: Record<string, string>;
  };
  steps: unknown[];
  diagnostics: unknown[];
  warnings: string[];
  nextActions: unknown[];
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
