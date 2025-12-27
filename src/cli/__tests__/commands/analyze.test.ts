import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { analyzeCommand } from '../../commands/analyze.js';
import { ExitCode } from '../../exit-codes.js';
import { version } from '../../version.js';

vi.mock('../../../daemon/manager.js', () => ({
  ensureDaemonRunning: vi.fn().mockResolvedValue({ status: 'running' }),
}));

describe('analyzeCommand', () => {
  const originalCwd = process.cwd;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'agent-gate-analyze-'));
    process.cwd = vi.fn().mockReturnValue(tempDir);
  });

  afterEach(async () => {
    process.cwd = originalCwd;
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('command metadata', () => {
    it('should have command name "analyze"', () => {
      expect(analyzeCommand.command).toBe('analyze');
    });

    it('should have description', () => {
      expect(analyzeCommand.describe).toBeDefined();
      expect(typeof analyzeCommand.describe).toBe('string');
    });
  });

  describe('handler', () => {
    const baseArgs = {
      scope: 'changed' as const,
      pretty: false,
      'log-level': 'info' as const,
    };

    it('should return Success exit code (0)', async () => {
      const result = await analyzeCommand.handler(baseArgs);

      expect(result.exitCode).toBe(ExitCode.Success);
    });

    it('should return AnalyzeOutput structure', async () => {
      const result = await analyzeCommand.handler(baseArgs);

      expect(result.output).toMatchObject({
        tool: 'agent-gate',
        command: 'analyze',
        repo: expect.any(Object),
        projects: expect.any(Array),
        warnings: expect.any(Array),
        artifacts: expect.any(Object),
      });
    });

    it('should use --repo option as repo root when provided', async () => {
      const customRepo = path.join(tempDir, 'custom-path');
      const result = await analyzeCommand.handler({
        ...baseArgs,
        repo: customRepo,
      });

      expect((result.output as { repo: { root: string } }).repo.root).toBe(
        customRepo,
      );
    });

    it('should use process.cwd() when --repo not provided', async () => {
      const result = await analyzeCommand.handler(baseArgs);

      expect((result.output as { repo: { root: string } }).repo.root).toBe(
        tempDir,
      );
    });

    it('should include tool metadata', async () => {
      const result = await analyzeCommand.handler(baseArgs);

      expect(result.output).toMatchObject({
        tool: 'agent-gate',
        toolVersion: version,
        schemaVersion: 1,
      });
    });

    it('should set command to "analyze"', async () => {
      const result = await analyzeCommand.handler(baseArgs);

      expect((result.output as { command: string }).command).toBe('analyze');
    });

    it('should include generatedAt timestamp', async () => {
      const result = await analyzeCommand.handler(baseArgs);

      const output = result.output as { generatedAt: string };
      expect(output.generatedAt).toBeDefined();
      expect(() => new Date(output.generatedAt)).not.toThrow();
    });

    it('should include repo.root and repo.id', async () => {
      const result = await analyzeCommand.handler(baseArgs);

      const output = result.output as { repo: { root: string; id: string } };
      expect(output.repo.root).toBeDefined();
      expect(output.repo.id).toBeDefined();
    });

    it('should include projects array', async () => {
      const result = await analyzeCommand.handler(baseArgs);

      const output = result.output as { projects: unknown[] };
      expect(Array.isArray(output.projects)).toBe(true);
    });

    it('should include warnings array', async () => {
      const result = await analyzeCommand.handler(baseArgs);

      const output = result.output as { warnings: unknown[] };
      expect(Array.isArray(output.warnings)).toBe(true);
    });

    it('should include artifacts paths', async () => {
      const result = await analyzeCommand.handler(baseArgs);

      expect(result.output).toMatchObject({
        artifacts: {
          logDir: expect.any(String),
          reportPath: expect.any(String),
        },
      });
    });

    it('should respect --pretty flag in result', async () => {
      const result = await analyzeCommand.handler({ ...baseArgs, pretty: true });

      expect(result.pretty).toBe(true);
    });
  });
});
