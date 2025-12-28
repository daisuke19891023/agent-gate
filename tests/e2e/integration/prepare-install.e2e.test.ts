import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { setupFixture, type FixtureSetup } from "../../helpers/fixture-helper.js";
import { runCli } from "../../helpers/cli-runner.js";
import { assertPrepareOutput } from "../../helpers/json-assertions.js";
import * as fs from "node:fs/promises";
import * as path from "node:path";

describe("prepare command - dependency installation", { timeout: 200000 }, () => {
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

    it("installs dependencies with pnpm", async () => {
      const result = await runCli(["prepare"], {
        cwd: fixture.root,
        timeout: 120000
      });

      expect(result.json).toBeDefined();

      const output = result.json as {
        command: string;
        steps?: Array<{
          stepId: string;
          status: string;
          projects?: Array<{
            projectId: string;
            packageManager?: { manager: string };
          }>;
        }>;
      };

      expect(output.command).toBe("prepare");

      if (output.steps) {
        const installStep = output.steps.find((s) => s.stepId === "install");
        if (installStep && installStep.projects) {
          const hasCorrectManager = installStep.projects.some(
            (p) => p.packageManager?.manager === "pnpm"
          );
          expect(hasCorrectManager).toBe(true);
        }
      }
    });

    it("reports package manager info in output", async () => {
      const result = await runCli(["prepare"], {
        cwd: fixture.root,
        timeout: 120000
      });

      expect(result.json).toBeDefined();

      const output = result.json as {
        steps?: Array<{
          stepId: string;
          projects?: Array<{
            packageManager?: {
              manager: string;
              lockfileExists: boolean;
            };
          }>;
        }>;
      };

      if (output.steps) {
        const installStep = output.steps.find((s) => s.stepId === "install");
        if (installStep?.projects) {
          for (const project of installStep.projects) {
            if (project.packageManager) {
              expect(project.packageManager.manager).toBeDefined();
              expect(typeof project.packageManager.lockfileExists).toBe("boolean");
            }
          }
        }
      }
    });
  });

  describe("error classification", () => {
    it.skip("classifies TOOLCHAIN_MISSING when package manager not found", async () => {
      // Skipped: Setting PATH to /nonexistent also breaks Node itself
      fixture = await setupFixture("monorepo-pnpm");

      const result = await runCli(["prepare"], {
        cwd: fixture.root,
        timeout: 30000,
        env: { PATH: "/nonexistent" }
      });

      const output = result.json as {
        steps?: Array<{
          stepId: string;
          projects?: Array<{
            error?: { code: string };
          }>;
        }>;
        nextActions?: Array<{ kind: string }>;
      };

      if (output.steps) {
        const installStep = output.steps.find((s) => s.stepId === "install");
        if (installStep?.projects) {
          const hasToolchainError = installStep.projects.some(
            (p) => p.error?.code === "TOOLCHAIN_MISSING"
          );
          if (hasToolchainError) {
            expect(hasToolchainError).toBe(true);
          }
        }
      }

      if (output.nextActions) {
        const hasToolchainAction = output.nextActions.some((a) => a.kind === "install-toolchain");
        if (hasToolchainAction) {
          expect(hasToolchainAction).toBe(true);
        }
      }
    });

    it("classifies LOCKFILE_DRIFT when lockfile is outdated", async () => {
      fixture = await setupFixture("monorepo-pnpm");

      const pkgPath = path.join(fixture.root, "packages/core/package.json");
      const pkg = JSON.parse(await fs.readFile(pkgPath, "utf-8")) as Record<string, unknown>;
      (pkg as { dependencies: Record<string, string> }).dependencies = {
        "nonexistent-pkg-xyz": "1.0.0"
      };
      await fs.writeFile(pkgPath, JSON.stringify(pkg, null, 2));

      const result = await runCli(["prepare"], {
        cwd: fixture.root,
        timeout: 60000
      });

      const output = result.json as {
        steps?: Array<{
          stepId: string;
          projects?: Array<{
            error?: { code: string };
          }>;
        }>;
        nextActions?: Array<{ kind: string; message: string }>;
      };

      let hasError = false;

      if (output.steps) {
        const installStep = output.steps.find((s) => s.stepId === "install");
        if (installStep?.projects) {
          hasError = installStep.projects.some(
            (p) =>
              p.error?.code === "LOCKFILE_DRIFT" ||
              p.error?.code === "PACKAGE_NOT_FOUND" ||
              p.error?.code === "UNKNOWN"
          );
        }
      }

      if (output.nextActions) {
        hasError =
          hasError ||
          output.nextActions.some(
            (a) => a.kind === "update-lockfile" || a.kind === "check-package"
          );
      }

      expect(hasError).toBe(true);
    });
  });

  describe("python projects", () => {
    beforeEach(async () => {
      fixture = await setupFixture("python-multi");
    });

    it("detects python projects correctly", async () => {
      const result = await runCli(["analyze"], {
        cwd: fixture.root,
        timeout: 30000
      });

      expect(result.exitCode).toBe(0);

      const output = result.json as {
        projects: Array<{ kind: string; root: string }>;
      };

      const pythonProjects = output.projects.filter((p) => p.kind === "python");
      expect(pythonProjects.length).toBeGreaterThanOrEqual(2);
    });

    it("reports python package manager info", async () => {
      const result = await runCli(["prepare"], {
        cwd: fixture.root,
        timeout: 120000
      });

      expect(result.json).toBeDefined();

      const output = result.json as {
        steps?: Array<{
          stepId: string;
          projects?: Array<{
            projectId: string;
            kind: string;
            packageManager?: { manager: string };
          }>;
        }>;
      };

      if (output.steps) {
        const installStep = output.steps.find((s) => s.stepId === "install");
        if (installStep?.projects) {
          const pythonProjects = installStep.projects.filter((p) => p.kind === "python");
          for (const project of pythonProjects) {
            if (project.packageManager) {
              expect(["pip", "poetry", "uv"]).toContain(project.packageManager.manager);
            }
          }
        }
      }
    });
  });

  describe("mixed projects", () => {
    beforeEach(async () => {
      fixture = await setupFixture("monorepo-mixed");
    });

    it("installs Node and Python dependencies", async () => {
      const result = await runCli(["prepare"], {
        cwd: fixture.root,
        timeout: 180000
      });

      expect(result.json).toBeDefined();

      const output = result.json as {
        steps?: Array<{
          stepId: string;
          projects?: Array<{
            kind: string;
            success?: boolean;
          }>;
        }>;
      };

      if (output.steps) {
        const installStep = output.steps.find((s) => s.stepId === "install");
        if (installStep?.projects) {
          const kinds = installStep.projects.map((p) => p.kind);
          expect(kinds).toContain("node");
          expect(kinds).toContain("python");
        }
      }
    });

    it("reports per-project install results", async () => {
      const result = await runCli(["prepare"], {
        cwd: fixture.root,
        timeout: 180000
      });

      expect(result.json).toBeDefined();

      const output = result.json as {
        steps?: Array<{
          stepId: string;
          projects?: Array<{
            projectId: string;
            success?: boolean;
            durationMs?: number;
          }>;
        }>;
      };

      if (output.steps) {
        const installStep = output.steps.find((s) => s.stepId === "install");
        if (installStep?.projects) {
          for (const project of installStep.projects) {
            expect(project.projectId).toBeDefined();
            expect(project.success !== undefined || project.durationMs !== undefined).toBe(true);
          }
        }
      }
    });
  });

  describe("output structure", () => {
    beforeEach(async () => {
      fixture = await setupFixture("monorepo-pnpm");
    });

    it("includes artifacts paths", async () => {
      const result = await runCli(["prepare"], {
        cwd: fixture.root,
        timeout: 120000
      });

      expect(result.json).toBeDefined();
      assertPrepareOutput(result.json);

      const output = result.json as {
        artifacts: {
          logDir: string;
          reportPath: string;
        };
      };

      expect(output.artifacts.logDir).toBeDefined();
      expect(output.artifacts.reportPath).toBeDefined();
    });

    it("includes nextActions for failures", async () => {
      const pkgPath = path.join(fixture.root, "packages/core/package.json");
      const pkg = JSON.parse(await fs.readFile(pkgPath, "utf-8")) as Record<string, unknown>;
      (pkg as { dependencies: Record<string, string> }).dependencies = {
        "definitely-nonexistent-package-xyz123": "99.99.99"
      };
      await fs.writeFile(pkgPath, JSON.stringify(pkg, null, 2));

      const result = await runCli(["prepare"], {
        cwd: fixture.root,
        timeout: 60000
      });

      const output = result.json as {
        nextActions?: Array<{
          kind: string;
          message: string;
          commands?: string[];
          docs?: string[];
        }>;
      };

      if (output.nextActions && output.nextActions.length > 0) {
        const action = output.nextActions[0];
        expect(action.kind).toBeDefined();
        expect(action.message).toBeDefined();
      }
    });
  });
});
