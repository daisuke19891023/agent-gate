import type { CommandResult, DaemonOutput } from '../types.js';
import { ExitCode } from '../exit-codes.js';
import { version } from '../version.js';

interface DaemonArgs {
  action: 'status' | 'stop';
  repo?: string;
  config?: string;
  scope: 'changed' | 'all';
  pretty: boolean;
  'log-level': 'error' | 'warn' | 'info' | 'debug';
}

async function handleStatus(args: DaemonArgs): Promise<CommandResult> {
  const output: DaemonOutput = {
    tool: 'agent-gate',
    toolVersion: version,
    schemaVersion: 1,
    command: 'daemon',
    generatedAt: new Date().toISOString(),
    action: 'status',
    status: 'not_found',
  };

  return {
    exitCode: ExitCode.Success,
    output,
    pretty: args.pretty,
  };
}

async function handleStop(args: DaemonArgs): Promise<CommandResult> {
  const output: DaemonOutput = {
    tool: 'agent-gate',
    toolVersion: version,
    schemaVersion: 1,
    command: 'daemon',
    generatedAt: new Date().toISOString(),
    action: 'stop',
    status: 'not_found',
  };

  return {
    exitCode: ExitCode.Success,
    output,
    pretty: args.pretty,
  };
}

async function handler(args: DaemonArgs): Promise<CommandResult> {
  switch (args.action) {
    case 'status':
      return handleStatus(args);
    case 'stop':
      return handleStop(args);
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
    },
  ) => YargsInstance;
}

export const daemonCommand = {
  command: 'daemon <action>',
  describe: 'Daemon operational commands (status/stop)',
  builder: (yargs: YargsInstance) =>
    yargs.positional('action', {
      type: 'string',
      choices: ['status', 'stop'],
      demandOption: true,
      describe: 'Daemon action to perform',
    }),
  handler: (args: unknown) => handler(args as DaemonArgs),
};
