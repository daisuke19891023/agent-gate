import type { ErrorCategory } from './exit-codes.js';
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
export interface NextAction {
  kind: string;
  message: string;
  commands?: string[];
  docs?: string[];
}

export interface ErrorOutput {
  tool: 'agent-gate';
  toolVersion: string;
  schemaVersion: number;
  status: 'error' | 'internal_error';
  generatedAt: string;
  error: {
    type: ErrorCategory;
    message: string;
    stack?: string;
    details?: Record<string, unknown>;
  };
  nextActions: NextAction[];
}

/**
 * Wraps an error into a JSON-serializable format with actionable guidance.
 */
export function wrapInternalError(error: unknown): ErrorOutput {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;

  return createErrorOutput({
    category: 'internal',
    message,
    stack,
    nextActions: [
      {
        kind: 'report-bug',
        message:
          'Internal error. Re-run with --pretty and share the JSON output with maintainers.',
        docs: ['docs/reference/cli.md'],
      },
    ],
  });
}

interface ErrorOutputInput {
  category: ErrorCategory;
  message: string;
  details?: Record<string, unknown>;
  stack?: string;
  nextActions?: NextAction[];
}

export function createErrorOutput(input: ErrorOutputInput): ErrorOutput {
  const nextActions =
    input.nextActions && input.nextActions.length > 0
      ? input.nextActions
      : defaultNextActionsForCategory(input.category);

  return {
    tool: 'agent-gate',
    toolVersion: version,
    schemaVersion: 1,
    status: input.category === 'internal' ? 'internal_error' : 'error',
    generatedAt: new Date().toISOString(),
    error: {
      type: input.category,
      message: input.message,
      ...(input.stack ? { stack: input.stack } : {}),
      ...(input.details ? { details: input.details } : {}),
    },
    nextActions,
  };
}

function defaultNextActionsForCategory(category: ErrorCategory): NextAction[] {
  switch (category) {
    case 'usage':
      return [
        {
          kind: 'check-usage',
          message: 'Review CLI arguments and try again.',
          docs: ['docs/reference/cli.md'],
        },
      ];
    case 'config':
      return [
        {
          kind: 'fix-config',
          message: 'Fix the configuration file and re-run the command.',
          docs: ['docs/reference/config-schema.md'],
        },
      ];
    case 'infrastructure':
      return [
        {
          kind: 'check-infrastructure',
          message: 'Ensure required runtimes are installed and reachable.',
          docs: ['docs/reference/cli.md'],
        },
      ];
    case 'validation':
      return [
        {
          kind: 'fix-validation',
          message: 'Resolve validation errors and re-run validate.',
          docs: ['docs/reference/report-schema.md'],
        },
      ];
    case 'internal':
    default:
      return [
        {
          kind: 'report-bug',
          message:
            'Internal error. Re-run with --pretty and share the JSON output with maintainers.',
          docs: ['docs/reference/cli.md'],
        },
      ];
  }
}
