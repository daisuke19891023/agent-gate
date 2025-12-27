import { describe, it, expect } from "vitest";
import { mapFilesToProjects, findProjectForFile, getAffectedProjects } from "../file-mapper.js";
import type { ProjectRef } from "../types.js";

describe("file-mapper", () => {
  const nodeProjects: ProjectRef[] = [
    { id: "node:root", kind: "node", name: "root", root: ".", packageManager: "pnpm" },
    {
      id: "node:pkg-a",
      kind: "node",
      name: "pkg-a",
      root: "packages/a",
      packageManager: "pnpm"
    },
    {
      id: "node:pkg-b",
      kind: "node",
      name: "pkg-b",
      root: "packages/b",
      packageManager: "pnpm"
    }
  ];

  const pythonProjects: ProjectRef[] = [
    {
      id: "python:py-root",
      kind: "python",
      name: "py-root",
      root: "python",
      packageManager: "uv"
    },
    {
      id: "python:py-lib",
      kind: "python",
      name: "py-lib",
      root: "python/libs/utils",
      packageManager: "uv"
    }
  ];

  const mixedProjects = [...nodeProjects, ...pythonProjects];

  describe("findProjectForFile", () => {
    it("should find node project for TypeScript file", () => {
      const result = findProjectForFile("packages/a/src/index.ts", nodeProjects);
      expect(result?.name).toBe("pkg-a");
    });

    it("should find python project for Python file", () => {
      const result = findProjectForFile("python/libs/utils/main.py", pythonProjects);
      expect(result?.name).toBe("py-lib");
    });

    it("should prefer more specific match in mixed projects", () => {
      // Python project at 'python/libs/utils' should match over node root
      const result = findProjectForFile("python/libs/utils/test.py", mixedProjects);
      expect(result?.name).toBe("py-lib");
      expect(result?.kind).toBe("python");
    });

    it("should return undefined when no projects exist", () => {
      const result = findProjectForFile("src/index.ts", []);
      expect(result).toBeUndefined();
    });

    it("should handle backslash paths", () => {
      const result = findProjectForFile("packages\\a\\src\\index.ts", nodeProjects);
      expect(result?.name).toBe("pkg-a");
    });
  });

  describe("mapFilesToProjects", () => {
    it("should map files to their containing projects", () => {
      const changedFiles = [
        { path: "packages/a/src/index.ts" },
        { path: "packages/b/src/util.ts" }
      ];

      const result = mapFilesToProjects(changedFiles, nodeProjects);

      expect(result.selectedProjects.length).toBe(2);
      const names = result.selectedProjects.map((p) => p.name);
      expect(names).toContain("pkg-a");
      expect(names).toContain("pkg-b");
      expect(result.unmappedFiles).toEqual([]);
      expect(result.warnings).toEqual([]);
    });

    it("should deduplicate projects when multiple files in same project", () => {
      const changedFiles = [
        { path: "packages/a/src/index.ts" },
        { path: "packages/a/src/util.ts" },
        { path: "packages/a/package.json" }
      ];

      const result = mapFilesToProjects(changedFiles, nodeProjects);

      expect(result.selectedProjects.length).toBe(1);
      expect(result.selectedProjects[0]?.name).toBe("pkg-a");
    });

    it("should track unmapped files and generate warnings", () => {
      // Create projects without root fallback
      const limitedProjects: ProjectRef[] = [
        {
          id: "node:pkg-a",
          kind: "node",
          name: "pkg-a",
          root: "packages/a",
          packageManager: "pnpm"
        }
      ];

      const changedFiles = [{ path: "packages/a/src/index.ts" }, { path: "some/other/file.ts" }];

      const result = mapFilesToProjects(changedFiles, limitedProjects);

      expect(result.selectedProjects.length).toBe(1);
      expect(result.unmappedFiles).toEqual(["some/other/file.ts"]);
      expect(result.warnings.length).toBe(1);
      expect(result.warnings[0]?.code).toBe("UNASSIGNED_FILE");
    });

    it("should handle empty file list", () => {
      const result = mapFilesToProjects([], nodeProjects);

      expect(result.selectedProjects).toEqual([]);
      expect(result.unmappedFiles).toEqual([]);
      expect(result.warnings).toEqual([]);
    });

    it("should handle mixed Node and Python projects", () => {
      const changedFiles = [
        { path: "packages/a/src/index.ts" },
        { path: "python/libs/utils/main.py" }
      ];

      const result = mapFilesToProjects(changedFiles, mixedProjects);

      expect(result.selectedProjects.length).toBe(2);
      const kinds = result.selectedProjects.map((p) => p.kind);
      expect(kinds).toContain("node");
      expect(kinds).toContain("python");
    });

    it("should maintain project order from input", () => {
      const changedFiles = [{ path: "packages/b/index.ts" }, { path: "packages/a/index.ts" }];

      const result = mapFilesToProjects(changedFiles, nodeProjects);

      // Projects should be in the order they appear in the original list
      const names = result.selectedProjects.map((p) => p.name);
      expect(names).toEqual(["pkg-a", "pkg-b"]);
    });
  });

  describe("getAffectedProjects", () => {
    it("should return projects containing changed files", () => {
      const changedFiles = [{ path: "packages/a/src/index.ts" }];

      const result = getAffectedProjects(changedFiles, nodeProjects);

      expect(result.length).toBe(1);
      expect(result[0]?.name).toBe("pkg-a");
    });

    it("should return empty array when no files provided", () => {
      const result = getAffectedProjects([], nodeProjects);
      expect(result).toEqual([]);
    });
  });
});
