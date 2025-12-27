import net from "node:net";
import { unlink } from "node:fs/promises";
import type { Logger } from "../core/logger.js";
import type { DaemonRequest, DaemonResponse } from "./ipc.js";
import { writeDaemonState, removeDaemonState } from "./state.js";
import { TaskQueue } from "./task-queue.js";

export interface DaemonServerOptions {
  socketPath: string;
  statePath: string;
  lockPath: string;
  logger: Logger;
}

export interface DaemonServerHandle {
  startedAt: string;
  close: () => Promise<void>;
}

export async function startDaemonServer(options: DaemonServerOptions): Promise<DaemonServerHandle> {
  const { socketPath, statePath, lockPath, logger } = options;
  const startedAt = new Date().toISOString();
  const queue = new TaskQueue();

  const server = net.createServer((socket) => {
    let buffer = "";
    socket.on("data", (chunk) => {
      buffer += chunk.toString();
      const newlineIndex = buffer.indexOf("\n");
      if (newlineIndex !== -1) {
        const line = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);
        void queue.enqueue(async () => {
          const { response, shouldStop } = await handleRequest(line, startedAt);
          socket.write(JSON.stringify(response) + "\n");
          socket.end();
          if (shouldStop) {
            await shutdown("stop-request");
          }
        });
      }
    });
  });

  const shutdown = async (reason: string): Promise<void> => {
    logger.info("daemon shutting down", { reason });
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
    await removeDaemonState(statePath);
    await removeDaemonState(lockPath);
    await unlink(socketPath).catch(() => undefined);
  };

  const stopHandler = (): void => {
    void shutdown("signal");
  };

  process.on("SIGINT", stopHandler);
  process.on("SIGTERM", stopHandler);

  await new Promise<void>((resolve, reject) => {
    server.on("error", reject);
    server.listen(socketPath, () => {
      logger.info("daemon server listening", { socketPath });
      resolve();
    });
  });

  await writeDaemonState(statePath, {
    pid: process.pid,
    startedAt,
    socketPath
  });
  await writeDaemonState(lockPath, {
    pid: process.pid,
    startedAt,
    socketPath
  });

  return {
    startedAt,
    close: () => shutdown("stop-request")
  };
}

async function handleRequest(
  raw: string,
  startedAt: string
): Promise<{ response: DaemonResponse; shouldStop: boolean }> {
  let request: DaemonRequest;
  try {
    request = JSON.parse(raw) as DaemonRequest;
  } catch {
    return {
      response: {
        ok: false,
        status: "running",
        message: "invalid request"
      },
      shouldStop: false
    };
  }

  switch (request.type) {
    case "status":
    case "ping":
      return {
        response: {
          ok: true,
          status: "running",
          pid: process.pid,
          startedAt
        },
        shouldStop: false
      };
    case "stop":
      return {
        response: {
          ok: true,
          status: "stopped",
          pid: process.pid,
          startedAt
        },
        shouldStop: true
      };
    default: {
      const exhaustiveCheck: never = request;
      return {
        response: {
          ok: false,
          status: "running",
          message: `unknown request: ${(exhaustiveCheck as DaemonRequest).type}`
        },
        shouldStop: false
      };
    }
  }
}
