import { randomUUID } from "node:crypto";
import type { CommandResult, DaemonOutput } from "../types.js";
import { ExitCode } from "../exit-codes.js";
import { version } from "../version.js";
import { ensureValidConfig, isCommandResult } from "../config.js";
import { ensureLogDir, resolveArtifacts, resolveLogLevel } from "../artifacts.js";
import { createJsonLogger } from "../../core/logger.js";
import { getDaemonStatus, stopDaemon } from "../../daemon/manager.js";
import { getRepoInfo } from "../../core/repo/repo-info.js";

interface DaemonArgs {
  action: "status" | "stop";
  repo?: string;
  config?: string;
  scope?: "changed" | "all";
  pretty: boolean;
  "log-level": "error" | "warn" | "info" | "debug";
}

async function handleStatus(args: DaemonArgs): Promise<CommandResult> {
  const repoRoot = args.repo ?? process.cwd();
  const status = await getDaemonStatus(repoRoot);
  const output = toDaemonOutput("status", status);

  return {
    exitCode: ExitCode.Success,
    output,
    pretty: args.pretty
  };
}

async function handleStop(args: DaemonArgs): Promise<CommandResult> {
  const repoRoot = args.repo ?? process.cwd();
  const status = await stopDaemon(repoRoot);
  const output = toDaemonOutput("stop", status);

  return {
    exitCode: ExitCode.Success,
    output,
    pretty: args.pretty
  };
}

async function handler(args: DaemonArgs): Promise<CommandResult> {
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
  const artifacts = resolveArtifacts(repoRoot, "daemon", configResult.config, process.env);
  await ensureLogDir(artifacts.logDirAbsolute);
  const logger = createJsonLogger({
    logDirAbsolute: artifacts.logDirAbsolute,
    level: resolveLogLevel(args["log-level"], process.env),
    context: {
      repoId: repoInfo.id,
      sessionId,
      command: "daemon"
    },
    step: "bootstrap"
  });
  logger.info("daemon command started", {
    repoRoot,
    action: args.action,
    logDir: artifacts.logDir
  });

  switch (args.action) {
    case "status": {
      const result = await handleStatus(args);
      logger.info("daemon command completed", {
        action: args.action,
        status: (result.output as { status?: string }).status
      });
      return result;
    }
    case "stop": {
      const result = await handleStop(args);
      logger.info("daemon command completed", {
        action: args.action,
        status: (result.output as { status?: string }).status
      });
      return result;
    }
    default: {
      // Should not reach here due to yargs choices validation
      const exhaustiveCheck: never = args.action;
      throw new Error(`Unknown daemon action: ${exhaustiveCheck}`);
    }
  }
}

interface YargsInstance {
  positional: (
    key: string,
    options: {
      type: string;
      choices: readonly string[];
      demandOption: boolean;
      describe: string;
    }
  ) => YargsInstance;
}

export const daemonCommand = {
  command: "daemon <action>",
  describe: "Daemon operational commands (status/stop)",
  builder: (yargs: YargsInstance) =>
    yargs.positional("action", {
      type: "string",
      choices: ["status", "stop"],
      demandOption: true,
      describe: "Daemon action to perform"
    }),
  handler: (args: unknown) => handler(args as DaemonArgs)
};

function toDaemonOutput(
  action: "status" | "stop",
  status: Awaited<ReturnType<typeof getDaemonStatus>>
): DaemonOutput {
  const output: DaemonOutput = {
    tool: "agent-gate",
    toolVersion: version,
    schemaVersion: 1,
    command: "daemon",
    generatedAt: new Date().toISOString(),
    action,
    status: status.status
  };

  if (status.pid) {
    output.pid = status.pid;
  }
  if (status.startedAt) {
    const startedAt = new Date(status.startedAt).getTime();
    if (!Number.isNaN(startedAt)) {
      output.uptime = Math.max(0, Date.now() - startedAt);
    }
  }

  return output;
}
