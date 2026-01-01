import { randomUUID } from "node:crypto";
import type {
  CommandResult,
  ValidateOutput,
  ValidateStepResult,
  ValidateDiagnostic,
  ValidateNextAction
} from "../types.js";
import { ExitCode } from "../exit-codes.js";
import { version } from "../version.js";
import { ensureValidConfig, isCommandResult } from "../config.js";
import { ensureLogDir, resolveArtifacts, resolveLogLevel, writeReportFile } from "../artifacts.js";
import { createErrorOutput } from "../output.js";
import { createJsonLogger } from "../../core/logger.js";
import { ensureDaemonRunning } from "../../daemon/manager.js";
import { resolveNetworkPolicy } from "../../core/runtime/network-policy.js";
import { checkDependencyStatus } from "../../core/runtime/deps-check.js";
import { resolveProvider } from "../../providers/resolve-provider.js";
import { resolveScope, ScopeError, getScopeNextActions } from "../../core/scope/index.js";
import { detectProjects } from "../../core/projects/index.js";
import type { ChangedFile } from "../../core/scope/types.js";
import { getRepoInfo } from "../../core/repo/repo-info.js";
import { createTypecheckEngine, getTypecheckNextActions } from "../../core/typecheck/index.js";

interface ValidateArgs {
  repo?: string;
  config?: string;
  scope?: "changed" | "all";
  pretty: boolean;
  "log-level": "error" | "warn" | "info" | "debug";
}

