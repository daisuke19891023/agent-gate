import { randomUUID } from 'node:crypto';
import net from 'node:net';
import path from 'node:path';
import { mkdir, unlink } from 'node:fs/promises';
import { ensureDaemonDir } from './paths.js';
import { createJsonLogger } from '../core/logger.js';
import type { LogLevel } from '../core/log-level.js';
import { startDaemonServer } from './server.js';

const args = process.argv.slice(2);

const repoRoot = getArg('--repo');
const socketPath = getArg('--socket');
const statePath = getArg('--state');
const lockPath = getArg('--lock');
const logDirAbsolute = getArg('--log-dir');
const logLevel = (getArg('--log-level') as LogLevel | null) ?? 'info';

if (!repoRoot || !socketPath || !statePath || !lockPath || !logDirAbsolute) {
  console.error('daemon entrypoint missing required arguments');
  process.exit(1);
}

await mkdir(logDirAbsolute, { recursive: true });
await ensureDaemonDir(path.dirname(socketPath));

const isActive = await isSocketActive(socketPath);
if (isActive) {
  process.exit(0);
}

await unlink(socketPath).catch(() => undefined);

const logger = createJsonLogger({
  logDirAbsolute,
  level: logLevel,
  context: {
    repoId: 'stub-repo-id',
    sessionId: randomUUID(),
    command: 'daemon',
  },
  step: 'bootstrap',
});

try {
  await startDaemonServer({
    socketPath,
    statePath,
    lockPath,
    logger,
  });
} catch (error: unknown) {
  if (isAddressInUse(error)) {
    process.exit(0);
  }
  console.error('daemon entrypoint failed', error);
  process.exit(1);
}

function getArg(flag: string): string | null {
  const index = args.indexOf(flag);
  if (index === -1) {
    return null;
  }
  return args[index + 1] ?? null;
}

async function isSocketActive(target: string): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ path: target });
    const timer = setTimeout(() => {
      socket.destroy();
      resolve(false);
    }, 200);

    socket.on('connect', () => {
      clearTimeout(timer);
      socket.end();
      resolve(true);
    });

    socket.on('error', () => {
      clearTimeout(timer);
      resolve(false);
    });
  });
}

function isAddressInUse(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }
  return 'code' in error && (error as { code?: string }).code === 'EADDRINUSE';
}
