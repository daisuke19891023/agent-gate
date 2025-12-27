import yargs from 'yargs';
import type { CommandResult } from './types.js';
import { analyzeCommand } from './commands/analyze.js';
import { prepareCommand } from './commands/prepare.js';
import { validateCommand } from './commands/validate.js';
import { daemonCommand } from './commands/daemon.js';
import { ExitCode } from './exit-codes.js';
import { createErrorOutput, wrapInternalError } from './output.js';

/**
 * Stores the result from command handlers.
 * This is needed because yargs handlers don't return values directly.
 */
let commandResult: CommandResult | null = null;

/**
 * Sets the command result from a handler.
 * Called by command handlers to store their result.
 */
export function setCommandResult(result: CommandResult): void {
  commandResult = result;
}

/**
 * Gets the stored command result.
 */
export function getCommandResult(): CommandResult | null {
  return commandResult;
}

/**
 * Parses CLI arguments and runs the appropriate command.
 *
 * @param argv - Command line arguments (without node and script name)
 * @returns The command result with exit code and output
 */
export async function run(argv: string[]): Promise<CommandResult> {
  // Reset result before parsing
  commandResult = null;

  const parser = yargs(argv)
    .scriptName('agent-gate')
    .usage('$0 <command> [options]')
    .strict() // Reject unknown options (low-freedom)
    .demandCommand(1, 'You must specify a command')

    // Global options
    .option('repo', {
      type: 'string',
      description: 'Repository root (default: cwd or git root)',
      global: true,
    })
    .option('config', {
      type: 'string',
      description: 'Path to config file',
      global: true,
    })
    .option('scope', {
      type: 'string',
      choices: ['changed', 'all'] as const,
      default: 'changed' as const,
      description: 'Scope: changed (default) or all',
      global: true,
    })
    .option('pretty', {
      type: 'boolean',
      default: false,
      description: 'Pretty-print JSON output',
      global: true,
    })
    .option('log-level', {
      type: 'string',
      choices: ['error', 'warn', 'info', 'debug'] as const,
      default: 'info' as const,
      description: 'Log level',
      global: true,
    })

    // Commands - use type assertion for compatibility
    .command(
      analyzeCommand.command,
      analyzeCommand.describe ?? '',
      analyzeCommand.builder ?? {},
      async (args) => {
        const result = await analyzeCommand.handler(args);
        if (result) setCommandResult(result as CommandResult);
      },
    )
    .command(
      prepareCommand.command,
      prepareCommand.describe ?? '',
      prepareCommand.builder ?? {},
      async (args) => {
        const result = await prepareCommand.handler(args);
        if (result) setCommandResult(result as CommandResult);
      },
    )
    .command(
      validateCommand.command,
      validateCommand.describe ?? '',
      validateCommand.builder ?? {},
      async (args) => {
        const result = await validateCommand.handler(args);
        if (result) setCommandResult(result as CommandResult);
      },
    )
    .command(
      daemonCommand.command,
      daemonCommand.describe ?? '',
      daemonCommand.builder ?? {},
      async (args) => {
        const result = await daemonCommand.handler(args);
        if (result) setCommandResult(result as CommandResult);
      },
    )

    // Disable default help/version (we output JSON, not text)
    .help(false)
    .version(false)

    // Don't call process.exit, let us handle it
    .exitProcess(false)

    // Handle failures with JSON output
    .fail((msg, err) => {
      // yargs validation error - treat as user error
      const errorResult: CommandResult = {
        exitCode: ExitCode.UserError,
        output: createErrorOutput({
          category: 'usage',
          message: msg || (err?.message ?? 'Unknown error'),
        }),
        pretty: false,
      };
      setCommandResult(errorResult);
      // Throw to stop yargs from continuing
      throw new Error(msg || err?.message || 'Validation failed');
    });

  try {
    await parser.parseAsync();
  } catch (error: unknown) {
    if (!commandResult) {
      commandResult = {
        exitCode: ExitCode.InternalError,
        output: wrapInternalError(error),
        pretty: false,
      };
    }
  }

  // Return result or default error
  return (
    commandResult ?? {
      exitCode: ExitCode.UserError,
      output: createErrorOutput({
        category: 'usage',
        message: 'No command executed',
      }),
      pretty: false,
    }
  );
}
