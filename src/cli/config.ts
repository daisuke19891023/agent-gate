import { loadConfig, ConfigError } from '../config/load-config.js';
import type { LoadedConfig } from '../config/load-config.js';
import type { CommandResult } from './types.js';
import { ExitCode } from './exit-codes.js';
import { createErrorOutput } from './output.js';

interface EnsureConfigOptions {
  configPath?: string;
  repoRoot: string;
  pretty: boolean;
  env?: NodeJS.ProcessEnv;
}

export async function ensureValidConfig(
  options: EnsureConfigOptions,
): Promise<LoadedConfig | CommandResult> {
  try {
    const loaded = await loadConfig({
      configPath: options.configPath,
      repoRoot: options.repoRoot,
      env: options.env,
    });
    return loaded;
  } catch (error: unknown) {
    if (error instanceof ConfigError) {
      return {
        exitCode: ExitCode.UserError,
        output: createErrorOutput({
          category: 'config',
          message: error.message,
          details: error.details,
        }),
        pretty: options.pretty,
      };
    }
    throw error;
  }
}

export function isCommandResult(
  value: LoadedConfig | CommandResult,
): value is CommandResult {
  return (
    typeof value === 'object' &&
    value !== null &&
    'exitCode' in value
  );
}
