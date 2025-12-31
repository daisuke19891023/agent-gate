import { randomUUID } from "node:crypto";
import type {
  CommandResult,
  ValidateOutput,
  ValidateWarning,
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

interface ValidateArgs {
  repo?: string;
  config?: string;
  scope?: "changed" | "all";
  pretty: boolean;
  "log-level": "error" | "warn" | "info" | "debug";
}

async function handler(args: ValidateArgs): Promise<CommandResult> {
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

  const warnings: ValidateWarning[] = [];
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
        warnings.push({
          kind: "SCOPE_RESOLUTION_FAILED",
          message: error.message,
          details: { code: error.code }
        });
        scopeFailed = true;
        // Keep the requested mode but with empty changedFiles
      } else {
        throw error;
      }
    }
    if (!hasChanges && onNoChanges === "skip") {
      warnings.push({
        kind: "NO_CHANGES_SKIPPED",
        message: "No uncommitted changes detected; validation steps skipped."
      });
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
    warnings.push({
      kind: warning.code,
      message: warning.message,
      details: {
        ...(warning.path ? { path: warning.path } : {}),
        ...(warning.context ? { context: warning.context } : {})
      }
    });
  }

  logger.info("projects detected", {
    totalProjects: projectResult.projects.length,
    selectedProjects: projectResult.selectedProjects.length
  });

  warnings.sort((a, b) => {
    const pathAValue = a.details?.path;
    const pathBValue = b.details?.path;
    const pathA = typeof pathAValue === "string" ? pathAValue : "";
    const pathB = typeof pathBValue === "string" ? pathBValue : "";
    const keyA = `${a.kind}\u0000${pathA}\u0000${a.message}`;
    const keyB = `${b.kind}\u0000${pathB}\u0000${b.message}`;
    return keyA.localeCompare(keyB);
  });

  const networkPolicy = resolveNetworkPolicy("validate", configResult.config.runtime?.network);
  const { kind: runtimeProvider } = await resolveProvider(configResult.config.runtime?.provider);
  const skipValidation =
    requestedScopeMode === "changed" && !hasChanges && onNoChanges !== "fail" && !scopeFailed;
  const dependencyStatus = skipValidation
    ? { required: false, missing: false, reasons: [] as string[] }
    : await checkDependencyStatus(repoRoot);
  const networkBlocked = !skipValidation && networkPolicy === "deny-all" && dependencyStatus.missing;

  const diagnostics: ValidateDiagnostic[] = networkBlocked
    ? [
        {
          source: "deps",
          severity: "error",
          code: "NETWORK_BLOCKED",
          message: "Dependencies are missing and network access is blocked during validate."
        }
      ]
    : [];

  const nextActions: ValidateNextAction[] = networkBlocked
    ? [
        {
          kind: "run-prepare",
          message: "Run prepare with network access enabled to fetch dependencies.",
          commands: ["agent-gate prepare"],
          docs: ["docs/reference/cli.md"]
        }
      ]
    : [];

  const skipNotes = ["Skipped because no uncommitted changes were detected."];
  const depsNotes = networkBlocked
    ? ["Dependency acquisition blocked by network policy.", ...dependencyStatus.reasons]
    : ["validate command is not yet implemented", ...dependencyStatus.reasons];
  const skippedNotes = networkBlocked
    ? ["Skipped because dependency acquisition was blocked by network policy."]
    : ["validate command is not yet implemented"];

  const steps: ValidateStepResult[] = skipValidation
    ? [
        { name: "deps", status: "skipped", notes: skipNotes },
        { name: "typecheck", status: "skipped", notes: skipNotes },
        { name: "lspDiagnostics", status: "skipped", notes: skipNotes }
      ]
    : [
        {
          name: "deps",
          status: networkBlocked ? "failed" : "skipped",
          notes: depsNotes
        },
        {
          name: "typecheck",
          status: "skipped",
          notes: skippedNotes
        },
        {
          name: "lspDiagnostics",
          status: "skipped",
          notes: skippedNotes
        }
      ];

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
    diagnostics: skipValidation ? [] : diagnostics,
    warnings,
    nextActions: skipValidation ? [] : nextActions,
    summary: {
      ok: !networkBlocked,
      errors: networkBlocked ? 1 : 0,
      warnings: warnings.length,
      durationMs: 0
    },
    artifacts: {
      logDir: artifacts.logDir,
      reportPath: artifacts.reportPath
    }
  };

  await writeReportFile(output, artifacts.reportPathAbsolute, args.pretty);
  logger.info("validate command completed", {
    reportPath: artifacts.reportPath
  });

  return {
    exitCode: networkBlocked ? ExitCode.ValidationFailed : ExitCode.Success,
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
