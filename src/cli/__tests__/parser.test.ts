import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { run, setCommandResult, getCommandResult } from '../parser.js';
import { ExitCode } from '../exit-codes.js';

// Suppress stdout during tests
let stdoutWriteSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  stdoutWriteSpy = vi
    .spyOn(process.stdout, 'write')
    .mockImplementation(() => true);
});

afterEach(() => {
  stdoutWriteSpy.mockRestore();
});

describe('run', () => {
  describe('command routing', () => {
    it('should route "analyze" to analyze handler', async () => {
      const result = await run(['analyze']);

      expect(result.exitCode).toBe(ExitCode.Success);
      expect((result.output as { command: string }).command).toBe('analyze');
    });

    it('should route "prepare" to prepare handler', async () => {
      const result = await run(['prepare']);

      expect(result.exitCode).toBe(ExitCode.Success);
      expect((result.output as { command: string }).command).toBe('prepare');
    });

    it('should route "validate" to validate handler', async () => {
      const result = await run(['validate']);

      expect(result.exitCode).toBe(ExitCode.Success);
      expect((result.output as { command: string }).command).toBe('validate');
    });

    it('should route "daemon status" to daemon handler', async () => {
      const result = await run(['daemon', 'status']);

      expect(result.exitCode).toBe(ExitCode.Success);
      expect((result.output as { command: string }).command).toBe('daemon');
      expect((result.output as { action: string }).action).toBe('status');
    });

    it('should route "daemon stop" to daemon handler', async () => {
      const result = await run(['daemon', 'stop']);

      expect(result.exitCode).toBe(ExitCode.Success);
      expect((result.output as { command: string }).command).toBe('daemon');
      expect((result.output as { action: string }).action).toBe('stop');
    });
  });

  describe('global options parsing', () => {
    it('should parse --repo option', async () => {
      const repoRoot = await mkdtemp(path.join(os.tmpdir(), 'agent-gate-test-'));
      try {
        const result = await run(['analyze', '--repo', repoRoot]);

        expect(result.exitCode).toBe(ExitCode.Success);
        expect((result.output as { repo: { root: string } }).repo.root).toBe(
          repoRoot,
        );
      } finally {
        await rm(repoRoot, { recursive: true, force: true });
      }
    });

    it('should parse --scope with "changed" value', async () => {
      const result = await run(['validate', '--scope', 'changed']);

      expect(result.exitCode).toBe(ExitCode.Success);
      expect((result.output as { scope: { mode: string } }).scope.mode).toBe(
        'changed',
      );
    });

    it('should parse --scope with "all" value', async () => {
      const result = await run(['validate', '--scope', 'all']);

      expect(result.exitCode).toBe(ExitCode.Success);
      expect((result.output as { scope: { mode: string } }).scope.mode).toBe(
        'all',
      );
    });

    it('should use default scope "changed" when not specified', async () => {
      const result = await run(['validate']);

      expect((result.output as { scope: { mode: string } }).scope.mode).toBe(
        'changed',
      );
    });

    it('should parse --pretty flag', async () => {
      const result = await run(['analyze', '--pretty']);

      expect(result.exitCode).toBe(ExitCode.Success);
      expect(result.pretty).toBe(true);
    });

    it('should default pretty to false', async () => {
      const result = await run(['analyze']);

      expect(result.pretty).toBe(false);
    });
  });

  describe('error handling', () => {
    it('should return UserError (2) when no command specified', async () => {
      const result = await run([]);

      expect(result.exitCode).toBe(ExitCode.UserError);
    });

    it('should return UserError (2) for unknown command', async () => {
      const result = await run(['unknown-command']);

      expect(result.exitCode).toBe(ExitCode.UserError);
    });

    it('should return UserError (2) for unknown options', async () => {
      const result = await run(['analyze', '--unknown-option']);

      expect(result.exitCode).toBe(ExitCode.UserError);
    });

    it('should return JSON error output for yargs validation failures', async () => {
      const result = await run(['unknown']);

      expect(result.output).toMatchObject({
        tool: 'agent-gate',
        status: 'error',
        error: {
          type: 'usage',
          message: expect.any(String),
        },
        nextActions: expect.any(Array),
      });
    });

    it('should include error type "usage" in error output', async () => {
      const result = await run([]);

      expect((result.output as { error: { type: string } }).error.type).toBe(
        'usage',
      );
    });

    it('should reject invalid --scope values', async () => {
      const result = await run(['validate', '--scope', 'invalid']);

      expect(result.exitCode).toBe(ExitCode.UserError);
    });

    it('should reject invalid --log-level values', async () => {
      const result = await run(['analyze', '--log-level', 'invalid']);

      expect(result.exitCode).toBe(ExitCode.UserError);
    });
  });

  describe('result structure', () => {
    it('should return CommandResult with exitCode', async () => {
      const result = await run(['analyze']);

      expect(typeof result.exitCode).toBe('number');
    });

    it('should return CommandResult with output', async () => {
      const result = await run(['analyze']);

      expect(result.output).toBeDefined();
      expect(typeof result.output).toBe('object');
    });

    it('should return CommandResult with pretty flag', async () => {
      const result = await run(['analyze']);

      expect(typeof result.pretty).toBe('boolean');
    });
  });
});

describe('setCommandResult / getCommandResult', () => {
  it('should store and retrieve command result', () => {
    const testResult = {
      exitCode: ExitCode.Success,
      output: { test: true },
      pretty: false,
    };

    setCommandResult(testResult);
    expect(getCommandResult()).toEqual(testResult);
  });
});
