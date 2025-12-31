import { randomUUID } from "node:crypto";
import type {
  CommandResult,
  PrepareOutput,
  PrepareStep,
  PrepareProjectDetail,
  PrepareNextAction
} from "../types.js";
import { ExitCode } from "../exit-codes.js";
import { version } from "../version.js";
import { ensureValidConfig, isCommandResult } from "../config.js";
import { ensureLogDir, resolveArtifacts, resolveLogLevel, writeReportFile } from "../artifacts.js";
import { createJsonLogger } from "../../core/logger.js";
import { ensureDaemonRunning } from "../../daemon/manager.js";
import { resolveNetworkPolicy } from "../../core/runtime/network-policy.js";
import { detectProjects } from "../../core/projects/index.js";
import { createInstallEngine, getDepsNextActions } from "../../core/deps/index.js";
import { getRepoInfo } from "../../core/repo/repo-info.js";

interface PrepareArgs {
  repo?: string;
  config?: string;
  scope?: "changed" | "all";
  pretty: boolean;
  "log-level": "error" | "warn" | "info" | "debug";
}

async function handler(args: PrepareArgs): Promise<CommandResult> {
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
  const artifacts = resolveArtifacts(repoRoot, "prepare", configResult.config, process.env);
  await ensureLogDir(artifacts.logDirAbsolute);
  const logLevel = resolveLogLevel(args["log-level"], process.env);
  const logger = createJsonLogger({
    logDirAbsolute: artifacts.logDirAbsolute,
    level: logLevel,
    context: {
      repoId: repoInfo.id,
      sessionId,
      command: "prepare"
    },
    step: "bootstrap"
  });
  logger.info("prepare command started", {
    repoRoot,
    logDir: artifacts.logDir,
    reportPath: artifacts.reportPath
  });

  await ensureDaemonRunning({
    repoRoot,
    logDirAbsolute: artifacts.logDirAbsolute,
    logLevel
  });

  const networkPolicy = resolveNetworkPolicy("prepare", configResult.config.runtime?.network);

  // Step 1: Detect projects
  logger.info("detecting projects", { step: "detect" });
  const projectResult = await detectProjects({
    repoRoot,
    kinds: ["node", "python"]
  });

  if (projectResult.projects.length === 0) {
    logger.info("no projects detected", { step: "detect" });
    const output: PrepareOutput = {
      tool: "agent-gate",
      toolVersion: version,
      schemaVersion: 1,
      command: "prepare",
      generatedAt: new Date().toISOString(),
      repo: {
        root: repoRoot,
        id: repoInfo.id,
        ...(repoInfo.vcs ? { vcs: repoInfo.vcs } : {})
      },
      steps: [
        {
          name: "deps",
          status: "skipped",
          message: "No projects detected",
          notes: [`networkPolicy: ${networkPolicy}`]
        }
      ],
      nextActions: [],
      artifacts: {
        logDir: artifacts.logDir,
        reportPath: artifacts.reportPath
      }
    };

    await writeReportFile(output, artifacts.reportPathAbsolute, args.pretty);
    return {
      exitCode: ExitCode.Success,
      output,
      pretty: args.pretty
    };
  }

  logger.info("detected projects", {
    step: "detect",
    projectCount: projectResult.projects.length,
    projects: projectResult.projects.map((p) => p.id)
  });

  // Step 2: Install dependencies
  logger.info("installing dependencies", { step: "deps" });
  const installEngine = createInstallEngine({
    repoRoot,
    timeoutMs: configResult.config.toolchains?.node?.install?.timeoutMs
  });

  const installResult = await installEngine.installAll(projectResult.projects);

  // Build project details for output
  const projects: PrepareProjectDetail[] = installResult.projects.map((p) => ({
    id: p.projectId,
    kind: p.kind,
    root: p.root,
    packageManager: {
      manager: p.packageManager.manager,
      lockfile: p.packageManager.lockfile,
      lockfileExists: p.packageManager.lockfileExists,
      manifestPath: p.packageManager.manifestPath,
      version: p.packageManager.version
    },
    installResult: p.success ? "success" : "failed",
    durationMs: p.durationMs,
    error: p.error
      ? {
          code: p.error.code,
          message: p.error.message
        }
      : undefined
  }));

  // Build nextActions from failed installs
  const nextActions: PrepareNextAction[] = [];
  for (const project of installResult.projects) {
    if (project.error) {
      const actions = getDepsNextActions(project.error);
      for (const action of actions) {
        // Avoid duplicate nextActions by checking kind
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

  // Build deps step
  const depsStep: PrepareStep = {
    name: "deps",
    status: installResult.allSucceeded ? "success" : "failed",
    durationMs: installResult.totalDurationMs,
    notes: [
      `networkPolicy: ${networkPolicy}`,
      `projects: ${installResult.projects.length}`,
      `succeeded: ${installResult.projects.filter((p) => p.success).length}`,
      `failed: ${installResult.projects.filter((p) => !p.success).length}`
    ]
  };

  logger.info("dependency installation completed", {
    step: "deps",
    allSucceeded: installResult.allSucceeded,
    totalDurationMs: installResult.totalDurationMs
  });

  const output: PrepareOutput = {
    tool: "agent-gate",
    toolVersion: version,
    schemaVersion: 1,
    command: "prepare",
    generatedAt: new Date().toISOString(),
    repo: {
      root: repoRoot,
      id: repoInfo.id,
      ...(repoInfo.vcs ? { vcs: repoInfo.vcs } : {})
    },
    steps: [depsStep],
    projects,
    nextActions,
    artifacts: {
      logDir: artifacts.logDir,
      reportPath: artifacts.reportPath
    }
  };

  await writeReportFile(output, artifacts.reportPathAbsolute, args.pretty);
  logger.info("prepare command completed", {
    reportPath: artifacts.reportPath,
    allSucceeded: installResult.allSucceeded
  });

  return {
    exitCode: installResult.allSucceeded ? ExitCode.Success : ExitCode.ValidationFailed,
    output,
    pretty: args.pretty
  };
}

export const prepareCommand = {
  command: "prepare",
  describe: "Acquire dependencies and ensure toolchains are ready",
  builder: {},
  handler: (args: unknown) => handler(args as PrepareArgs)
};
