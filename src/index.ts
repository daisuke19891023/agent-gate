#!/usr/bin/env node

import { run } from './cli/parser.js';
import { ExitCode } from './cli/exit-codes.js';
import { outputJson, wrapInternalError } from './cli/output.js';

/**
 * Main CLI entry point.
 *
 * Design principles:
 * - STDOUT is always JSON (per spec)
 * - Exit codes are stable contracts (0-4)
 * - Internal errors still produce JSON output
 */
async function main(): Promise<never> {
  try {
    const result = await run(process.argv.slice(2));
    outputJson(result.output, result.pretty);
    process.exit(result.exitCode);
  } catch (error: unknown) {
    // Unhandled error = internal error, but still output JSON
    const internalError = wrapInternalError(error);
    outputJson(internalError, false);
    process.exit(ExitCode.InternalError);
  }
}

main();
