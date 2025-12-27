import type { CommandResult, ValidateOutput } from '../types.js';
import { ExitCode } from '../exit-codes.js';
import { version } from '../version.js';

interface ValidateArgs {
  repo?: string;
  config?: string;
  scope: 'changed' | 'all';
  pretty: boolean;
  'log-level': 'error' | 'warn' | 'info' | 'debug';
}

async function handler(args: ValidateArgs): Promise<CommandResult> {
  const repoRoot = args.repo ?? process.cwd();

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
      logDir: '.agent-gate/logs',
      reportPath: '.agent-gate/reports/validate.json',
    },
  };

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
