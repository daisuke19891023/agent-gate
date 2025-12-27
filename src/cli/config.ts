import { loadConfig, ConfigError } from '../config/load-config.js';
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
): Promise<CommandResult | null> {
  try {
    await loadConfig({
      configPath: options.configPath,
      repoRoot: options.repoRoot,
      env: options.env,
    });
    return null;
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
