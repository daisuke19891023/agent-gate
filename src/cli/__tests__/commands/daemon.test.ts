import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { daemonCommand } from '../../commands/daemon.js';
import { ExitCode } from '../../exit-codes.js';
import { version } from '../../version.js';

describe('daemonCommand', () => {
  const originalCwd = process.cwd;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'agent-gate-daemon-'));
    process.cwd = vi.fn().mockReturnValue(tempDir);
  });

  afterEach(async () => {
    process.cwd = originalCwd;
    await rm(tempDir, { recursive: true, force: true });
  });
  describe('command metadata', () => {
    it('should have command name "daemon <action>"', () => {
      expect(daemonCommand.command).toBe('daemon <action>');
    });

    it('should have description', () => {
      expect(daemonCommand.describe).toBeDefined();
      expect(typeof daemonCommand.describe).toBe('string');
    });

    it('should define builder for positional argument', () => {
      expect(daemonCommand.builder).toBeDefined();
      expect(typeof daemonCommand.builder).toBe('function');
    });
  });

  describe('handler - status action', () => {
    const baseArgs = {
      action: 'status' as const,
      scope: 'changed' as const,
      pretty: false,
      'log-level': 'info' as const,
    };

    it('should return Success exit code (0)', async () => {
      const result = await daemonCommand.handler(baseArgs);

      expect(result.exitCode).toBe(ExitCode.Success);
    });

    it('should return DaemonOutput with action "status"', async () => {
      const result = await daemonCommand.handler(baseArgs);

      expect((result.output as { action: string }).action).toBe('status');
    });

    it('should include status field', async () => {
      const result = await daemonCommand.handler(baseArgs);

      expect((result.output as { status: string }).status).toBeDefined();
    });

    it('should include tool metadata', async () => {
      const result = await daemonCommand.handler(baseArgs);

      expect(result.output).toMatchObject({
        tool: 'agent-gate',
        toolVersion: version,
        schemaVersion: 1,
      });
    });

    it('should set command to "daemon"', async () => {
      const result = await daemonCommand.handler(baseArgs);

      expect((result.output as { command: string }).command).toBe('daemon');
    });

    it('should include generatedAt timestamp', async () => {
      const result = await daemonCommand.handler(baseArgs);

      const output = result.output as { generatedAt: string };
      expect(output.generatedAt).toBeDefined();
      expect(() => new Date(output.generatedAt)).not.toThrow();
    });
  });

  describe('handler - stop action', () => {
    const baseArgs = {
      action: 'stop' as const,
      scope: 'changed' as const,
      pretty: false,
      'log-level': 'info' as const,
    };

    it('should return Success exit code (0)', async () => {
      const result = await daemonCommand.handler(baseArgs);

      expect(result.exitCode).toBe(ExitCode.Success);
    });

    it('should return DaemonOutput with action "stop"', async () => {
      const result = await daemonCommand.handler(baseArgs);

      expect((result.output as { action: string }).action).toBe('stop');
    });

    it('should include status field', async () => {
      const result = await daemonCommand.handler(baseArgs);

      expect((result.output as { status: string }).status).toBeDefined();
    });

    it('should respect --pretty flag in result', async () => {
      const result = await daemonCommand.handler({ ...baseArgs, pretty: true });

      expect(result.pretty).toBe(true);
    });
  });
});
