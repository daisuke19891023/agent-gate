import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { runCommand } from "../../process/run-command.js";
import {
  isGitAvailable,
  isGitRepository,
  hasCommits,
  getUncommittedChanges,
  getStagedChanges
} from "../git-diff.js";
import { ScopeError } from "../types.js";

describe("git-diff", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), "git-diff-test-"));
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  /**
   * Initialize a git repository in the test directory.
   */
  async function initGitRepo(): Promise<void> {
    await runCommand({
      command: "git",
      args: ["init"],
      cwd: testDir
    });
    await runCommand({
      command: "git",
      args: ["config", "user.email", "test@example.com"],
      cwd: testDir
    });
    await runCommand({
      command: "git",
      args: ["config", "user.name", "Test User"],
      cwd: testDir
    });
  }

  /**
   * Create a file in the test directory.
   */
  async function createFile(relativePath: string, content = ""): Promise<void> {
    const fullPath = path.join(testDir, relativePath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, content);
  }

  /**
   * Stage a file.
   */
  async function stageFile(relativePath: string): Promise<void> {
    await runCommand({
      command: "git",
      args: ["add", relativePath],
      cwd: testDir
    });
  }

  /**
   * Commit staged changes.
   */
  async function commit(message: string): Promise<void> {
    await runCommand({
      command: "git",
      args: ["commit", "-m", message],
      cwd: testDir
    });
  }

  describe("isGitAvailable", () => {
    it("should return true when git is installed", async () => {
      const result = await isGitAvailable();
      expect(result).toBe(true);
    });
  });

  describe("isGitRepository", () => {
    it("should return false for non-git directory", async () => {
      const result = await isGitRepository(testDir);
      expect(result).toBe(false);
    });

    it("should return true for git repository", async () => {
      await initGitRepo();
      const result = await isGitRepository(testDir);
      expect(result).toBe(true);
    });
  });

  describe("hasCommits", () => {
    it("should return false for fresh repository", async () => {
      await initGitRepo();
      const result = await hasCommits(testDir);
      expect(result).toBe(false);
    });

    it("should return true after first commit", async () => {
      await initGitRepo();
      await createFile("test.txt", "content");
      await stageFile("test.txt");
      await commit("Initial commit");

      const result = await hasCommits(testDir);
      expect(result).toBe(true);
    });
  });

  describe("getUncommittedChanges", () => {
    it("should throw for non-git directory", async () => {
      await expect(getUncommittedChanges(testDir)).rejects.toThrow(ScopeError);
    });

    it("should return empty array for clean repository", async () => {
      await initGitRepo();
      await createFile("test.txt", "content");
      await stageFile("test.txt");
      await commit("Initial commit");

      const changes = await getUncommittedChanges(testDir);
      expect(changes).toEqual([]);
    });

    it("should detect untracked files", async () => {
      await initGitRepo();
      await createFile("test.txt", "content");
      await stageFile("test.txt");
      await commit("Initial commit");

      await createFile("untracked.txt", "new content");

      const changes = await getUncommittedChanges(testDir);
      expect(changes.length).toBe(1);
      expect(changes[0]).toEqual({
        path: "untracked.txt",
        changeType: "untracked"
      });
    });

    it("should detect modified files", async () => {
      await initGitRepo();
      await createFile("test.txt", "original");
      await stageFile("test.txt");
      await commit("Initial commit");

      await createFile("test.txt", "modified");

      const changes = await getUncommittedChanges(testDir);
      expect(changes.length).toBe(1);
      expect(changes[0]).toEqual({
        path: "test.txt",
        changeType: "modified"
      });
    });

    it("should detect staged files", async () => {
      await initGitRepo();
      await createFile("test.txt", "content");
      await stageFile("test.txt");
      await commit("Initial commit");

      await createFile("new.txt", "new");
      await stageFile("new.txt");

      const changes = await getUncommittedChanges(testDir);
      expect(changes.length).toBe(1);
      expect(changes[0]).toEqual({
        path: "new.txt",
        changeType: "added"
      });
    });

    it("should detect deleted files", async () => {
      await initGitRepo();
      await createFile("test.txt", "content");
      await stageFile("test.txt");
      await commit("Initial commit");

      await fs.unlink(path.join(testDir, "test.txt"));

      const changes = await getUncommittedChanges(testDir);
      expect(changes.length).toBe(1);
      expect(changes[0]).toEqual({
        path: "test.txt",
        changeType: "deleted"
      });
    });

    it("should detect files in subdirectories", async () => {
      await initGitRepo();
      await createFile("src/lib/utils.ts", "content");
      await stageFile("src/lib/utils.ts");
      await commit("Initial commit");

      await createFile("src/lib/helper.ts", "new");

      const changes = await getUncommittedChanges(testDir);
      expect(changes.length).toBe(1);
      expect(changes[0]?.path).toBe("src/lib/helper.ts");
    });

    it("should sort changes by path", async () => {
      await initGitRepo();
      await createFile("a.txt", "a");
      await stageFile("a.txt");
      await commit("Initial commit");

      await createFile("z.txt", "z");
      await createFile("m.txt", "m");
      await createFile("b.txt", "b");

      const changes = await getUncommittedChanges(testDir);
      expect(changes.map((c) => c.path)).toEqual(["b.txt", "m.txt", "z.txt"]);
    });
  });

  describe("getStagedChanges", () => {
    it("should return empty array when nothing is staged", async () => {
      await initGitRepo();
      await createFile("test.txt", "content");
      await stageFile("test.txt");
      await commit("Initial commit");

      await createFile("untracked.txt", "new");

      const staged = await getStagedChanges(testDir);
      expect(staged).toEqual([]);
    });

    it("should detect staged additions", async () => {
      await initGitRepo();
      await createFile("test.txt", "content");
      await stageFile("test.txt");
      await commit("Initial commit");

      await createFile("new.txt", "new");
      await stageFile("new.txt");

      const staged = await getStagedChanges(testDir);
      expect(staged.length).toBe(1);
      expect(staged[0]).toEqual({
        path: "new.txt",
        changeType: "added"
      });
    });

    it("should work with fresh repo (no commits)", async () => {
      await initGitRepo();
      await createFile("test.txt", "content");
      await stageFile("test.txt");

      const staged = await getStagedChanges(testDir);
      expect(staged.length).toBe(1);
      expect(staged[0]?.changeType).toBe("added");
    });
  });
});
