import { randomUUID } from "node:crypto";
import type {
  AnalyzeOutput,
  AnalyzeProjectRef,
  AnalyzeChangedFile,
  CommandResult
} from "../types.js";
import { ExitCode } from "../exit-codes.js";
import { version } from "../version.js";
import { ensureValidConfig, isCommandResult } from "../config.js";
import { ensureLogDir, resolveArtifacts, resolveLogLevel, writeReportFile } from "../artifacts.js";
import { createJsonLogger } from "../../core/logger.js";
import { ensureDaemonRunning } from "../../daemon/manager.js";
import { resolveScope, ScopeError } from "../../core/scope/index.js";
import { detectProjects } from "../../core/projects/index.js";
import type { ChangedFile } from "../../core/scope/types.js";
import type { ProjectRef } from "../../core/projects/types.js";

interface AnalyzeArgs {
  repo?: string;
  config?: string;
  scope: "changed" | "all";
  pretty: boolean;
  "log-level": "error" | "warn" | "info" | "debug";
}

async function handler(args: AnalyzeArgs): Promise<CommandResult> {
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

  const sessionId = randomUUID();
  const artifacts = resolveArtifacts(repoRoot, "analyze", configResult.config, process.env);
  await ensureLogDir(artifacts.logDirAbsolute);
  const logLevel = resolveLogLevel(args["log-level"], process.env);
  const logger = createJsonLogger({
    logDirAbsolute: artifacts.logDirAbsolute,
    level: logLevel,
    context: {
      repoId: "stub-repo-id",
      sessionId,
      command: "analyze"
    },
    step: "bootstrap"
  });
  logger.info("analyze command started", {
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
  const requestedScopeMode: "changed" | "all" = args.scope;
  let changedFiles: ChangedFile[] = [];
  let hasChanges = false;

  // Resolve scope (detect git changes) if mode is 'changed'
  if (requestedScopeMode === "changed") {
    logger.info("resolving scope", { mode: requestedScopeMode });
    try {
      const scopeResult = await resolveScope({
        repoRoot,
        mode: requestedScopeMode,
        onNoChanges: "ok",
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
        warnings.push(`Scope resolution failed: ${error.message}`);
        // Keep the requested mode but with empty changedFiles
      } else {
        throw error;
      }
    }
  } else {
    logger.info("scope mode is all, skipping git diff detection");
    hasChanges = true; // In 'all' mode, we assume there are changes
  }

  // Detect projects
  logger.info("detecting projects", { repoRoot });
  const projectResult = await detectProjects({
    repoRoot,
    kinds: ["node", "python"],
    changedFiles: changedFiles.map((f) => ({ path: f.path })),
    exclude: configResult.config.scope?.exclude
  });

  // Convert to output format
  const projects: AnalyzeProjectRef[] = projectResult.projects.map(toAnalyzeProjectRef);
  const selectedProjects: AnalyzeProjectRef[] =
    projectResult.selectedProjects.map(toAnalyzeProjectRef);

  // Add project detection warnings
  for (const warning of projectResult.warnings) {
    warnings.push(`${warning.code}: ${warning.message}`);
  }

  logger.info("projects detected", {
    totalProjects: projects.length,
    selectedProjects: selectedProjects.length,
    warnings: warnings.length
  });

  const output: AnalyzeOutput = {
    tool: "agent-gate",
    toolVersion: version,
    schemaVersion: 1,
    command: "analyze",
    generatedAt: new Date().toISOString(),
    repo: {
      root: repoRoot,
      id: sessionId.split("-")[0] ?? "unknown"
    },
    scope: {
      mode: requestedScopeMode,
      changedFiles: changedFiles.map(toAnalyzeChangedFile),
      hasChanges
    },
    projects,
    selectedProjects,
    warnings,
    artifacts: {
      logDir: artifacts.logDir,
      reportPath: artifacts.reportPath
    }
  };

  await writeReportFile(output, artifacts.reportPathAbsolute, args.pretty);
  logger.info("analyze command completed", {
    reportPath: artifacts.reportPath
  });

  return {
    exitCode: ExitCode.Success,
    output,
    pretty: args.pretty
  };
}

/**
 * Convert a ProjectRef to AnalyzeProjectRef.
 */
function toAnalyzeProjectRef(project: ProjectRef): AnalyzeProjectRef {
  return {
    id: project.id,
    kind: project.kind,
    name: project.name,
    root: project.root,
    packageManager: project.packageManager
  };
}

/**
 * Convert a ChangedFile to AnalyzeChangedFile.
 */
function toAnalyzeChangedFile(file: ChangedFile): AnalyzeChangedFile {
  return {
    path: file.path,
    changeType: file.changeType
  };
}

export const analyzeCommand = {
  command: "analyze",
  describe: "Detect repository structure (projects, package managers, toolchains)",
  builder: {},
  handler: (args: unknown) => handler(args as AnalyzeArgs)
};
