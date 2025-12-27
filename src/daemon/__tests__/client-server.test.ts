import { describe, it, expect } from 'vitest';
import { mkdtemp, rm, readFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { createJsonLogger } from '../../core/logger.js';
import { sendDaemonRequest, tryGetDaemonStatus } from '../client.js';
import { startDaemonServer } from '../server.js';

describe('daemon client/server', () => {
  it('should respond to status, ping, and stop', async () => {
    const repoRoot = await mkdtemp(path.join(os.tmpdir(), 'agent-gate-'));
    const socketPath = path.join(repoRoot, 'daemon.sock');
    const statePath = path.join(repoRoot, 'daemon.json');
    const lockPath = path.join(repoRoot, 'daemon.lock');
    const logDir = path.join(repoRoot, 'logs');

    await mkdir(logDir, { recursive: true });
    const logger = createJsonLogger({
      logDirAbsolute: logDir,
      level: 'info',
      context: {
        repoId: 'test-repo',
        sessionId: 'session',
        command: 'daemon',
      },
      step: 'test',
    });

    try {
      await startDaemonServer({
        socketPath,
        statePath,
        lockPath,
        logger,
      });

      const status = await sendDaemonRequest(
        { type: 'status' },
        { socketPath },
      );
      expect(status).toMatchObject({ ok: true, status: 'running' });

      const ping = await sendDaemonRequest({ type: 'ping' }, { socketPath });
      expect(ping).toMatchObject({ ok: true, status: 'running' });

      const stop = await sendDaemonRequest({ type: 'stop' }, { socketPath });
      expect(stop).toMatchObject({ ok: true, status: 'stopped' });

      const afterStop = await tryGetDaemonStatus({ socketPath });
      expect(afterStop).toBeNull();
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
    }
  });

  it('should handle invalid requests without crashing', async () => {
    const repoRoot = await mkdtemp(path.join(os.tmpdir(), 'agent-gate-'));
    const socketPath = path.join(repoRoot, 'daemon.sock');
    const statePath = path.join(repoRoot, 'daemon.json');
    const lockPath = path.join(repoRoot, 'daemon.lock');
    const logDir = path.join(repoRoot, 'logs');

    await mkdir(logDir, { recursive: true });
    const logger = createJsonLogger({
      logDirAbsolute: logDir,
      level: 'info',
      context: {
        repoId: 'test-repo',
        sessionId: 'session',
        command: 'daemon',
      },
      step: 'test',
    });

    try {
      await startDaemonServer({
        socketPath,
        statePath,
        lockPath,
        logger,
      });

      const response = await sendRaw(socketPath, 'not-json\n');
      const parsed = JSON.parse(response) as { ok: boolean; message?: string };
      expect(parsed.ok).toBe(false);
      expect(parsed.message).toBeDefined();

      const status = await sendDaemonRequest(
        { type: 'status' },
        { socketPath },
      );
      expect(status.ok).toBe(true);

      await sendDaemonRequest({ type: 'stop' }, { socketPath });
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
    }
  });

  it('should write log entries for server lifecycle', async () => {
    const repoRoot = await mkdtemp(path.join(os.tmpdir(), 'agent-gate-'));
    const socketPath = path.join(repoRoot, 'daemon.sock');
    const statePath = path.join(repoRoot, 'daemon.json');
    const lockPath = path.join(repoRoot, 'daemon.lock');
    const logDir = path.join(repoRoot, 'logs');

    await mkdir(logDir, { recursive: true });
    const logger = createJsonLogger({
      logDirAbsolute: logDir,
      level: 'info',
      context: {
        repoId: 'test-repo',
        sessionId: 'session',
        command: 'daemon',
      },
      step: 'test',
    });

    try {
      await startDaemonServer({
        socketPath,
        statePath,
        lockPath,
        logger,
      });
      await sendDaemonRequest({ type: 'stop' }, { socketPath });

      const contents = await readFile(logger.logFilePath, 'utf8');
      expect(contents).toContain('daemon server listening');
      expect(contents).toContain('daemon shutting down');
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
    }
  });
});

async function sendRaw(socketPath: string, payload: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ path: socketPath });
    let buffer = '';
    socket.on('connect', () => {
      socket.write(payload);
    });
    socket.on('data', (chunk) => {
      buffer += chunk.toString();
      const newlineIndex = buffer.indexOf('\n');
      if (newlineIndex !== -1) {
        const line = buffer.slice(0, newlineIndex);
        socket.end();
        resolve(line);
      }
    });
    socket.on('error', reject);
  });
}
