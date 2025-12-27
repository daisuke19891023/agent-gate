import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {
  findNearestBoundary,
  findNearestBoundaryAny,
  findAllBoundaries,
  findAllMarkersInTree
} from "../ancestor-finder.js";
import { createBoundaryCache } from "../boundary-cache.js";
import { MARKERS } from "../types.js";
import type { BoundaryMarker } from "../types.js";

describe("ancestor-finder", () => {
  let testDir: string;

  beforeEach(async () => {
    // Create a unique temp directory for each test
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), "boundary-test-"));
  });

  afterEach(async () => {
    // Clean up temp directory
    await fs.rm(testDir, { recursive: true, force: true });
  });

  /**
   * Helper to create a directory structure for testing.
   */
  async function createStructure(structure: Record<string, "file" | "dir">): Promise<void> {
    for (const [relativePath, type] of Object.entries(structure)) {
      const fullPath = path.join(testDir, relativePath);
      const dir = type === "dir" ? fullPath : path.dirname(fullPath);

      await fs.mkdir(dir, { recursive: true });

      if (type === "file") {
        await fs.writeFile(fullPath, "");
      }
    }
  }

  describe("findNearestBoundary", () => {
    it("should find a marker in the same directory", async () => {
      await createStructure({
        ".git": "dir",
        "file.ts": "file"
      });

      const result = await findNearestBoundary(path.join(testDir, "file.ts"), MARKERS.GIT);

      expect(result).not.toBeNull();
      expect(result?.boundaryDir).toBe(testDir.replace(/\\/g, "/"));
      expect(result?.markerPath).toBe(path.join(testDir, ".git").replace(/\\/g, "/"));
      expect(result?.cached).toBe(false);
    });

    it("should find a marker in an ancestor directory", async () => {
      await createStructure({
        ".git": "dir",
        "src/lib/utils.ts": "file"
      });

      const result = await findNearestBoundary(
        path.join(testDir, "src", "lib", "utils.ts"),
        MARKERS.GIT
      );

      expect(result).not.toBeNull();
      expect(result?.boundaryDir).toBe(testDir.replace(/\\/g, "/"));
    });

    it("should return null when marker is not found", async () => {
      await createStructure({
        "src/file.ts": "file"
      });

      const result = await findNearestBoundary(path.join(testDir, "src", "file.ts"), MARKERS.GIT, {
        stopAt: testDir
      });

      expect(result).toBeNull();
    });

    it("should respect stopAt option", async () => {
      // Create .git outside the stopAt boundary
      const parentDir = path.dirname(testDir);
      const parentGitDir = path.join(parentDir, ".git-test-temp");

      try {
        await fs.mkdir(parentGitDir, { recursive: true });
        await createStructure({
          "src/file.ts": "file"
        });

        const result = await findNearestBoundary(
          path.join(testDir, "src", "file.ts"),
          { name: ".git-test-temp", type: "directory" },
          { stopAt: testDir }
        );

        // Should not find the .git-test-temp in parent because we stop at testDir
        expect(result).toBeNull();
      } finally {
        await fs.rm(parentGitDir, { recursive: true, force: true }).catch(() => {});
      }
    });

    it("should find file markers", async () => {
      await createStructure({
        "package.json": "file",
        "src/index.ts": "file"
      });

      const result = await findNearestBoundary(
        path.join(testDir, "src", "index.ts"),
        MARKERS.PACKAGE_JSON
      );

      expect(result).not.toBeNull();
      expect(result?.markerPath).toContain("package.json");
    });

    it("should distinguish between file and directory markers", async () => {
      // Create .git as a file (like in submodules/worktrees)
      await createStructure({
        ".git": "file",
        "src/file.ts": "file"
      });

      // MARKERS.GIT is 'either', so it should find the file
      const eitherResult = await findNearestBoundary(
        path.join(testDir, "src", "file.ts"),
        MARKERS.GIT
      );
      expect(eitherResult).not.toBeNull();

      // A directory-only marker should not find the file
      const dirOnlyMarker: BoundaryMarker = { name: ".git", type: "directory" };
      const dirResult = await findNearestBoundary(
        path.join(testDir, "src", "file.ts"),
        dirOnlyMarker,
        { stopAt: testDir }
      );
      expect(dirResult).toBeNull();
    });

    it("should use cache when provided", async () => {
      await createStructure({
        ".git": "dir",
        "src/file.ts": "file"
      });

      const cache = createBoundaryCache();
      const filePath = path.join(testDir, "src", "file.ts");

      // First call - cache miss
      const result1 = await findNearestBoundary(filePath, MARKERS.GIT, { cache });
      expect(result1?.cached).toBe(false);

      // Second call - cache hit
      const result2 = await findNearestBoundary(filePath, MARKERS.GIT, { cache });
      expect(result2?.cached).toBe(true);

      const stats = cache.getStats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
    });

    it("should run custom validation", async () => {
      await createStructure({
        ".git": "dir",
        "src/file.ts": "file"
      });

      // Validator that always rejects
      const rejectingMarker: BoundaryMarker = {
        name: ".git",
        type: "directory",
        validate: async () => false
      };

      const result = await findNearestBoundary(
        path.join(testDir, "src", "file.ts"),
        rejectingMarker,
        { stopAt: testDir }
      );

      expect(result).toBeNull();
    });

    it("should handle non-existent start path", async () => {
      await createStructure({
        ".git": "dir"
      });

      // Start from a path that doesn't exist
      const result = await findNearestBoundary(
        path.join(testDir, "nonexistent", "file.ts"),
        MARKERS.GIT
      );

      expect(result).not.toBeNull();
      expect(result?.boundaryDir).toBe(testDir.replace(/\\/g, "/"));
    });
  });

  describe("findNearestBoundaryAny", () => {
    it("should find the first matching marker", async () => {
      await createStructure({
        "pnpm-lock.yaml": "file",
        "src/file.ts": "file"
      });

      const result = await findNearestBoundaryAny(path.join(testDir, "src", "file.ts"), [
        MARKERS.PNPM_LOCK,
        MARKERS.PACKAGE_LOCK,
        MARKERS.YARN_LOCK
      ]);

      expect(result).not.toBeNull();
      expect(result?.marker.name).toBe("pnpm-lock.yaml");
    });

    it("should try markers in order", async () => {
      await createStructure({
        "yarn.lock": "file",
        "src/file.ts": "file"
      });

      const result = await findNearestBoundaryAny(path.join(testDir, "src", "file.ts"), [
        MARKERS.PNPM_LOCK,
        MARKERS.PACKAGE_LOCK,
        MARKERS.YARN_LOCK
      ]);

      expect(result).not.toBeNull();
      expect(result?.marker.name).toBe("yarn.lock");
    });

    it("should return null when no markers are found", async () => {
      await createStructure({
        "src/file.ts": "file"
      });

      const result = await findNearestBoundaryAny(
        path.join(testDir, "src", "file.ts"),
        [MARKERS.PNPM_LOCK, MARKERS.PACKAGE_LOCK, MARKERS.YARN_LOCK],
        { stopAt: testDir }
      );

      expect(result).toBeNull();
    });
  });

  describe("findAllBoundaries", () => {
    it("should find multiple markers in the ancestor chain", async () => {
      // Create nested .git directories (like with submodules)
      await createStructure({
        ".git": "dir",
        "submodule/.git": "file", // Submodule has .git as file
        "submodule/src/file.ts": "file"
      });

      const results = await findAllBoundaries(
        path.join(testDir, "submodule", "src", "file.ts"),
        MARKERS.GIT
      );

      expect(results.length).toBe(2);
      // Results should be sorted from closest to farthest
      expect(results[0]?.boundaryDir).toContain("submodule");
      expect(results[1]?.boundaryDir).toBe(testDir.replace(/\\/g, "/"));
    });

    it("should return empty array when no markers found", async () => {
      await createStructure({
        "src/file.ts": "file"
      });

      const results = await findAllBoundaries(path.join(testDir, "src", "file.ts"), MARKERS.GIT, {
        stopAt: testDir
      });

      expect(results).toEqual([]);
    });
  });

  describe("findAllMarkersInTree", () => {
    it("should find all markers in a directory tree", async () => {
      await createStructure({
        "package.json": "file",
        "packages/a/package.json": "file",
        "packages/b/package.json": "file",
        "packages/b/src/index.ts": "file"
      });

      const results = await findAllMarkersInTree(testDir, MARKERS.PACKAGE_JSON);

      expect(results.length).toBe(3);
      // Results should be sorted by path
      const paths = results.map((r) => r.relativePath);
      expect(paths).toContain(".");
      expect(paths.some((p) => p.includes("packages/a"))).toBe(true);
      expect(paths.some((p) => p.includes("packages/b"))).toBe(true);
    });

    it("should exclude default directories", async () => {
      await createStructure({
        "package.json": "file",
        "node_modules/some-pkg/package.json": "file",
        ".git/hooks/package.json": "file"
      });

      const results = await findAllMarkersInTree(testDir, MARKERS.PACKAGE_JSON);

      // Should only find the root package.json
      expect(results.length).toBe(1);
      expect(results[0]?.relativePath).toBe(".");
    });

    it("should respect custom exclude directories", async () => {
      await createStructure({
        "package.json": "file",
        "vendor/dep/package.json": "file",
        "lib/package.json": "file"
      });

      const results = await findAllMarkersInTree(testDir, MARKERS.PACKAGE_JSON, {
        excludeDirs: ["vendor"]
      });

      // Should find root and lib, but not vendor
      expect(results.length).toBe(2);
      const paths = results.map((r) => r.relativePath);
      expect(paths.some((p) => p.includes("vendor"))).toBe(false);
    });

    it("should respect maxDepth option", async () => {
      await createStructure({
        "package.json": "file",
        "level1/package.json": "file",
        "level1/level2/package.json": "file",
        "level1/level2/level3/package.json": "file"
      });

      const results = await findAllMarkersInTree(testDir, MARKERS.PACKAGE_JSON, {
        maxDepth: 2
      });

      // Should find root, level1, and level2 (depth 0, 1, 2)
      expect(results.length).toBe(3);
    });

    it("should handle pyproject.toml for Python projects", async () => {
      await createStructure({
        "pyproject.toml": "file",
        "libs/utils/pyproject.toml": "file",
        "libs/core/pyproject.toml": "file"
      });

      const results = await findAllMarkersInTree(testDir, MARKERS.PYPROJECT_TOML);

      expect(results.length).toBe(3);
    });
  });
});
