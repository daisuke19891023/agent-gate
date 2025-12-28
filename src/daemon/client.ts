import net from "node:net";
import type { DaemonRequest, DaemonResponse } from "./ipc.js";

export interface DaemonClientOptions {
  socketPath: string;
  timeoutMs?: number;
}

export async function sendDaemonRequest(
  request: DaemonRequest,
  options: DaemonClientOptions
): Promise<DaemonResponse> {
  const { socketPath, timeoutMs = 1000 } = options;

  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ path: socketPath });
    let buffer = "";
    const timer = setTimeout(() => {
      socket.destroy(new Error("daemon request timeout"));
    }, timeoutMs);

    socket.on("connect", () => {
      socket.write(JSON.stringify(request) + "\n");
    });

    socket.on("data", (chunk) => {
      buffer += chunk.toString();
      const newlineIndex = buffer.indexOf("\n");
      if (newlineIndex !== -1) {
        const line = buffer.slice(0, newlineIndex);
        clearTimeout(timer);
        socket.end();
        try {
          resolve(JSON.parse(line) as DaemonResponse);
        } catch (error) {
          reject(error);
        }
      }
    });

    socket.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });

    socket.on("end", () => {
      clearTimeout(timer);
      if (!buffer) {
        reject(new Error("daemon response missing"));
      }
    });
  });
}

export async function tryGetDaemonStatus(
  options: DaemonClientOptions
): Promise<DaemonResponse | null> {
  try {
    return await sendDaemonRequest({ type: "status" }, options);
  } catch {
    return null;
  }
}
