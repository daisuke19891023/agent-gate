import { randomUUID } from 'node:crypto';
import type { CommandResult, PrepareOutput } from '../types.js';
import { ExitCode } from '../exit-codes.js';
import { version } from '../version.js';
import { ensureValidConfig, isCommandResult } from '../config.js';
import {
  ensureLogDir,
  resolveArtifacts,
  resolveLogLevel,
  writeReportFile,
} from '../artifacts.js';
import { createJsonLogger } from '../logger.js';

interface PrepareArgs {
  repo?: string;
  config?: string;
  scope: 'changed' | 'all';
  pretty: boolean;
  'log-level': 'error' | 'warn' | 'info' | 'debug';
}

async function handler(args: PrepareArgs): Promise<CommandResult> {
  const repoRoot = args.repo ?? process.cwd();
  const configResult = await ensureValidConfig({
    configPath: args.config,
    repoRoot,
    pretty: args.pretty,
    env: process.env,
  });
  if (isCommandResult(configResult)) {
    return configResult;
  }

  const sessionId = randomUUID();
  const artifacts = resolveArtifacts(
    repoRoot,
    'prepare',
    configResult.config,
    process.env,
  );
  await ensureLogDir(artifacts.logDirAbsolute);
  const logger = createJsonLogger({
    logDirAbsolute: artifacts.logDirAbsolute,
    level: resolveLogLevel(args['log-level'], process.env),
    context: {
      repoId: 'stub-repo-id',
      sessionId,
      command: 'prepare',
    },
    step: 'bootstrap',
  });
  logger.info('prepare command started', {
    repoRoot,
    logDir: artifacts.logDir,
    reportPath: artifacts.reportPath,
  });

  const output: PrepareOutput = {
    tool: 'agent-gate',
    toolVersion: version,
    schemaVersion: 1,
    command: 'prepare',
    generatedAt: new Date().toISOString(),
    repo: {
      root: repoRoot,
      id: 'stub-repo-id',
    },
    steps: [
      {
        name: 'deps',
        status: 'skipped',
        message: 'prepare command is not yet implemented',
      },
    ],
    nextActions: [],
    artifacts: {
      logDir: artifacts.logDir,
      reportPath: artifacts.reportPath,
    },
  };

  await writeReportFile(output, artifacts.reportPathAbsolute, args.pretty);
  logger.info('prepare command completed', {
    reportPath: artifacts.reportPath,
  });

  return {
    exitCode: ExitCode.Success,
    output,
    pretty: args.pretty,
  };
}

export const prepareCommand = {
  command: 'prepare',
  describe: 'Acquire dependencies and ensure toolchains are ready',
  builder: {},
  handler: (args: unknown) => handler(args as PrepareArgs),
};
