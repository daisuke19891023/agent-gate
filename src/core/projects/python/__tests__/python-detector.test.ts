import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { detectPythonProjects, findPythonProjectForFile } from "../index.js";
import {
  parsePyprojectToml,
  detectPythonPackageManager,
  hasPythonProjectMarker
} from "../pyproject-parser.js";
import type { ProjectRef } from "../../types.js";

describe("python-detector", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), "python-detector-test-"));
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  /**
   * Create a file in the test directory.
   */
  async function createFile(relativePath: string, content: string): Promise<void> {
    const fullPath = path.join(testDir, relativePath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, content);
  }

  /**
   * Create a pyproject.toml file.
   */
  async function createPyprojectToml(relativePath: string, content: string): Promise<void> {
    await createFile(relativePath, content);
  }

  describe("parsePyprojectToml", () => {
    it("should parse project name from [project] section", async () => {
      await createPyprojectToml(
        "pyproject.toml",
        `
[project]
name = "my-project"
version = "1.0.0"
`
      );

      const result = await parsePyprojectToml(path.join(testDir, "pyproject.toml"));
      expect(result?.name).toBe("my-project");
      expect(result?.version).toBe("1.0.0");
    });

    it("should parse project name from [tool.poetry] section", async () => {
      await createPyprojectToml(
        "pyproject.toml",
        `
[tool.poetry]
name = "poetry-project"
version = "2.0.0"
`
      );

      const result = await parsePyprojectToml(path.join(testDir, "pyproject.toml"));
      expect(result?.name).toBe("poetry-project");
      expect(result?.hasPoetry).toBe(true);
      expect(result?.packageManager).toBe("poetry");
    });

    it("should prefer [project] over [tool.poetry] for name", async () => {
      await createPyprojectToml(
        "pyproject.toml",
        `
[project]
name = "pep-name"

[tool.poetry]
name = "poetry-name"
`
      );

      const result = await parsePyprojectToml(path.join(testDir, "pyproject.toml"));
      expect(result?.name).toBe("pep-name");
    });

    it("should detect uv package manager", async () => {
      await createPyprojectToml(
        "pyproject.toml",
        `
[project]
name = "uv-project"

[tool.uv]
dev-dependencies = []
`
      );

      const result = await parsePyprojectToml(path.join(testDir, "pyproject.toml"));
      expect(result?.hasUv).toBe(true);
      expect(result?.packageManager).toBe("uv");
    });

    it("should return null for non-existent file", async () => {
      const result = await parsePyprojectToml(path.join(testDir, "nonexistent.toml"));
      expect(result).toBeNull();
    });

    it("should return null for invalid TOML", async () => {
      await createPyprojectToml("pyproject.toml", "this is not valid toml {{{{");

      const result = await parsePyprojectToml(path.join(testDir, "pyproject.toml"));
      expect(result).toBeNull();
    });
  });

  describe("detectPythonPackageManager", () => {
    it("should detect uv from lockfile", async () => {
      await createFile("uv.lock", "");

      const result = await detectPythonPackageManager(testDir);
      expect(result).toBe("uv");
    });

    it("should detect poetry from lockfile", async () => {
      await createFile("poetry.lock", "");

      const result = await detectPythonPackageManager(testDir);
      expect(result).toBe("poetry");
    });

    it("should detect pip from requirements.txt", async () => {
      await createFile("requirements.txt", "flask==2.0.0");

      const result = await detectPythonPackageManager(testDir);
      expect(result).toBe("pip");
    });

    it("should return unknown when no lockfile exists", async () => {
      const result = await detectPythonPackageManager(testDir);
      expect(result).toBe("unknown");
    });

    it("should prefer uv over poetry", async () => {
      await createFile("uv.lock", "");
      await createFile("poetry.lock", "");

      const result = await detectPythonPackageManager(testDir);
      expect(result).toBe("uv");
    });
  });

  describe("hasPythonProjectMarker", () => {
    it("should return true when pyproject.toml exists", async () => {
      await createPyprojectToml("pyproject.toml", '[project]\nname = "test"');

      const result = await hasPythonProjectMarker(testDir);
      expect(result).toBe(true);
    });

    it("should return true when setup.py exists", async () => {
      await createFile("setup.py", "from setuptools import setup\nsetup()");

      const result = await hasPythonProjectMarker(testDir);
      expect(result).toBe(true);
    });

    it("should return true when setup.cfg exists", async () => {
      await createFile("setup.cfg", "[metadata]\nname = test");

      const result = await hasPythonProjectMarker(testDir);
      expect(result).toBe(true);
    });

    it("should return false when no marker exists", async () => {
      const result = await hasPythonProjectMarker(testDir);
      expect(result).toBe(false);
    });
  });

  describe("detectPythonProjects", () => {
    it("should return empty result when no pyproject.toml exists", async () => {
      const { result, warnings } = await detectPythonProjects(testDir);

      expect(result.projects).toEqual([]);
      expect(result.isMultiProject).toBe(false);
      expect(result.packageManager).toBe("unknown");
      expect(warnings).toEqual([]);
    });

    it("should detect single Python project", async () => {
      await createPyprojectToml(
        "pyproject.toml",
        `
[project]
name = "my-app"
version = "1.0.0"
`
      );

      const { result, warnings } = await detectPythonProjects(testDir);

      expect(result.projects.length).toBe(1);
      expect(result.projects[0]?.name).toBe("my-app");
      expect(result.projects[0]?.root).toBe(".");
      expect(result.projects[0]?.id).toBe("python:my-app");
      expect(result.isMultiProject).toBe(false);
      expect(warnings).toEqual([]);
    });

    it("should detect multiple Python projects", async () => {
      await createPyprojectToml(
        "pyproject.toml",
        `
[project]
name = "root-project"
`
      );
      await createPyprojectToml(
        "libs/utils/pyproject.toml",
        `
[project]
name = "my-utils"
`
      );
      await createPyprojectToml(
        "apps/api/pyproject.toml",
        `
[project]
name = "my-api"
`
      );

      const { result, warnings } = await detectPythonProjects(testDir);

      expect(result.isMultiProject).toBe(true);
      expect(result.projects.length).toBe(3);

      const names = result.projects.map((p) => p.name);
      expect(names).toContain("root-project");
      expect(names).toContain("my-utils");
      expect(names).toContain("my-api");

      expect(warnings).toEqual([]);
    });

    it("should detect package manager from root pyproject.toml", async () => {
      await createPyprojectToml(
        "pyproject.toml",
        `
[project]
name = "uv-monorepo"

[tool.uv]
dev-dependencies = []
`
      );
      await createFile("uv.lock", "");

      const { result } = await detectPythonProjects(testDir);

      expect(result.packageManager).toBe("uv");
    });

    it("should warn when project has no name", async () => {
      await createPyprojectToml(
        "pyproject.toml",
        `
[project]
version = "1.0.0"
`
      );

      const { warnings } = await detectPythonProjects(testDir);

      expect(warnings.length).toBe(1);
      expect(warnings[0]?.code).toBe("MISSING_NAME");
    });

    it("should generate ID from path when no name", async () => {
      await createPyprojectToml(
        "libs/unnamed/pyproject.toml",
        `
[project]
version = "1.0.0"
`
      );

      const { result } = await detectPythonProjects(testDir);

      const unnamedPkg = result.projects.find((p) => p.root === "libs/unnamed");
      expect(unnamedPkg?.id).toBe("python:libs/unnamed");
    });

    it("should sort projects by root path", async () => {
      await createPyprojectToml("pyproject.toml", '[project]\nname = "root"');
      await createPyprojectToml("z-lib/pyproject.toml", '[project]\nname = "z-lib"');
      await createPyprojectToml("a-lib/pyproject.toml", '[project]\nname = "a-lib"');

      const { result } = await detectPythonProjects(testDir);

      const roots = result.projects.map((p) => p.root);
      expect(roots).toEqual([".", "a-lib", "z-lib"]);
    });

    it("should exclude node_modules and venv directories", async () => {
      await createPyprojectToml("pyproject.toml", '[project]\nname = "root"');
      await createPyprojectToml(
        "node_modules/some-pkg/pyproject.toml",
        '[project]\nname = "should-ignore"'
      );
      await createPyprojectToml(".venv/pyproject.toml", '[project]\nname = "also-ignore"');

      const { result } = await detectPythonProjects(testDir);

      expect(result.projects.length).toBe(1);
      expect(result.projects[0]?.name).toBe("root");
    });
  });

  describe("findPythonProjectForFile", () => {
    const projects: ProjectRef[] = [
      { id: "python:root", kind: "python", name: "root", root: ".", packageManager: "uv" },
      {
        id: "python:utils",
        kind: "python",
        name: "utils",
        root: "libs/utils",
        packageManager: "uv"
      },
      {
        id: "python:api",
        kind: "python",
        name: "api",
        root: "apps/api",
        packageManager: "uv"
      }
    ];

    it("should find project for file in subproject", () => {
      const result = findPythonProjectForFile("libs/utils/src/main.py", projects);
      expect(result?.name).toBe("utils");
    });

    it("should find deepest matching project", () => {
      const nestedProjects: ProjectRef[] = [
        ...projects,
        {
          id: "python:nested",
          kind: "python",
          name: "nested",
          root: "libs/utils/nested",
          packageManager: "uv"
        }
      ];

      const result = findPythonProjectForFile("libs/utils/nested/mod.py", nestedProjects);
      expect(result?.name).toBe("nested");
    });

    it("should fall back to root for unmatched paths", () => {
      const result = findPythonProjectForFile("scripts/build.py", projects);
      expect(result?.name).toBe("root");
    });

    it("should handle file at project root", () => {
      const result = findPythonProjectForFile("apps/api/pyproject.toml", projects);
      expect(result?.name).toBe("api");
    });

    it("should handle backslash paths", () => {
      const result = findPythonProjectForFile("libs\\utils\\src\\main.py", projects);
      expect(result?.name).toBe("utils");
    });

    it("should return undefined when no projects match", () => {
      const emptyProjects: ProjectRef[] = [];
      const result = findPythonProjectForFile("src/main.py", emptyProjects);
      expect(result).toBeUndefined();
    });

    it("should ignore non-python projects", () => {
      const mixedProjects: ProjectRef[] = [
        {
          id: "node:pkg",
          kind: "node",
          name: "pkg",
          root: "libs/utils",
          packageManager: "pnpm"
        },
        ...projects
      ];

      const result = findPythonProjectForFile("libs/utils/src/main.py", mixedProjects);
      expect(result?.name).toBe("utils");
      expect(result?.kind).toBe("python");
    });
  });
});
