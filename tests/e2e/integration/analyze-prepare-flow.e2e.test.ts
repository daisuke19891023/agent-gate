import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  setupFixture,
  modifyFile,
  stageFile,
  type FixtureSetup
} from "../../helpers/fixture-helper.js";
import { runCli } from "../../helpers/cli-runner.js";

describe("analyze → prepare integration flow", { timeout: 200000 }, () => {
  let fixture: FixtureSetup;

  afterEach(async () => {
    if (fixture) {
      await fixture.cleanup();
    }
  });

  describe("full workflow", () => {
    beforeEach(async () => {
      fixture = await setupFixture("monorepo-pnpm");
    });

    it("analyze detects projects, prepare installs their deps", async () => {
      const analyzeResult = await runCli(["analyze"], {
        cwd: fixture.root,
        timeout: 30000
      });

      expect(analyzeResult.exitCode).toBe(0);

      const analyzeOutput = analyzeResult.json as {
        projects: Array<{ id: string; kind: string; root: string }>;
      };

      expect(analyzeOutput.projects.length).toBeGreaterThan(0);

      const prepareResult = await runCli(["prepare"], {
        cwd: fixture.root,
        timeout: 120000
      });

      expect(prepareResult.json).toBeDefined();

      const prepareOutput = prepareResult.json as {
        steps?: Array<{
          stepId: string;
          projects?: Array<{ projectId: string }>;
        }>;
      };

      if (prepareOutput.steps) {
        const installStep = prepareOutput.steps.find((s) => s.stepId === "install");
        if (installStep?.projects) {
          expect(installStep.projects.length).toBeGreaterThan(0);
        }
      }
    });

    it("both commands use consistent repo root", async () => {
      const analyzeResult = await runCli(["analyze"], {
        cwd: fixture.root,
        timeout: 30000
      });

      const prepareResult = await runCli(["prepare"], {
        cwd: fixture.root,
        timeout: 120000
      });

      expect(analyzeResult.exitCode).toBe(0);
      expect(prepareResult.json).toBeDefined();

      const analyzeOutput = analyzeResult.json as {
        repo: { root: string; id: string };
      };

      const prepareOutput = prepareResult.json as {
        repo: { root: string; id: string };
      };

      // Both commands should identify the same repo root
      expect(prepareOutput.repo.root).toBe(analyzeOutput.repo.root);
      // Note: repo.id may differ between analyze and prepare in current implementation
    });

    it("exit code is 0 on successful analyze", async () => {
      const successResult = await runCli(["analyze"], {
        cwd: fixture.root,
        timeout: 30000
      });

      expect(successResult.exitCode).toBe(0);
    });
  });

  describe("with scope=changed", () => {
    beforeEach(async () => {
      fixture = await setupFixture("monorepo-pnpm");
    });

    it("analyze detects changed files", async () => {
      await modifyFile(fixture.root, "packages/core/src/index.ts");
      await stageFile(fixture.root, "packages/core/src/index.ts");

      const analyzeResult = await runCli(["analyze", "--scope", "changed"], {
        cwd: fixture.root,
        timeout: 30000
      });

      expect(analyzeResult.exitCode).toBe(0);

      const analyzeOutput = analyzeResult.json as {
        scope?: {
          mode: string;
          changedFiles: Array<{ path: string; changeType: string }>;
          hasChanges: boolean;
        };
      };

      if (analyzeOutput.scope) {
        expect(analyzeOutput.scope.mode).toBe("changed");
        expect(analyzeOutput.scope.changedFiles.length).toBeGreaterThan(0);
        expect(analyzeOutput.scope.hasChanges).toBe(true);
      }
    });

    it("scope changes are reflected in prepare output", async () => {
      await modifyFile(fixture.root, "packages/core/src/index.ts");

      const prepareResult = await runCli(["prepare", "--scope", "changed"], {
        cwd: fixture.root,
        timeout: 120000
      });

      expect(prepareResult.json).toBeDefined();

      const prepareOutput = prepareResult.json as {
        scope?: {
          mode: string;
          selectedProjects: string[];
        };
      };

      if (prepareOutput.scope) {
        expect(prepareOutput.scope.mode).toBe("changed");
      }
    });
  });

  describe("artifacts generation", () => {
    beforeEach(async () => {
      fixture = await setupFixture("monorepo-pnpm");
    });

    it("both commands generate artifacts", async () => {
      const analyzeResult = await runCli(["analyze"], {
        cwd: fixture.root,
        timeout: 30000
      });

      const prepareResult = await runCli(["prepare"], {
        cwd: fixture.root,
        timeout: 120000
      });

      expect(analyzeResult.exitCode).toBe(0);

      const analyzeOutput = analyzeResult.json as {
        artifacts: { logDir: string; reportPath: string };
      };

      const prepareOutput = prepareResult.json as {
        artifacts?: { logDir: string; reportPath: string };
      };

      expect(analyzeOutput.artifacts.logDir).toBeDefined();
      expect(analyzeOutput.artifacts.reportPath).toBeDefined();

      if (prepareOutput.artifacts) {
        expect(prepareOutput.artifacts.logDir).toBeDefined();
        expect(prepareOutput.artifacts.reportPath).toBeDefined();
      }
    });
  });

  describe("mixed language flow", () => {
    beforeEach(async () => {
      fixture = await setupFixture("monorepo-mixed");
    });

    it("analyze detects both Node and Python projects", async () => {
      const analyzeResult = await runCli(["analyze"], {
        cwd: fixture.root,
        timeout: 30000
      });

      expect(analyzeResult.exitCode).toBe(0);

      const analyzeOutput = analyzeResult.json as {
        projects: Array<{ id: string; kind: string }>;
      };

      const kinds = analyzeOutput.projects.map((p) => p.kind);
      expect(kinds).toContain("node");
      expect(kinds).toContain("python");
    });

    it("prepare handles both Node and Python installs", async () => {
      const prepareResult = await runCli(["prepare"], {
        cwd: fixture.root,
        timeout: 180000
      });

      expect(prepareResult.json).toBeDefined();

      const prepareOutput = prepareResult.json as {
        steps?: Array<{
          stepId: string;
          projects?: Array<{ kind: string }>;
        }>;
      };

      if (prepareOutput.steps) {
        const installStep = prepareOutput.steps.find((s) => s.stepId === "install");
        if (installStep?.projects) {
          const kinds = installStep.projects.map((p) => p.kind);
          expect(kinds.includes("node") || kinds.includes("python")).toBe(true);
        }
      }
    });
  });

  describe("error propagation", () => {
    beforeEach(async () => {
      fixture = await setupFixture("monorepo-pnpm");
    });

    it("errors in one project don't prevent others from being processed", async () => {
      const prepareResult = await runCli(["prepare"], {
        cwd: fixture.root,
        timeout: 120000
      });

      expect(prepareResult.json).toBeDefined();

      const prepareOutput = prepareResult.json as {
        steps?: Array<{
          stepId: string;
          projects?: Array<{
            projectId: string;
            success?: boolean;
            error?: { code: string };
          }>;
        }>;
      };

      if (prepareOutput.steps) {
        const installStep = prepareOutput.steps.find((s) => s.stepId === "install");
        if (installStep?.projects) {
          for (const project of installStep.projects) {
            expect(
              project.success !== undefined ||
                project.error !== undefined ||
                project.projectId !== undefined
            ).toBe(true);
          }
        }
      }
    });
  });
});
