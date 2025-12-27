/**
 * Exit codes are a stable public contract.
 * Do not change values without updating docs/reference/cli.md
 *
 * @see docs/reference/cli.md#exit-codes
 */
export const ExitCode = {
  /** Success - all required steps succeeded */
  Success: 0,
  /** Validation failed - deps/typecheck/compile/diagnostics contain errors */
  ValidationFailed: 1,
  /** User/config error - invalid args, invalid config, unsupported repo layout */
  UserError: 2,
  /** Infrastructure error - missing docker/podman/git, container runtime not reachable */
  InfrastructureError: 3,
  /** Internal error - bug (JSON output still produced) */
  InternalError: 4,
} as const;

export type ExitCode = (typeof ExitCode)[keyof typeof ExitCode];

/**
 * Error categories that map to exit codes.
 */
export type ErrorCategory =
  | 'validation'
  | 'config'
  | 'usage'
  | 'infrastructure'
  | 'internal';

/**
 * Maps error categories to exit codes.
 */
export function exitCodeFromCategory(category: ErrorCategory): ExitCode {
  switch (category) {
    case 'validation':
      return ExitCode.ValidationFailed;
    case 'config':
    case 'usage':
      return ExitCode.UserError;
    case 'infrastructure':
      return ExitCode.InfrastructureError;
    case 'internal':
    default:
      return ExitCode.InternalError;
  }
}
