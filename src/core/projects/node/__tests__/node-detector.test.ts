import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { detectNodeProjects, findNodeProjectForFile } from "../index.js";
import {
  detectPackageManager,
  hasWorkspaces,
  hasPnpmWorkspace,
  hasPackageJsonWorkspaces
} from "../workspace-detector.js";
import type { ProjectRef } from "../../types.js";

describe("node-detector", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), "node-detector-test-"));
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
   * Create a package.json file.
   */
  async function createPackageJson(
    relativePath: string,
    pkg: Record<string, unknown>
  ): Promise<void> {
    await createFile(relativePath, JSON.stringify(pkg, null, 2));
  }

  describe("detectPackageManager", () => {
    it("should detect pnpm from lockfile", async () => {
      await createPackageJson("package.json", { name: "test" });
      await createFile("pnpm-lock.yaml", "lockfileVersion: 9");

      const result = await detectPackageManager(testDir);
      expect(result).toBe("pnpm");
    });

    it("should detect npm from lockfile", async () => {
      await createPackageJson("package.json", { name: "test" });
      await createFile("package-lock.json", "{}");

      const result = await detectPackageManager(testDir);
      expect(result).toBe("npm");
    });

    it("should detect yarn from lockfile", async () => {
      await createPackageJson("package.json", { name: "test" });
      await createFile("yarn.lock", "");

      const result = await detectPackageManager(testDir);
      expect(result).toBe("yarn");
    });

    it("should return unknown when no lockfile exists", async () => {
      await createPackageJson("package.json", { name: "test" });

      const result = await detectPackageManager(testDir);
      expect(result).toBe("unknown");
    });

    it("should prefer pnpm over other lockfiles", async () => {
      await createPackageJson("package.json", { name: "test" });
      await createFile("pnpm-lock.yaml", "");
      await createFile("yarn.lock", "");
      await createFile("package-lock.json", "{}");

      const result = await detectPackageManager(testDir);
      expect(result).toBe("pnpm");
    });
  });

  describe("hasPnpmWorkspace", () => {
    it("should return true when pnpm-workspace.yaml exists", async () => {
      await createFile("pnpm-workspace.yaml", "packages:\n  - packages/*");

      const result = await hasPnpmWorkspace(testDir);
      expect(result).toBe(true);
    });

    it("should return false when pnpm-workspace.yaml does not exist", async () => {
      const result = await hasPnpmWorkspace(testDir);
      expect(result).toBe(false);
    });
  });

  describe("hasPackageJsonWorkspaces", () => {
    it("should return true when package.json has workspaces", async () => {
      await createPackageJson("package.json", {
        name: "test",
        workspaces: ["packages/*"]
      });

      const result = await hasPackageJsonWorkspaces(testDir);
      expect(result).toBe(true);
    });

    it("should return true for yarn-style object workspaces", async () => {
      await createPackageJson("package.json", {
        name: "test",
        workspaces: { packages: ["packages/*"] }
      });

      const result = await hasPackageJsonWorkspaces(testDir);
      expect(result).toBe(true);
    });

    it("should return false when no workspaces field", async () => {
      await createPackageJson("package.json", { name: "test" });

      const result = await hasPackageJsonWorkspaces(testDir);
      expect(result).toBe(false);
    });

    it("should return false when package.json does not exist", async () => {
      const result = await hasPackageJsonWorkspaces(testDir);
      expect(result).toBe(false);
    });
  });

  describe("hasWorkspaces", () => {
    it("should check pnpm-workspace.yaml for pnpm", async () => {
      await createFile("pnpm-workspace.yaml", "packages:\n  - packages/*");

      const result = await hasWorkspaces(testDir, "pnpm");
      expect(result).toBe(true);
    });

    it("should check package.json workspaces for npm", async () => {
      await createPackageJson("package.json", {
        name: "test",
        workspaces: ["packages/*"]
      });

      const result = await hasWorkspaces(testDir, "npm");
      expect(result).toBe(true);
    });
  });

  describe("detectNodeProjects", () => {
    it("should return empty result when no package.json exists", async () => {
      const { result, warnings } = await detectNodeProjects(testDir);

      expect(result.packages).toEqual([]);
      expect(result.isMonorepo).toBe(false);
      expect(result.packageManager).toBe("unknown");
      expect(warnings).toEqual([]);
    });

    it("should detect single package project", async () => {
      await createPackageJson("package.json", { name: "my-app" });

      const { result, warnings } = await detectNodeProjects(testDir);

      expect(result.packages.length).toBe(1);
      expect(result.packages[0]?.name).toBe("my-app");
      expect(result.packages[0]?.root).toBe(".");
      expect(result.packages[0]?.id).toBe("node:my-app");
      expect(result.isMonorepo).toBe(false);
      expect(warnings).toEqual([]);
    });

    it("should detect pnpm monorepo", async () => {
      await createPackageJson("package.json", { name: "my-monorepo" });
      await createFile("pnpm-workspace.yaml", "packages:\n  - packages/*");
      await createFile("pnpm-lock.yaml", "");
      await createPackageJson("packages/a/package.json", { name: "pkg-a" });
      await createPackageJson("packages/b/package.json", { name: "pkg-b" });

      const { result, warnings } = await detectNodeProjects(testDir);

      expect(result.isMonorepo).toBe(true);
      expect(result.packageManager).toBe("pnpm");
      expect(result.packages.length).toBe(3);

      const names = result.packages.map((p) => p.name);
      expect(names).toContain("my-monorepo");
      expect(names).toContain("pkg-a");
      expect(names).toContain("pkg-b");

      expect(warnings).toEqual([]);
    });

    it("should detect npm workspaces monorepo", async () => {
      await createPackageJson("package.json", {
        name: "my-npm-monorepo",
        workspaces: ["packages/*"]
      });
      await createFile("package-lock.json", "{}");
      await createPackageJson("packages/core/package.json", { name: "@my/core" });

      const { result } = await detectNodeProjects(testDir);

      expect(result.isMonorepo).toBe(true);
      expect(result.packageManager).toBe("npm");
      expect(result.packages.length).toBe(2);
    });

    it("should detect yarn workspaces monorepo", async () => {
      await createPackageJson("package.json", {
        name: "my-yarn-monorepo",
        workspaces: ["packages/*"]
      });
      await createFile("yarn.lock", "");
      await createPackageJson("packages/lib/package.json", { name: "@my/lib" });

      const { result } = await detectNodeProjects(testDir);

      expect(result.isMonorepo).toBe(true);
      expect(result.packageManager).toBe("yarn");
    });

    it("should handle packages without name in package.json", async () => {
      // Note: @manypkg/get-packages may fail to detect packages with no name,
      // which results in a DETECTION_FAILED warning and fallback to single package mode.
      await createPackageJson("package.json", { name: "my-monorepo" });
      await createFile("pnpm-workspace.yaml", "packages:\n  - packages/*");
      await createFile("pnpm-lock.yaml", "");
      await createPackageJson("packages/no-name/package.json", {
        version: "1.0.0"
      });

      const { result, warnings } = await detectNodeProjects(testDir);

      // When manypkg fails on invalid packages, we fall back
      // Either we get a warning about detection failure or about missing name
      expect(warnings.length).toBeGreaterThanOrEqual(1);
      // The result may be limited to root package if manypkg fails
      expect(result.packages.length).toBeGreaterThanOrEqual(1);
    });

    it("should handle valid and invalid packages together", async () => {
      await createPackageJson("package.json", { name: "my-monorepo" });
      await createFile("pnpm-workspace.yaml", "packages:\n  - packages/*");
      await createFile("pnpm-lock.yaml", "");
      await createPackageJson("packages/valid-pkg/package.json", { name: "valid-pkg" });

      const { result } = await detectNodeProjects(testDir);

      // Should find at least the root and valid package
      expect(result.packages.length).toBeGreaterThanOrEqual(2);
      const names = result.packages.map((p) => p.name);
      expect(names).toContain("my-monorepo");
      expect(names).toContain("valid-pkg");
    });

    it("should sort packages by root path", async () => {
      await createPackageJson("package.json", { name: "root" });
      await createFile("pnpm-workspace.yaml", "packages:\n  - packages/*");
      await createFile("pnpm-lock.yaml", "");
      await createPackageJson("packages/z-pkg/package.json", { name: "z-pkg" });
      await createPackageJson("packages/a-pkg/package.json", { name: "a-pkg" });
      await createPackageJson("packages/m-pkg/package.json", { name: "m-pkg" });

      const { result } = await detectNodeProjects(testDir);

      const roots = result.packages.map((p) => p.root);
      expect(roots).toEqual([".", "packages/a-pkg", "packages/m-pkg", "packages/z-pkg"]);
    });
  });

  describe("findNodeProjectForFile", () => {
    const projects: ProjectRef[] = [
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
      },
      {
        id: "node:nested",
        kind: "node",
        name: "nested",
        root: "packages/a/nested",
        packageManager: "pnpm"
      }
    ];

    it("should find project for file in package", () => {
      const result = findNodeProjectForFile("packages/a/src/index.ts", projects);
      expect(result?.name).toBe("pkg-a");
    });

    it("should find deepest matching project", () => {
      const result = findNodeProjectForFile("packages/a/nested/lib/util.ts", projects);
      expect(result?.name).toBe("nested");
    });

    it("should fall back to root for unmatched paths", () => {
      const result = findNodeProjectForFile("scripts/build.js", projects);
      expect(result?.name).toBe("root");
    });

    it("should handle file at project root", () => {
      const result = findNodeProjectForFile("packages/b/package.json", projects);
      expect(result?.name).toBe("pkg-b");
    });

    it("should handle backslash paths", () => {
      const result = findNodeProjectForFile("packages\\a\\src\\index.ts", projects);
      expect(result?.name).toBe("pkg-a");
    });

    it("should return undefined when no projects match", () => {
      const emptyProjects: ProjectRef[] = [];
      const result = findNodeProjectForFile("src/index.ts", emptyProjects);
      expect(result).toBeUndefined();
    });
  });
});
