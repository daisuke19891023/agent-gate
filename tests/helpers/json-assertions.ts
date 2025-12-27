import { expect } from 'vitest';

/**
 * Asserts that the output contains required base fields.
 */
export function assertBaseOutput(json: unknown): void {
  expect(json).toMatchObject({
    tool: 'agent-gate',
    toolVersion: expect.any(String),
    schemaVersion: expect.any(Number),
    generatedAt: expect.any(String),
  });

  // Validate generatedAt is ISO format
  const output = json as { generatedAt: string };
  expect(() => new Date(output.generatedAt)).not.toThrow();
}

/**
 * Asserts error output structure.
 */
export function assertErrorOutput(json: unknown): void {
  assertBaseOutput(json);
  expect(json).toMatchObject({
    status: expect.stringMatching(/^(error|internal_error)$/),
    error: {
      message: expect.any(String),
    },
  });
}

/**
 * Asserts success output structure for a specific command.
 */
export function assertSuccessOutput(json: unknown, command: string): void {
  assertBaseOutput(json);
  expect(json).toMatchObject({
    command,
  });
}

/**
 * Asserts analyze output structure.
 */
export function assertAnalyzeOutput(json: unknown): void {
  assertSuccessOutput(json, 'analyze');
  expect(json).toMatchObject({
    repo: {
      root: expect.any(String),
      id: expect.any(String),
    },
    projects: expect.any(Array),
    warnings: expect.any(Array),
    artifacts: {
      logDir: expect.any(String),
      reportPath: expect.any(String),
    },
  });
}

/**
 * Asserts prepare output structure.
 */
export function assertPrepareOutput(json: unknown): void {
  assertSuccessOutput(json, 'prepare');
  expect(json).toMatchObject({
    repo: {
      root: expect.any(String),
      id: expect.any(String),
    },
    steps: expect.any(Array),
    nextActions: expect.any(Array),
    artifacts: {
      logDir: expect.any(String),
      reportPath: expect.any(String),
    },
  });
}

/**
 * Asserts validate output structure.
 */
export function assertValidateOutput(json: unknown): void {
  assertSuccessOutput(json, 'validate');
  expect(json).toMatchObject({
    repo: {
      root: expect.any(String),
      id: expect.any(String),
    },
    scope: {
      mode: expect.stringMatching(/^(changed|all)$/),
      changedFiles: expect.any(Array),
      selectedProjects: expect.any(Array),
      potentiallyImpactedProjects: expect.any(Array),
    },
    environment: {
      runtime: expect.any(Object),
      fingerprints: expect.any(Object),
    },
    steps: expect.any(Array),
    diagnostics: expect.any(Array),
    warnings: expect.any(Array),
    nextActions: expect.any(Array),
    summary: {
      ok: expect.any(Boolean),
      errors: expect.any(Number),
      warnings: expect.any(Number),
      durationMs: expect.any(Number),
    },
    artifacts: {
      logDir: expect.any(String),
      reportPath: expect.any(String),
    },
  });
}

/**
 * Asserts daemon output structure.
 */
export function assertDaemonOutput(
  json: unknown,
  action: 'status' | 'stop',
): void {
  assertSuccessOutput(json, 'daemon');
  expect(json).toMatchObject({
    action,
    status: expect.any(String),
  });
}
