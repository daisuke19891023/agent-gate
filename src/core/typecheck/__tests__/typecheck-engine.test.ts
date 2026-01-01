import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createTypecheckEngine, countDiagnosticsBySeverity } from "../typecheck-engine.js";
import type { ProjectRef } from "../../projects/types.js";
import type { ProjectTypecheckResult, TypecheckDiagnostic } from "../types.js";

// Mock the node and python modules
vi.mock("../node/index.js", () => ({
  typecheckNodeProject: vi.fn()
}));

vi.mock("../python/index.js", () => ({
  typecheckPythonProject: vi.fn()
}));

import { typecheckNodeProject } from "../node/index.js";
import { typecheckPythonProject } from "../python/index.js";

const mockTypecheckNodeProject = vi.mocked(typecheckNodeProject);
const mockTypecheckPythonProject = vi.mocked(typecheckPythonProject);

describe("createTypecheckEngine", () => {
  const repoRoot = "/repo";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("typecheckProject", () => {
    it("should call typecheckNodeProject for node projects", async () => {
      const project: ProjectRef = {
        id: "node:@repo/core",
        kind: "node",
        name: "@repo/core",
        root: "packages/core"
      };

      const mockResult: ProjectTypecheckResult = {
        projectId: "node:@repo/core",
        kind: "node",
        root: "packages/core",
        success: true,
        durationMs: 100,
        usedFallback: false,
        diagnostics: []
      };

      mockTypecheckNodeProject.mockResolvedValue(mockResult);

      const engine = createTypecheckEngine({ repoRoot });
      const result = await engine.typecheckProject(project);

      expect(mockTypecheckNodeProject).toHaveBeenCalledWith(
        project,
        expect.objectContaining({ repoRoot })
      );
      expect(result).toEqual(mockResult);
    });

    it("should call typecheckPythonProject for python projects", async () => {
      const project: ProjectRef = {
        id: "python:backend",
        kind: "python",
        name: "backend",
        root: "python/backend"
      };

      const mockResult: ProjectTypecheckResult = {
        projectId: "python:backend",
        kind: "python",
        root: "python/backend",
        success: true,
        durationMs: 200,
        usedFallback: false,
        diagnostics: []
      };

      mockTypecheckPythonProject.mockResolvedValue(mockResult);

      const engine = createTypecheckEngine({ repoRoot });
      const result = await engine.typecheckProject(project);

      expect(mockTypecheckPythonProject).toHaveBeenCalledWith(
        project,
        expect.objectContaining({ repoRoot })
      );
      expect(result).toEqual(mockResult);
    });
  });

  describe("typecheckAll", () => {
    it("should typecheck all projects and aggregate results", async () => {
      const projects: ProjectRef[] = [
        { id: "node:@repo/core", kind: "node", name: "@repo/core", root: "packages/core" },
        { id: "python:backend", kind: "python", name: "backend", root: "python/backend" }
      ];

      const nodeResult: ProjectTypecheckResult = {
        projectId: "node:@repo/core",
        kind: "node",
        root: "packages/core",
        success: true,
        durationMs: 100,
        usedFallback: false,
        diagnostics: [
          { source: "tsc", severity: "warning", message: "Warning 1", file: "packages/core/a.ts" }
        ]
      };

      const pythonResult: ProjectTypecheckResult = {
        projectId: "python:backend",
        kind: "python",
        root: "python/backend",
        success: true,
        durationMs: 200,
        usedFallback: false,
        diagnostics: [
          { source: "pyright", severity: "error", message: "Error 1", file: "python/backend/b.py" }
        ]
      };

      mockTypecheckNodeProject.mockResolvedValue(nodeResult);
      mockTypecheckPythonProject.mockResolvedValue(pythonResult);

      const engine = createTypecheckEngine({ repoRoot });
      const result = await engine.typecheckAll(projects);

      expect(result.allSucceeded).toBe(true);
      expect(result.projects).toHaveLength(2);
      expect(result.diagnostics).toHaveLength(2);
      expect(result.warnings).toHaveLength(0);
    });

    it("should return allSucceeded=false when any project fails", async () => {
      const projects: ProjectRef[] = [
        { id: "node:@repo/core", kind: "node", name: "@repo/core", root: "packages/core" }
      ];

      const failedResult: ProjectTypecheckResult = {
        projectId: "node:@repo/core",
        kind: "node",
        root: "packages/core",
        success: false,
        durationMs: 100,
        usedFallback: false,
        diagnostics: [
          { source: "tsc", severity: "error", message: "Error", file: "packages/core/a.ts" }
        ],
        error: { code: "TYPECHECK_FAILED", message: "Type errors found" }
      };

      mockTypecheckNodeProject.mockResolvedValue(failedResult);

      const engine = createTypecheckEngine({ repoRoot });
      const result = await engine.typecheckAll(projects);

      expect(result.allSucceeded).toBe(false);
    });

    it("should add warning when fallback is used", async () => {
      const projects: ProjectRef[] = [
        { id: "node:@repo/core", kind: "node", name: "@repo/core", root: "packages/core" }
      ];

      const fallbackResult: ProjectTypecheckResult = {
        projectId: "node:@repo/core",
        kind: "node",
        root: "packages/core",
        success: true,
        durationMs: 100,
        usedFallback: true,
        diagnostics: []
      };

      mockTypecheckNodeProject.mockResolvedValue(fallbackResult);

      const engine = createTypecheckEngine({ repoRoot });
      const result = await engine.typecheckAll(projects);

      expect(result.warnings).toContain("FALLBACK_TYPECHECK_USED: node:@repo/core");
    });

    it("should add warning for PYRIGHT_NOT_FOUND but not fail", async () => {
      const projects: ProjectRef[] = [
        { id: "python:backend", kind: "python", name: "backend", root: "python/backend" }
      ];

      const pyrightNotFoundResult: ProjectTypecheckResult = {
        projectId: "python:backend",
        kind: "python",
        root: "python/backend",
        success: false,
        durationMs: 10,
        usedFallback: false,
        diagnostics: [],
        error: { code: "PYRIGHT_NOT_FOUND", message: "Pyright not installed" }
      };

      mockTypecheckPythonProject.mockResolvedValue(pyrightNotFoundResult);

      const engine = createTypecheckEngine({ repoRoot });
      const result = await engine.typecheckAll(projects);

      // PYRIGHT_NOT_FOUND is treated as skip, not failure
      expect(result.allSucceeded).toBe(true);
      expect(result.warnings).toContain(
        "PYRIGHT_NOT_FOUND: python:backend - Python typecheck skipped"
      );
    });

    it("should sort diagnostics by file then line", async () => {
      const projects: ProjectRef[] = [
        { id: "node:@repo/core", kind: "node", name: "@repo/core", root: "packages/core" }
      ];

      const diagnostics: TypecheckDiagnostic[] = [
        {
          source: "tsc",
          severity: "error",
          message: "Error 3",
          file: "z.ts",
          range: { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } }
        },
        {
          source: "tsc",
          severity: "error",
          message: "Error 2",
          file: "a.ts",
          range: { start: { line: 20, column: 1 }, end: { line: 20, column: 1 } }
        },
        {
          source: "tsc",
          severity: "error",
          message: "Error 1",
          file: "a.ts",
          range: { start: { line: 10, column: 1 }, end: { line: 10, column: 1 } }
        }
      ];

      mockTypecheckNodeProject.mockResolvedValue({
        projectId: "node:@repo/core",
        kind: "node",
        root: "packages/core",
        success: false,
        durationMs: 100,
        usedFallback: false,
        diagnostics,
        error: { code: "TYPECHECK_FAILED", message: "Errors" }
      });

      const engine = createTypecheckEngine({ repoRoot });
      const result = await engine.typecheckAll(projects);

      // Should be sorted: a.ts:10, a.ts:20, z.ts:1
      expect(result.diagnostics[0]?.file).toBe("a.ts");
      expect(result.diagnostics[0]?.range?.start.line).toBe(10);
      expect(result.diagnostics[1]?.range?.start.line).toBe(20);
      expect(result.diagnostics[2]?.file).toBe("z.ts");
    });

    it("should handle empty projects array", async () => {
      const engine = createTypecheckEngine({ repoRoot });
      const result = await engine.typecheckAll([]);

      expect(result.allSucceeded).toBe(true);
      expect(result.projects).toHaveLength(0);
      expect(result.diagnostics).toHaveLength(0);
    });
  });
});

describe("countDiagnosticsBySeverity", () => {
  it("should count diagnostics by severity", () => {
    const diagnostics: TypecheckDiagnostic[] = [
      { source: "tsc", severity: "error", message: "Error 1" },
      { source: "tsc", severity: "error", message: "Error 2" },
      { source: "tsc", severity: "warning", message: "Warning 1" },
      { source: "tsc", severity: "info", message: "Info 1" },
      { source: "tsc", severity: "hint", message: "Hint 1" }
    ];

    const counts = countDiagnosticsBySeverity(diagnostics);

    expect(counts).toEqual({
      errors: 2,
      warnings: 1,
      info: 1,
      hints: 1
    });
  });

  it("should return zeros for empty array", () => {
    const counts = countDiagnosticsBySeverity([]);

    expect(counts).toEqual({
      errors: 0,
      warnings: 0,
      info: 0,
      hints: 0
    });
  });
});
