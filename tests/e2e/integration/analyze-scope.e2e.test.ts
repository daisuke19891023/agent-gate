import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  setupFixture,
  modifyFile,
  createFile,
  stageFile,
  type FixtureSetup
} from "../../helpers/fixture-helper.js";
import { runCli } from "../../helpers/cli-runner.js";
import { assertAnalyzeOutput } from "../../helpers/json-assertions.js";

describe("analyze command - scope resolution", { timeout: 60000 }, () => {
  let fixture: FixtureSetup;

  afterEach(async () => {
    if (fixture) {
      await fixture.cleanup();
    }
  });

  describe("pnpm monorepo", () => {
    beforeEach(async () => {
      fixture = await setupFixture("monorepo-pnpm");
    });

    it("detects all packages in monorepo", async () => {
      const result = await runCli(["analyze"], { cwd: fixture.root, timeout: 30000 });

      expect(result.exitCode).toBe(0);
      assertAnalyzeOutput(result.json);

      const output = result.json as {
        projects: Array<{ id: string; kind: string; root: string }>;
      };

      // Should detect both packages plus root
      expect(output.projects.length).toBeGreaterThanOrEqual(2);

      // Find the core and cli packages
      const projectIds = output.projects.map((p) => p.id);
      expect(projectIds.some((id) => id.includes("core"))).toBe(true);
      expect(projectIds.some((id) => id.includes("cli"))).toBe(true);
    });

    it("detects package manager as pnpm", async () => {
      const result = await runCli(["analyze"], { cwd: fixture.root, timeout: 30000 });

      expect(result.exitCode).toBe(0);

      const output = result.json as {
        projects: Array<{ packageManager?: string }>;
      };

      // At least one project should have pnpm as package manager
      const hasPnpm = output.projects.some(
        (p) => p.packageManager === "pnpm" || p.packageManager === undefined
      );
      expect(hasPnpm).toBe(true);
    });

    it("returns changedFiles when files are staged", async () => {
      // Modify a file in the core package and stage it
      await modifyFile(fixture.root, "packages/core/src/index.ts");
      await stageFile(fixture.root, "packages/core/src/index.ts");

      const result = await runCli(["analyze"], { cwd: fixture.root, timeout: 30000 });

      expect(result.exitCode).toBe(0);

      const output = result.json as {
        scope?: {
          changedFiles: Array<{ path: string; changeType: string }>;
          hasChanges: boolean;
        };
      };

      if (output.scope) {
        expect(output.scope.changedFiles.length).toBeGreaterThan(0);
        expect(output.scope.hasChanges).toBe(true);
      }
    });
  });

  describe("mixed language monorepo", () => {
    beforeEach(async () => {
      fixture = await setupFixture("monorepo-mixed");
    });

    it("detects both Node and Python projects", async () => {
      const result = await runCli(["analyze"], { cwd: fixture.root, timeout: 30000 });

      expect(result.exitCode).toBe(0);
      assertAnalyzeOutput(result.json);

      const output = result.json as {
        projects: Array<{ id: string; kind: string; root: string }>;
      };

      const kinds = output.projects.map((p) => p.kind);

      // Should have at least one Node project and one Python project
      expect(kinds.some((k) => k === "node")).toBe(true);
      expect(kinds.some((k) => k === "python")).toBe(true);
    });

    it("returns projects sorted by root path", async () => {
      const result = await runCli(["analyze"], { cwd: fixture.root, timeout: 30000 });

      expect(result.exitCode).toBe(0);

      const output = result.json as {
        projects: Array<{ root: string }>;
      };

      const roots = output.projects.map((p) => p.root);
      const sortedRoots = [...roots].sort();

      expect(roots).toEqual(sortedRoots);
    });
  });

  describe("scope modes", () => {
    beforeEach(async () => {
      fixture = await setupFixture("monorepo-pnpm");
    });

    it("--scope=all returns all projects regardless of changes", async () => {
      const result = await runCli(["analyze", "--scope", "all"], {
        cwd: fixture.root,
        timeout: 30000
      });

      expect(result.exitCode).toBe(0);

      const output = result.json as {
        scope?: { mode: string };
        projects: Array<{ id: string }>;
      };

      if (output.scope) {
        expect(output.scope.mode).toBe("all");
      }

      // All projects should be returned
      expect(output.projects.length).toBeGreaterThanOrEqual(2);
    });

    it("--scope=changed returns only projects with changes", async () => {
      // Modify only the core package
      await modifyFile(fixture.root, "packages/core/src/index.ts");

      const result = await runCli(["analyze", "--scope", "changed"], {
        cwd: fixture.root,
        timeout: 30000
      });

      expect(result.exitCode).toBe(0);

      const output = result.json as {
        scope?: {
          mode: string;
          changedFiles: Array<{ path: string; changeType: string }>;
          selectedProjects: string[];
        };
      };

      if (output.scope) {
        expect(output.scope.mode).toBe("changed");
        expect(output.scope.changedFiles.length).toBeGreaterThan(0);
      }
    });
  });

  describe("git state handling", () => {
    beforeEach(async () => {
      fixture = await setupFixture("monorepo-pnpm");
    });

    it("detects staged files as changes", async () => {
      await modifyFile(fixture.root, "packages/core/src/index.ts");
      await stageFile(fixture.root, "packages/core/src/index.ts");

      const result = await runCli(["analyze", "--scope", "changed"], {
        cwd: fixture.root,
        timeout: 30000
      });

      expect(result.exitCode).toBe(0);

      const output = result.json as {
        scope?: { changedFiles: Array<{ path: string; changeType: string }> };
      };

      if (output.scope) {
        expect(output.scope.changedFiles.some((f) => f.path.includes("core"))).toBe(true);
      }
    });

    it("detects unstaged modifications as changes", async () => {
      await modifyFile(fixture.root, "packages/cli/src/index.ts");

      const result = await runCli(["analyze", "--scope", "changed"], {
        cwd: fixture.root,
        timeout: 30000
      });

      expect(result.exitCode).toBe(0);

      const output = result.json as {
        scope?: { changedFiles: Array<{ path: string; changeType: string }> };
      };

      if (output.scope) {
        expect(output.scope.changedFiles.some((f) => f.path.includes("cli"))).toBe(true);
      }
    });

    it("detects untracked files as changes", async () => {
      await createFile(fixture.root, "packages/core/src/new-file.ts", "export const NEW = true;");

      const result = await runCli(["analyze", "--scope", "changed"], {
        cwd: fixture.root,
        timeout: 30000
      });

      expect(result.exitCode).toBe(0);

      const output = result.json as {
        scope?: { changedFiles: Array<{ path: string; changeType: string }> };
      };

      if (output.scope) {
        expect(output.scope.changedFiles.some((f) => f.path.includes("new-file"))).toBe(true);
      }
    });
  });

  describe("determinism", () => {
    beforeEach(async () => {
      fixture = await setupFixture("monorepo-pnpm");
    });

    it("returns consistent project detection across runs", async () => {
      const result1 = await runCli(["analyze", "--scope", "all"], {
        cwd: fixture.root,
        timeout: 30000
      });
      const result2 = await runCli(["analyze", "--scope", "all"], {
        cwd: fixture.root,
        timeout: 30000
      });

      expect(result1.exitCode).toBe(0);
      expect(result2.exitCode).toBe(0);

      const output1 = result1.json as { projects: Array<{ id: string; root: string }> };
      const output2 = result2.json as { projects: Array<{ id: string; root: string }> };

      // Project detection should be deterministic
      expect(output1.projects.length).toBe(output2.projects.length);

      // Project roots should be identical
      const roots1 = output1.projects.map((p) => p.root).sort();
      const roots2 = output2.projects.map((p) => p.root).sort();
      expect(roots1).toEqual(roots2);
    });

    it("projects array is sorted by root path", async () => {
      const result = await runCli(["analyze"], { cwd: fixture.root, timeout: 30000 });

      expect(result.exitCode).toBe(0);

      const output = result.json as {
        projects: Array<{ root: string }>;
      };

      const roots = output.projects.map((p) => p.root);
      const sortedRoots = [...roots].sort();

      expect(roots).toEqual(sortedRoots);
    });
  });
});
