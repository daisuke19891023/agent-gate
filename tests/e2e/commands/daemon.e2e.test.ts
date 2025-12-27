import { describe, it, expect } from 'vitest';
import { runCli } from '../../helpers/cli-runner.js';
import { assertDaemonOutput } from '../../helpers/json-assertions.js';

describe('daemon command E2E', () => {
  describe('status action', () => {
    it('should return DaemonOutput with status action', async () => {
      const result = await runCli(['daemon', 'status']);
      expect(result.exitCode).toBe(0);
      assertDaemonOutput(result.json, 'status');
    });

    it('should include command "daemon"', async () => {
      const result = await runCli(['daemon', 'status']);
      expect((result.json as { command: string }).command).toBe('daemon');
    });

    it('should include action "status"', async () => {
      const result = await runCli(['daemon', 'status']);
      expect((result.json as { action: string }).action).toBe('status');
    });

    it('should include status field', async () => {
      const result = await runCli(['daemon', 'status']);
      expect((result.json as { status: string }).status).toBeDefined();
    });
  });

  describe('stop action', () => {
    it('should return DaemonOutput with stop action', async () => {
      const result = await runCli(['daemon', 'stop']);
      expect(result.exitCode).toBe(0);
      assertDaemonOutput(result.json, 'stop');
    });

    it('should include command "daemon"', async () => {
      const result = await runCli(['daemon', 'stop']);
      expect((result.json as { command: string }).command).toBe('daemon');
    });

    it('should include action "stop"', async () => {
      const result = await runCli(['daemon', 'stop']);
      expect((result.json as { action: string }).action).toBe('stop');
    });

    it('should include status field', async () => {
      const result = await runCli(['daemon', 'stop']);
      expect((result.json as { status: string }).status).toBeDefined();
    });
  });

  describe('invalid action', () => {
    it('should return error for missing action', async () => {
      const result = await runCli(['daemon']);
      expect(result.exitCode).toBe(2);
    });

    it('should return error for invalid action', async () => {
      const result = await runCli(['daemon', 'invalid']);
      expect(result.exitCode).toBe(2);
    });
  });
});