async function handler(args: ValidateArgs): Promise<CommandResult> {
  const startTime = Date.now();
  const repoRoot = args.repo ?? process.cwd();
  const configResult = await ensureValidConfig({
    configPath: args.config,
    repoRoot,
    pretty: args.pretty,
    env: process.env
  });
  if (isCommandResult(configResult)) {
    return configResult;
  }

  const repoInfo = await getRepoInfo(repoRoot);
  const sessionId = randomUUID();
  const artifacts = resolveArtifacts(repoRoot, "validate", configResult.config, process.env);
  await ensureLogDir(artifacts.logDirAbsolute);
  const logLevel = resolveLogLevel(args["log-level"], process.env);
  const logger = createJsonLogger({
    logDirAbsolute: artifacts.logDirAbsolute,
    level: logLevel,
    context: {
      repoId: repoInfo.id,
      sessionId,
      command: "validate"
    },
    step: "bootstrap"
  });
  logger.info("validate command started", {
    repoRoot,
    logDir: artifacts.logDir,
    reportPath: artifacts.reportPath
  });

  await ensureDaemonRunning({
    repoRoot,
    logDirAbsolute: artifacts.logDirAbsolute,
    logLevel
  });

  const warnings: string[] = [];
  const requestedScopeMode: "changed" | "all" =
    args.scope ?? configResult.config.scope?.defaultMode ?? "changed";
  const onNoChanges = configResult.config.scope?.onNoChanges ?? "ok";
  let changedFiles: ChangedFile[] = [];
  let hasChanges = false;
  let scopeFailed = false;

  // Resolve scope (detect git changes) if mode is 'changed'
  if (requestedScopeMode === "changed") {
    logger.info("resolving scope", { mode: requestedScopeMode });
    try {
      const scopeResult = await resolveScope({
        repoRoot,
        mode: requestedScopeMode,
        onNoChanges,
        include: configResult.config.scope?.include,
        exclude: configResult.config.scope?.exclude
      });
      changedFiles = [...scopeResult.changedFiles];
      hasChanges = scopeResult.hasChanges;
      logger.info("scope resolved", {
        mode: requestedScopeMode,
        changedFileCount: changedFiles.length,
        hasChanges
      });
    } catch (error) {
      if (error instanceof ScopeError) {
        logger.warn("scope resolution failed", { error: error.message, code: error.code });
        if (error.code === "NO_CHANGES_FAIL") {
          const nextActions = getScopeNextActions(error).map((action) => ({
            kind: action.kind,
            message: action.message,
            commands: action.commands ? [...action.commands] : undefined,
            docs: ["docs/reference/cli.md"]
          }));
          return {
            exitCode: ExitCode.UserError,
            output: createErrorOutput({
              category: "usage",
              message: error.message,
              details: error.details,
              nextActions
            }),
            pretty: args.pretty
          };
        }
        warnings.push(`SCOPE_RESOLUTION_FAILED: ${error.message}`);
        scopeFailed = true;
      } else {
        throw error;
      }
    }
    if (!hasChanges && onNoChanges === "skip") {
      warnings.push(
        "NO_CHANGES_SKIPPED: No uncommitted changes detected; validation steps skipped."
      );
    }
  } else {
    logger.info("scope mode is all, skipping git diff detection");
  }

  // Detect projects
  logger.info("detecting projects", { repoRoot });
  const projectResult = await detectProjects({
    repoRoot,
    kinds: ["node", "python"],
    changedFiles: changedFiles.map((f) => ({ path: f.path })),
    exclude: configResult.config.scope?.exclude
  });

  // Add project detection warnings
  for (const warning of projectResult.warnings) {
    warnings.push(`${warning.code}: ${warning.message}`);
  }

  logger.info("projects detected", {
    totalProjects: projectResult.projects.length,
    selectedProjects: projectResult.selectedProjects.length
  });

  const networkPolicy = resolveNetworkPolicy("validate", configResult.config.runtime?.network);
  const { kind: runtimeProvider } = await resolveProvider(configResult.config.runtime?.provider);
  const skipValidation =
    requestedScopeMode === "changed" && !hasChanges && onNoChanges !== "fail" && !scopeFailed;
  const dependencyStatus = skipValidation
    ? { required: false, missing: false, reasons: [] as string[] }
    : await checkDependencyStatus(repoRoot);
  const networkBlocked =
    !skipValidation && networkPolicy === "deny-all" && dependencyStatus.missing;

  const steps: ValidateStepResult[] = [];
  const diagnostics: ValidateDiagnostic[] = [];
  const nextActions: ValidateNextAction[] = [];

  // Skip notes for when validation is skipped
  const skipNotes = ["Skipped because no uncommitted changes were detected."];

  if (skipValidation) {
    // All steps skipped
    steps.push(
      { name: "deps", status: "skipped", notes: skipNotes },
      { name: "typecheck", status: "skipped", notes: skipNotes },
      { name: "lspDiagnostics", status: "skipped", notes: skipNotes }
    );
  } else if (networkBlocked) {
    // Network blocked - deps failed, others skipped
    const depsNotes = [
      "Dependency acquisition blocked by network policy.",
      ...dependencyStatus.reasons
    ];
    const skippedNotes = ["Skipped because dependency acquisition was blocked by network policy."];

    steps.push(
      { name: "deps", status: "failed", notes: depsNotes },
      { name: "typecheck", status: "skipped", notes: skippedNotes },
      { name: "lspDiagnostics", status: "skipped", notes: skippedNotes }
    );

    diagnostics.push({
      source: "deps",
      severity: "error",
      code: "NETWORK_BLOCKED",
      message: "Dependencies are missing and network access is blocked during validate."
    });

    nextActions.push({
      kind: "run-prepare",
      message: "Run prepare with network access enabled to fetch dependencies.",
      commands: ["agent-gate prepare"],
      docs: ["docs/reference/cli.md"]
    });
  } else {
    // Normal validation flow
    const depsStartTime = Date.now();

    // Step 1: Deps check (assuming deps are already installed via prepare)
    const depsStep: ValidateStepResult = {
      name: "deps",
      status: dependencyStatus.missing ? "failed" : "ok",
      durationMs: Date.now() - depsStartTime,
      notes: dependencyStatus.reasons.length > 0 ? dependencyStatus.reasons : undefined
    };
    steps.push(depsStep);

    if (dependencyStatus.missing) {
      diagnostics.push({
        source: "deps",
        severity: "error",
        code: "DEPS_MISSING",
        message: "Dependencies are missing. Run prepare first."
      });
      nextActions.push({
        kind: "run-prepare",
        message: "Run prepare to install dependencies.",
        commands: ["agent-gate prepare"],
        docs: ["docs/reference/cli.md"]
      });
    }

    // Step 2: Typecheck
    if (projectResult.selectedProjects.length > 0) {
      logger.info("running typecheck", { step: "typecheck" });
      const typecheckStartTime = Date.now();

      const typecheckEngine = createTypecheckEngine({
        repoRoot,
        timeoutMs: 120_000, // 2 minutes default
        config: configResult.config
      });

      const typecheckResult = await typecheckEngine.typecheckAll(projectResult.selectedProjects);
      const typecheckDurationMs = Date.now() - typecheckStartTime;

      // Add typecheck warnings
      for (const warning of typecheckResult.warnings) {
        warnings.push(warning);
      }

      // Convert diagnostics
      for (const diag of typecheckResult.diagnostics) {
        diagnostics.push({
          source: diag.source,
          severity: diag.severity,
          message: diag.message,
          file: diag.file,
          range: diag.range
            ? {
                start: { line: diag.range.start.line, column: diag.range.start.column },
                end: { line: diag.range.end.line, column: diag.range.end.column },
                encoding: diag.range.encoding
              }
            : undefined,
          code: diag.code,
          tags: diag.tags ? [...diag.tags] : undefined
        });
      }

      // Collect nextActions from failed projects
      for (const project of typecheckResult.projects) {
        if (project.error) {
          const actions = getTypecheckNextActions(project.error);
          for (const action of actions) {
            // Avoid duplicates
            if (!nextActions.some((a) => a.kind === action.kind)) {
              nextActions.push({
                kind: action.kind,
                message: action.message,
                commands: action.commands ? [...action.commands] : undefined,
                docs: action.docs ? [...action.docs] : undefined
              });
            }
          }
        }
      }

      const typecheckStep: ValidateStepResult = {
        name: "typecheck",
        status: typecheckResult.allSucceeded ? "ok" : "failed",
        durationMs: typecheckDurationMs,
        notes: typecheckResult.warnings.length > 0 ? [...typecheckResult.warnings] : undefined
      };
      steps.push(typecheckStep);

      logger.info("typecheck completed", {
        success: typecheckResult.allSucceeded,
        durationMs: typecheckDurationMs,
        diagnosticCount: typecheckResult.diagnostics.length
      });
    } else {
      // No projects to typecheck
      steps.push({
        name: "typecheck",
        status: "skipped",
        notes: ["No projects selected for typecheck."]
      });
    }

    // Step 3: LSP Diagnostics (not yet implemented)
    steps.push({
      name: "lspDiagnostics",
      status: "skipped",
      notes: ["LSP diagnostics not yet implemented."]
    });
  }

  // Calculate summary
  const errorCount = diagnostics.filter((d) => d.severity === "error").length;
  const warningCount = diagnostics.filter((d) => d.severity === "warning").length;
  const allStepsOk = steps.every((s) => s.status === "ok" || s.status === "skipped");
  const totalDurationMs = Date.now() - startTime;

  // Sort warnings for determinism
  warnings.sort();

  const output: ValidateOutput = {
    tool: "agent-gate",
    toolVersion: version,
    schemaVersion: 1,
    command: "validate",
    generatedAt: new Date().toISOString(),
    repo: {
      root: repoRoot,
      id: repoInfo.id,
      ...(repoInfo.vcs ? { vcs: repoInfo.vcs } : {})
    },
    scope: {
      mode: requestedScopeMode,
      changedFiles: changedFiles.map((f) => f.path),
      selectedProjects: projectResult.selectedProjects.map((p) => ({
        id: p.id,
        kind: p.kind,
        name: p.name,
        root: p.root,
        ...(p.packageManager ? { packageManager: p.packageManager } : {})
      })),
      potentiallyImpactedProjects: []
    },
    environment: {
      runtime: {
        provider: runtimeProvider,
        networkPolicy
      },
      fingerprints: {}
    },
    steps,
    diagnostics,
    warnings,
    nextActions,
    summary: {
      ok: allStepsOk && errorCount === 0,
      errors: errorCount,
      warnings: warningCount + warnings.length,
      durationMs: totalDurationMs
    },
    artifacts: {
      logDir: artifacts.logDir,
      reportPath: artifacts.reportPath
    }
  };

  await writeReportFile(output, artifacts.reportPathAbsolute, args.pretty);
  logger.info("validate command completed", {
    ok: output.summary.ok,
    reportPath: artifacts.reportPath,
    durationMs: totalDurationMs
  });

  const exitCode = output.summary.ok ? ExitCode.Success : ExitCode.ValidationFailed;
  return {
    exitCode,
    output,
    pretty: args.pretty
  };
}

export const validateCommand = {
  command: "validate",
  describe: "Run required quality gate: deps + compile/typecheck + LSP diagnostics",
  builder: {},
  handler: (args: unknown) => handler(args as ValidateArgs)
};
