import { describe, it, expect } from 'vitest';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ensureDaemonDir, resolveDaemonPaths } from '../paths.js';

describe('daemon paths', () => {
  it('should resolve daemon paths under repo root', () => {
    const repoRoot = '/repo/root';
    const paths = resolveDaemonPaths(repoRoot);

    expect(paths.dirAbsolute).toBe('/repo/root/.agent-gate/daemon');
    expect(paths.socketPath).toBe('/repo/root/.agent-gate/daemon/daemon.sock');
    expect(paths.statePath).toBe('/repo/root/.agent-gate/daemon/daemon.json');
    expect(paths.lockPath).toBe('/repo/root/.agent-gate/daemon/daemon.lock');
  });

  it('should ensure daemon dir exists', async () => {
    const repoRoot = await mkdtemp(path.join(os.tmpdir(), 'agent-gate-'));
    const paths = resolveDaemonPaths(repoRoot);

    try {
      await ensureDaemonDir(paths.dirAbsolute);
      const stats = await stat(paths.dirAbsolute);
      expect(stats.isDirectory()).toBe(true);
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
    }
  });
});
