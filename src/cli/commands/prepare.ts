import type { CommandResult, PrepareOutput } from '../types.js';
import { ExitCode } from '../exit-codes.js';
import { version } from '../version.js';
import { ensureValidConfig } from '../config.js';

interface PrepareArgs {
  repo?: string;
  config?: string;
  scope: 'changed' | 'all';
  pretty: boolean;
  'log-level': 'error' | 'warn' | 'info' | 'debug';
}

async function handler(args: PrepareArgs): Promise<CommandResult> {
  const repoRoot = args.repo ?? process.cwd();
  const configError = await ensureValidConfig({
    configPath: args.config,
    repoRoot,
    pretty: args.pretty,
    env: process.env,
  });
  if (configError) {
    return configError;
  }

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
      logDir: '.agent-gate/logs',
      reportPath: '.agent-gate/reports/prepare.json',
    },
  };

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
