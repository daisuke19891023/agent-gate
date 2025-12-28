import { describe, it, expect } from "vitest";
import { runCommand } from "../run-command.js";

describe("runCommand", () => {
  it("should timeout and kill the process group", async () => {
    const result = await runCommand({
      command: process.execPath,
      args: ["-e", "setTimeout(() => {}, 10000);"],
      timeoutMs: 100
    });

    expect(result.timedOut).toBe(true);
    expect(result.aborted).toBe(false);
  });

  it("should abort and kill the process group", async () => {
    const controller = new AbortController();
    const promise = runCommand({
      command: process.execPath,
      args: ["-e", "setTimeout(() => {}, 10000);"],
      signal: controller.signal,
      timeoutMs: 5000
    });

    setTimeout(() => controller.abort(), 100);
    const result = await promise;

    expect(result.aborted).toBe(true);
    expect(result.timedOut).toBe(false);
  });
});
