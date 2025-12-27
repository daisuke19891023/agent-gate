import { describe, it, expect } from 'vitest';
import { mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runCli } from '../../helpers/cli-runner.js';
import { assertValidateOutput } from '../../helpers/json-assertions.js';

describe('validate command E2E', () => {
  it('should return ValidateOutput structure', async () => {
    const result = await runCli(['validate']);
    expect(result.exitCode).toBe(0);
    assertValidateOutput(result.json);
  });

  it('should include scope.mode matching --scope option (changed)', async () => {
    const result = await runCli(['validate', '--scope', 'changed']);
    expect((result.json as { scope: { mode: string } }).scope.mode).toBe(
      'changed',
    );
  });

  it('should include scope.mode matching --scope option (all)', async () => {
    const result = await runCli(['validate', '--scope', 'all']);
    expect((result.json as { scope: { mode: string } }).scope.mode).toBe('all');
  });

  it('should default scope to changed', async () => {
    const result = await runCli(['validate']);
    expect((result.json as { scope: { mode: string } }).scope.mode).toBe(
      'changed',
    );
  });

  it('should include required steps (deps, typecheck, lspDiagnostics)', async () => {
    const result = await runCli(['validate']);
    const output = result.json as { steps: Array<{ name: string }> };
    const stepNames = output.steps.map((s) => s.name);
    expect(stepNames).toContain('deps');
    expect(stepNames).toContain('typecheck');
    expect(stepNames).toContain('lspDiagnostics');
  });

  it('should include summary with ok flag', async () => {
    const result = await runCli(['validate']);
    const output = result.json as { summary: { ok: boolean } };
    expect(typeof output.summary.ok).toBe('boolean');
  });

  it('should include summary with errors count', async () => {
    const result = await runCli(['validate']);
    const output = result.json as { summary: { errors: number } };
    expect(typeof output.summary.errors).toBe('number');
  });

  it('should include summary with warnings count', async () => {
    const result = await runCli(['validate']);
    const output = result.json as { summary: { warnings: number } };
    expect(typeof output.summary.warnings).toBe('number');
  });

  it('should include summary with durationMs', async () => {
    const result = await runCli(['validate']);
    const output = result.json as { summary: { durationMs: number } };
    expect(typeof output.summary.durationMs).toBe('number');
  });

  it('should include diagnostics array', async () => {
    const result = await runCli(['validate']);
    const output = result.json as { diagnostics: unknown[] };
    expect(Array.isArray(output.diagnostics)).toBe(true);
  });

  it('should use specified --repo path', async () => {
    const result = await runCli(['validate', '--repo', '/tmp']);
    const output = result.json as { repo: { root: string } };
    expect(output.repo.root).toBe('/tmp');
  });

  it('should write report and log files with env log dir override', async () => {
    const repoRoot = await mkdtemp(path.join(os.tmpdir(), 'agent-gate-e2e-'));
    const customLogDir = path.join(repoRoot, 'custom-logs');

    try {
      const result = await runCli(['validate', '--repo', repoRoot], {
        env: {
          AGENT_TOOLS_LOG_DIR: customLogDir,
        },
      });

      const output = result.json as {
        artifacts: { logDir: string; reportPath: string };
      };

      expect(output.artifacts.logDir).toBe('custom-logs');

      const reportPath = path.resolve(repoRoot, output.artifacts.reportPath);
      await stat(reportPath);

      const logEntries = await readdir(customLogDir);
      expect(logEntries.length).toBeGreaterThan(0);

      const logContents = await readFile(
        path.join(customLogDir, logEntries[0]),
        'utf8',
      );
      const firstLine = logContents.trim().split('\n')[0];
      const payload = JSON.parse(firstLine) as Record<string, unknown>;

      expect(payload).toMatchObject({
        repoId: 'stub-repo-id',
        command: 'validate',
      });
      expect(typeof payload.sessionId).toBe('string');
      expect(typeof payload.step).toBe('string');
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
    }
  });
});
