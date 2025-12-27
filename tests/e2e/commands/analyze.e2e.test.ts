import { describe, it, expect } from 'vitest';
import { runCli } from '../../helpers/cli-runner.js';
import { assertAnalyzeOutput } from '../../helpers/json-assertions.js';

describe('analyze command E2E', () => {
  it('should return AnalyzeOutput structure', async () => {
    const result = await runCli(['analyze']);
    expect(result.exitCode).toBe(0);
    assertAnalyzeOutput(result.json);
  });

  it('should use current directory as default repo', async () => {
    const result = await runCli(['analyze']);
    const output = result.json as { repo: { root: string } };
    expect(output.repo.root).toBe(process.cwd());
  });

  it('should use specified --repo path', async () => {
    const result = await runCli(['analyze', '--repo', '/tmp']);
    const output = result.json as { repo: { root: string } };
    expect(output.repo.root).toBe('/tmp');
  });

  it('should include projects array', async () => {
    const result = await runCli(['analyze']);
    const output = result.json as { projects: unknown[] };
    expect(Array.isArray(output.projects)).toBe(true);
  });

  it('should include warnings array', async () => {
    const result = await runCli(['analyze']);
    const output = result.json as { warnings: unknown[] };
    expect(Array.isArray(output.warnings)).toBe(true);
  });

  it('should include artifacts with logDir and reportPath', async () => {
    const result = await runCli(['analyze']);
    const output = result.json as {
      artifacts: { logDir: string; reportPath: string };
    };
    expect(output.artifacts.logDir).toBeDefined();
    expect(output.artifacts.reportPath).toBeDefined();
  });
});
