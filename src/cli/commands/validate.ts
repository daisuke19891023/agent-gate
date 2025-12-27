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
import { createJsonLogger } from '../../core/logger.js';
import { ensureDaemonRunning } from '../../daemon/manager.js';
import { resolveNetworkPolicy } from '../../core/runtime/network-policy.js';
import { checkDependencyStatus } from '../../core/runtime/deps-check.js';
import { resolveProvider } from '../../providers/resolve-provider.js';

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
  const logLevel = resolveLogLevel(args['log-level'], process.env);
  const logger = createJsonLogger({
    logDirAbsolute: artifacts.logDirAbsolute,
    level: logLevel,
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

  await ensureDaemonRunning({
    repoRoot,
    logDirAbsolute: artifacts.logDirAbsolute,
    logLevel,
  });

  const networkPolicy = resolveNetworkPolicy(
    'validate',
    configResult.config.runtime?.network,
  );
  const { kind: runtimeProvider } = await resolveProvider(
    configResult.config.runtime?.provider,
  );
  const dependencyStatus = await checkDependencyStatus(repoRoot);
  const networkBlocked =
    networkPolicy === 'deny-all' && dependencyStatus.missing;

  const depsStepMessage = networkBlocked
    ? 'Dependencies are missing but network access is disabled for validate.'
    : 'validate command is not yet implemented';
  const skippedStepMessage = networkBlocked
    ? 'Skipped because dependency acquisition was blocked by network policy.'
    : 'validate command is not yet implemented';

  const diagnostics = networkBlocked
    ? [
        {
          source: 'deps',
          severity: 'error',
          code: 'NETWORK_BLOCKED',
          message:
            'Dependencies are missing and network access is blocked during validate.',
        },
      ]
    : [];

  const nextActions = networkBlocked
    ? [
        {
          kind: 'run-prepare',
          message:
            'Run prepare with network access enabled to fetch dependencies.',
          commands: ['agent-gate prepare'],
          docs: ['docs/reference/cli.md'],
        },
      ]
    : [];

  const warnings: string[] = [];

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
        provider: runtimeProvider,
        networkPolicy,
      },
      fingerprints: {},
    },
    steps: [
      {
        name: 'deps',
        status: networkBlocked ? 'failed' : 'skipped',
        message: depsStepMessage,
        ...(dependencyStatus.reasons.length > 0
          ? { notes: dependencyStatus.reasons }
          : {}),
      },
      {
        name: 'typecheck',
        status: 'skipped',
        message: skippedStepMessage,
      },
      {
        name: 'lspDiagnostics',
        status: 'skipped',
        message: skippedStepMessage,
      },
    ],
    diagnostics,
    warnings,
    nextActions,
    summary: {
      ok: !networkBlocked,
      errors: networkBlocked ? 1 : 0,
      warnings: warnings.length,
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
    exitCode: networkBlocked ? ExitCode.ValidationFailed : ExitCode.Success,
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
