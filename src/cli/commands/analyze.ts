import { randomUUID } from 'node:crypto';
import type { AnalyzeOutput, CommandResult } from '../types.js';
import { ExitCode } from '../exit-codes.js';
import { version } from '../version.js';
import { ensureValidConfig, isCommandResult } from '../config.js';
import {
  ensureLogDir,
  resolveArtifacts,
  resolveLogLevel,
  writeReportFile,
} from '../artifacts.js';
import { createJsonLogger } from '../../core/logger.js';
import { ensureDaemonRunning } from '../../daemon/manager.js';

interface AnalyzeArgs {
  repo?: string;
  config?: string;
  scope: 'changed' | 'all';
  pretty: boolean;
  'log-level': 'error' | 'warn' | 'info' | 'debug';
}

async function handler(args: AnalyzeArgs): Promise<CommandResult> {
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
    'analyze',
    configResult.config,
    process.env,
  );
  await ensureLogDir(artifacts.logDirAbsolute);
  const logLevel = resolveLogLevel(args['log-level'], process.env);
  const logger = createJsonLogger({
    logDirAbsolute: artifacts.logDirAbsolute,
    level: logLevel,
    context: {
      repoId: 'stub-repo-id',
      sessionId,
      command: 'analyze',
    },
    step: 'bootstrap',
  });
  logger.info('analyze command started', {
    repoRoot,
    logDir: artifacts.logDir,
    reportPath: artifacts.reportPath,
  });

  await ensureDaemonRunning({
    repoRoot,
    logDirAbsolute: artifacts.logDirAbsolute,
    logLevel,
  });

  const output: AnalyzeOutput = {
    tool: 'agent-gate',
    toolVersion: version,
    schemaVersion: 1,
    command: 'analyze',
    generatedAt: new Date().toISOString(),
    repo: {
      root: repoRoot,
      id: 'stub-repo-id',
    },
    projects: [],
    warnings: ['analyze command is not yet implemented'],
    artifacts: {
      logDir: artifacts.logDir,
      reportPath: artifacts.reportPath,
    },
  };

  await writeReportFile(output, artifacts.reportPathAbsolute, args.pretty);
  logger.info('analyze command completed', {
    reportPath: artifacts.reportPath,
  });

  return {
    exitCode: ExitCode.Success,
    output,
    pretty: args.pretty,
  };
}

export const analyzeCommand = {
  command: 'analyze',
  describe: 'Detect repository structure (projects, package managers, toolchains)',
  builder: {},
  handler: (args: unknown) => handler(args as AnalyzeArgs),
};
