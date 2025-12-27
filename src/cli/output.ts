import { version } from './version.js';

/**
 * All CLI output MUST go through this function.
 * Guarantees STDOUT is always valid JSON.
 *
 * @param data - The data to output as JSON
 * @param pretty - Whether to pretty-print the JSON
 */
export function outputJson(data: unknown, pretty: boolean): void {
  const json = pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data);

  // Write directly to stdout (synchronous to avoid interleaving)
  process.stdout.write(json + '\n');
}

/**
 * Internal error output structure.
 * Per spec: even internal errors produce JSON with status: "internal_error"
 */
export interface InternalErrorOutput {
  tool: 'agent-gate';
  toolVersion: string;
  schemaVersion: number;
  status: 'internal_error';
  generatedAt: string;
  error: {
    message: string;
    stack?: string;
  };
}

/**
 * Wraps an unexpected error into a JSON-serializable format.
 */
export function wrapInternalError(error: unknown): InternalErrorOutput {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;

  return {
    tool: 'agent-gate',
    toolVersion: version,
    schemaVersion: 1,
    status: 'internal_error',
    generatedAt: new Date().toISOString(),
    error: {
      message,
      ...(stack ? { stack } : {}),
    },
  };
}
