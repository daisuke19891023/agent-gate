import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { prepareCommand } from '../../commands/prepare.js';
import { ExitCode } from '../../exit-codes.js';
import { version } from '../../version.js';

describe('prepareCommand', () => {
  const originalCwd = process.cwd;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'agent-gate-prepare-'));
    process.cwd = vi.fn().mockReturnValue(tempDir);
  });

  afterEach(async () => {
    process.cwd = originalCwd;
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('command metadata', () => {
    it('should have command name "prepare"', () => {
      expect(prepareCommand.command).toBe('prepare');
    });

    it('should have description', () => {
      expect(prepareCommand.describe).toBeDefined();
      expect(typeof prepareCommand.describe).toBe('string');
    });
  });

  describe('handler', () => {
    const baseArgs = {
      scope: 'changed' as const,
      pretty: false,
      'log-level': 'info' as const,
    };

    it('should return Success exit code (0)', async () => {
      const result = await prepareCommand.handler(baseArgs);

      expect(result.exitCode).toBe(ExitCode.Success);
    });

    it('should return PrepareOutput structure', async () => {
      const result = await prepareCommand.handler(baseArgs);

      expect(result.output).toMatchObject({
        tool: 'agent-gate',
        command: 'prepare',
        repo: expect.any(Object),
        steps: expect.any(Array),
        nextActions: expect.any(Array),
        artifacts: expect.any(Object),
      });
    });

    it('should use --repo option as repo root when provided', async () => {
      const customRepo = path.join(tempDir, 'custom-path');
      const result = await prepareCommand.handler({
        ...baseArgs,
        repo: customRepo,
      });

      expect((result.output as { repo: { root: string } }).repo.root).toBe(
        customRepo,
      );
    });

    it('should use process.cwd() when --repo not provided', async () => {
      const result = await prepareCommand.handler(baseArgs);

      expect((result.output as { repo: { root: string } }).repo.root).toBe(
        tempDir,
      );
    });

    it('should include tool metadata', async () => {
      const result = await prepareCommand.handler(baseArgs);

      expect(result.output).toMatchObject({
        tool: 'agent-gate',
        toolVersion: version,
        schemaVersion: 1,
      });
    });

    it('should set command to "prepare"', async () => {
      const result = await prepareCommand.handler(baseArgs);

      expect((result.output as { command: string }).command).toBe('prepare');
    });

    it('should include steps array with deps step', async () => {
      const result = await prepareCommand.handler(baseArgs);

      const output = result.output as { steps: Array<{ name: string }> };
      expect(Array.isArray(output.steps)).toBe(true);
      expect(output.steps.some((s) => s.name === 'deps')).toBe(true);
    });

    it('should include nextActions array', async () => {
      const result = await prepareCommand.handler(baseArgs);

      const output = result.output as { nextActions: unknown[] };
      expect(Array.isArray(output.nextActions)).toBe(true);
    });

    it('should include artifacts paths', async () => {
      const result = await prepareCommand.handler(baseArgs);

      expect(result.output).toMatchObject({
        artifacts: {
          logDir: expect.any(String),
          reportPath: expect.any(String),
        },
      });
    });

    it('should respect --pretty flag in result', async () => {
      const result = await prepareCommand.handler({ ...baseArgs, pretty: true });

      expect(result.pretty).toBe(true);
    });
  });
});
