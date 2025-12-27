import { describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { checkDependencyStatus } from '../deps-check.js';

describe('checkDependencyStatus', () => {
  it('reports missing node dependencies when package.json is present without node_modules', async () => {
    const repoRoot = await mkdtemp(path.join(os.tmpdir(), 'agent-gate-deps-'));

    try {
      await writeFile(path.join(repoRoot, 'package.json'), '{"name":"demo"}');

      const result = await checkDependencyStatus(repoRoot);

      expect(result.required).toBe(true);
      expect(result.missing).toBe(true);
      expect(result.reasons[0]).toContain('node dependencies');
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
    }
  });

  it('reports dependencies available when expected directories exist', async () => {
    const repoRoot = await mkdtemp(path.join(os.tmpdir(), 'agent-gate-deps-'));

    try {
      await writeFile(path.join(repoRoot, 'package.json'), '{"name":"demo"}');
      await mkdir(path.join(repoRoot, 'node_modules'));

      const result = await checkDependencyStatus(repoRoot);

      expect(result.required).toBe(true);
      expect(result.missing).toBe(false);
      expect(result.reasons).toHaveLength(0);
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
    }
  });
});
