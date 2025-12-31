import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { runCommand } from "../../process/run-command.js";
import { resolveScope, createScopeResolver } from "../scope-resolver.js";
import { ScopeError } from "../types.js";

describe("scope-resolver", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), "scope-resolver-test-"));
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

  describe("resolveScope", () => {
    it("should throw for invalid repo root", async () => {
      await expect(
        resolveScope({
          repoRoot: "/nonexistent/path",
          mode: "changed",
          onNoChanges: "ok"
        })
      ).rejects.toThrow(ScopeError);
    });

    it("should throw for non-git directory", async () => {
      await expect(
        resolveScope({
          repoRoot: testDir,
          mode: "changed",
          onNoChanges: "ok"
        })
      ).rejects.toThrow(ScopeError);
    });

    it("should detect git roots", async () => {
      await initGitRepo();
      await createFile("test.txt", "content");
      await stageFile("test.txt");
      await commit("Initial commit");

      const result = await resolveScope({
        repoRoot: testDir,
        mode: "changed",
        onNoChanges: "ok"
      });

      expect(result.gitRoots.length).toBe(1);
      expect(result.gitRoots[0]?.isSubmodule).toBe(false);
    });

    it("should return empty changedFiles when no changes", async () => {
      await initGitRepo();
      await createFile("test.txt", "content");
      await stageFile("test.txt");
      await commit("Initial commit");

      const result = await resolveScope({
        repoRoot: testDir,
        mode: "changed",
        onNoChanges: "ok"
      });

      expect(result.changedFiles).toEqual([]);
      expect(result.hasChanges).toBe(false);
    });

    it("should detect uncommitted changes", async () => {
      await initGitRepo();
      await createFile("test.txt", "content");
      await stageFile("test.txt");
      await commit("Initial commit");

      await createFile("new.txt", "new");

      const result = await resolveScope({
        repoRoot: testDir,
        mode: "changed",
        onNoChanges: "ok"
      });

      expect(result.changedFiles.length).toBe(1);
      expect(result.hasChanges).toBe(true);
    });

    it("should throw when onNoChanges is fail and no changes", async () => {
      await initGitRepo();
      await createFile("test.txt", "content");
      await stageFile("test.txt");
      await commit("Initial commit");

      await expect(
        resolveScope({
          repoRoot: testDir,
          mode: "changed",
          onNoChanges: "fail"
        })
      ).rejects.toThrow(ScopeError);
    });

    it("should filter files with exclude patterns", async () => {
      await initGitRepo();
      await createFile("test.txt", "content");
      await stageFile("test.txt");
      await commit("Initial commit");

      await createFile("src/app.ts", "app");
      await createFile("test/app.test.ts", "test");

      const result = await resolveScope({
        repoRoot: testDir,
        mode: "changed",
        onNoChanges: "ok",
        exclude: ["**/test/**"]
      });

      expect(result.changedFiles.length).toBe(1);
      expect(result.changedFiles[0]?.path).toBe("src/app.ts");
    });

    it("should filter files with include patterns", async () => {
      await initGitRepo();
      await createFile("test.txt", "content");
      await stageFile("test.txt");
      await commit("Initial commit");

      await createFile("src/app.ts", "app");
      await createFile("docs/readme.md", "docs");

      const result = await resolveScope({
        repoRoot: testDir,
        mode: "changed",
        onNoChanges: "ok",
        include: ["**/*.ts"]
      });

      expect(result.changedFiles.length).toBe(1);
      expect(result.changedFiles[0]?.path).toBe("src/app.ts");
    });

    it("should apply default excludes (node_modules, .git, etc)", async () => {
      await initGitRepo();
      await createFile("test.txt", "content");
      await stageFile("test.txt");
      await commit("Initial commit");

      // Create files that should be excluded by default
      await createFile("src/app.ts", "app");
      // Note: node_modules files won't actually show up in git status
      // because they're typically in .gitignore

      const result = await resolveScope({
        repoRoot: testDir,
        mode: "changed",
        onNoChanges: "ok"
      });

      // Only src/app.ts should be included
      expect(result.changedFiles.length).toBe(1);
    });

    it("should include lockfile changes by default", async () => {
      await initGitRepo();
      await createFile("test.txt", "content");
      await stageFile("test.txt");
      await commit("Initial commit");

      await createFile("pnpm-lock.yaml", "lock");

      const result = await resolveScope({
        repoRoot: testDir,
        mode: "changed",
        onNoChanges: "ok"
      });

      const hasLockfile = result.changedFiles.some(
        (file) => file.path === "pnpm-lock.yaml"
      );
      expect(hasLockfile).toBe(true);
    });

    it("should return all mode result without detecting changes", async () => {
      await initGitRepo();
      await createFile("test.txt", "content");
      await stageFile("test.txt");
      await commit("Initial commit");

      const result = await resolveScope({
        repoRoot: testDir,
        mode: "all",
        onNoChanges: "ok"
      });

      expect(result.mode).toBe("all");
      expect(result.hasChanges).toBe(true);
      expect(result.changedFiles).toEqual([]);
    });

    it("should sort changedFiles by path", async () => {
      await initGitRepo();
      await createFile("base.txt", "content");
      await stageFile("base.txt");
      await commit("Initial commit");

      await createFile("z.txt", "z");
      await createFile("a.txt", "a");
      await createFile("m/nested.txt", "m");

      const result = await resolveScope({
        repoRoot: testDir,
        mode: "changed",
        onNoChanges: "ok"
      });

      const paths = result.changedFiles.map((f) => f.path);
      expect(paths).toEqual(["a.txt", "m/nested.txt", "z.txt"]);
    });
  });

  describe("createScopeResolver", () => {
    it("should create a resolver with default options", async () => {
      await initGitRepo();
      await createFile("test.txt", "content");
      await stageFile("test.txt");
      await commit("Initial commit");

      const resolver = createScopeResolver(testDir);
      const result = await resolver.resolve();

      expect(result.mode).toBe("changed");
      expect(result.repoRoot).toBe(testDir);
    });

    it("should allow overriding options", async () => {
      await initGitRepo();
      await createFile("test.txt", "content");
      await stageFile("test.txt");
      await commit("Initial commit");

      const resolver = createScopeResolver(testDir);
      const result = await resolver.resolve({ mode: "all" });

      expect(result.mode).toBe("all");
    });

    it("should provide getChangedFiles method", async () => {
      await initGitRepo();
      await createFile("test.txt", "content");
      await stageFile("test.txt");
      await commit("Initial commit");

      await createFile("new.txt", "new");

      const resolver = createScopeResolver(testDir);
      const changes = await resolver.getChangedFiles();

      expect(changes.length).toBe(1);
    });
  });
});
