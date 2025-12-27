import { randomUUID } from 'node:crypto';
import type { CommandResult, ValidateOutput } from '../types.js';
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

interface ValidateArgs {
  repo?: string;
  config?: string;
  scope: 'changed' | 'all';
  pretty: boolean;
  'log-level': 'error' | 'warn' | 'info' | 'debug';
}

async function handler(args: ValidateArgs): Promise<CommandResult> {
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
    'validate',
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
      command: 'validate',
    },
    step: 'bootstrap',
  });
  logger.info('validate command started', {
    repoRoot,
    logDir: artifacts.logDir,
    reportPath: artifacts.reportPath,
  });

  const output: ValidateOutput = {
    tool: 'agent-gate',
    toolVersion: version,
    schemaVersion: 1,
    command: 'validate',
    generatedAt: new Date().toISOString(),
    repo: {
      root: repoRoot,
      id: 'stub-repo-id',
    },
    scope: {
      mode: args.scope,
      changedFiles: [],
      selectedProjects: [],
      potentiallyImpactedProjects: [],
    },
    environment: {
      runtime: {
        provider: 'none',
        networkPolicy: 'default',
      },
      fingerprints: {},
    },
    steps: [
      {
        name: 'deps',
        status: 'skipped',
        message: 'validate command is not yet implemented',
      },
      {
        name: 'typecheck',
        status: 'skipped',
        message: 'validate command is not yet implemented',
      },
      {
        name: 'lspDiagnostics',
        status: 'skipped',
        message: 'validate command is not yet implemented',
      },
    ],
    diagnostics: [],
    warnings: ['validate command is not yet implemented'],
    nextActions: [],
    summary: {
      ok: true,
      errors: 0,
      warnings: 1,
      durationMs: 0,
    },
    artifacts: {
      logDir: artifacts.logDir,
      reportPath: artifacts.reportPath,
    },
  };

  await writeReportFile(output, artifacts.reportPathAbsolute, args.pretty);
  logger.info('validate command completed', {
    reportPath: artifacts.reportPath,
  });

  return {
    exitCode: ExitCode.Success,
    output,
    pretty: args.pretty,
  };
}

export const validateCommand = {
  command: 'validate',
  describe: 'Run required quality gate: deps + compile/typecheck + LSP diagnostics',
  builder: {},
  handler: (args: unknown) => handler(args as ValidateArgs),
};
