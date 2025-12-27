import { describe, it, expect } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createJsonLogger } from "../../core/logger.js";

describe("createJsonLogger", () => {
  it("writes JSON lines with correlation keys", async () => {
    const logDir = await mkdtemp(path.join(os.tmpdir(), "agent-gate-logger-"));
    try {
      const logger = createJsonLogger({
        logDirAbsolute: logDir,
        level: "info",
        context: {
          repoId: "repo-123",
          sessionId: "session-456",
          command: "analyze"
        },
        step: "bootstrap"
      });

      logger.info("test message", { detail: "value" });

      const contents = await readFile(logger.logFilePath, "utf8");
      const [line] = contents.trim().split("\n");
      const payload = JSON.parse(line) as Record<string, unknown>;

      expect(payload).toMatchObject({
        level: "info",
        message: "test message",
        repoId: "repo-123",
        sessionId: "session-456",
        command: "analyze",
        step: "bootstrap",
        detail: "value"
      });
    } finally {
      await rm(logDir, { recursive: true, force: true });
    }
  });
});
