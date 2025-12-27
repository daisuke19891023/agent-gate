import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockTryGetDaemonStatus = vi.fn();
const mockSendDaemonRequest = vi.fn();
const mockEnsureDaemonDir = vi.fn();
const mockResolveDaemonPaths = vi.fn();
const mockReadDaemonState = vi.fn();
const mockSpawn = vi.fn();

vi.mock('../client.js', () => ({
  tryGetDaemonStatus: (...args: unknown[]) => mockTryGetDaemonStatus(...args),
  sendDaemonRequest: (...args: unknown[]) => mockSendDaemonRequest(...args),
}));

vi.mock('../paths.js', () => ({
  ensureDaemonDir: (...args: unknown[]) => mockEnsureDaemonDir(...args),
  resolveDaemonPaths: (...args: unknown[]) => mockResolveDaemonPaths(...args),
}));

vi.mock('../state.js', () => ({
  readDaemonState: (...args: unknown[]) => mockReadDaemonState(...args),
}));

vi.mock('node:child_process', () => ({
  spawn: (...args: unknown[]) => mockSpawn(...args),
}));

describe('daemon manager', () => {
  beforeEach(() => {
    vi.resetModules();
    mockTryGetDaemonStatus.mockReset();
    mockSendDaemonRequest.mockReset();
    mockEnsureDaemonDir.mockReset();
    mockResolveDaemonPaths.mockReset();
    mockReadDaemonState.mockReset();
    mockSpawn.mockReset();
  });

  it('should reuse running daemon', async () => {
    mockResolveDaemonPaths.mockReturnValue({
      dirAbsolute: '/repo/.agent-gate/daemon',
      socketPath: '/repo/.agent-gate/daemon/daemon.sock',
      statePath: '/repo/.agent-gate/daemon/daemon.json',
      lockPath: '/repo/.agent-gate/daemon/daemon.lock',
    });
    mockTryGetDaemonStatus.mockResolvedValue({
      ok: true,
      status: 'running',
      pid: 123,
      startedAt: '2024-01-01T00:00:00.000Z',
    });

    const { ensureDaemonRunning } = await import('../manager.js');
    const result = await ensureDaemonRunning({
      repoRoot: '/repo',
      logDirAbsolute: '/repo/logs',
      logLevel: 'info',
    });

    expect(result.status).toBe('running');
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it('should return stopped when state exists without socket', async () => {
    mockResolveDaemonPaths.mockReturnValue({
      dirAbsolute: '/repo/.agent-gate/daemon',
      socketPath: '/repo/.agent-gate/daemon/daemon.sock',
      statePath: '/repo/.agent-gate/daemon/daemon.json',
      lockPath: '/repo/.agent-gate/daemon/daemon.lock',
    });
    mockTryGetDaemonStatus.mockResolvedValue(null);
    mockReadDaemonState.mockResolvedValue({
      pid: 99,
      startedAt: '2024-01-01T00:00:00.000Z',
      socketPath: '/repo/.agent-gate/daemon/daemon.sock',
    });

    const { getDaemonStatus } = await import('../manager.js');
    const result = await getDaemonStatus('/repo');

    expect(result.status).toBe('stopped');
    expect(result.pid).toBe(99);
  });

  it('should return not_found when stop request fails', async () => {
    mockResolveDaemonPaths.mockReturnValue({
      dirAbsolute: '/repo/.agent-gate/daemon',
      socketPath: '/repo/.agent-gate/daemon/daemon.sock',
      statePath: '/repo/.agent-gate/daemon/daemon.json',
      lockPath: '/repo/.agent-gate/daemon/daemon.lock',
    });
    mockTryGetDaemonStatus.mockResolvedValue({
      ok: true,
      status: 'running',
      pid: 123,
      startedAt: '2024-01-01T00:00:00.000Z',
    });
    mockSendDaemonRequest.mockRejectedValue(new Error('boom'));

    const { stopDaemon } = await import('../manager.js');
    const result = await stopDaemon('/repo');

    expect(result.status).toBe('not_found');
  });
});
