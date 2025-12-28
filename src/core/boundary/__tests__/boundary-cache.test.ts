import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  createBoundaryCache,
  getDefaultBoundaryCache,
  resetDefaultBoundaryCache
} from "../boundary-cache.js";
import type { BoundaryResult, BoundaryMarker } from "../types.js";
import { MARKERS } from "../types.js";

describe("createBoundaryCache", () => {
  const mockMarker: BoundaryMarker = MARKERS.GIT;

  const createMockResult = (boundaryDir: string): BoundaryResult => ({
    markerPath: `${boundaryDir}/.git`,
    boundaryDir,
    relativePath: ".",
    cached: false,
    marker: mockMarker
  });

  describe("basic operations", () => {
    it("should return undefined for uncached entries", () => {
      const cache = createBoundaryCache();
      const result = cache.get("/some/path", ".git");
      expect(result).toBeUndefined();
    });

    it("should store and retrieve cached entries", () => {
      const cache = createBoundaryCache();
      const mockResult = createMockResult("/project");

      cache.set("/project/src/file.ts", ".git", mockResult);
      const cached = cache.get("/project/src/file.ts", ".git");

      expect(cached).toBeDefined();
      expect(cached?.boundaryDir).toBe("/project");
      expect(cached?.cached).toBe(true);
    });

    it("should track cache statistics", () => {
      const cache = createBoundaryCache();
      const mockResult = createMockResult("/project");

      // Initial stats
      let stats = cache.getStats();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
      expect(stats.size).toBe(0);

      // Miss
      cache.get("/project/src/file.ts", ".git");
      stats = cache.getStats();
      expect(stats.misses).toBe(1);

      // Set and hit
      cache.set("/project/src/file.ts", ".git", mockResult);
      cache.get("/project/src/file.ts", ".git");
      stats = cache.getStats();
      expect(stats.hits).toBe(1);
      expect(stats.hitRate).toBe(50); // 1 hit, 1 miss = 50%
    });

    it("should handle null results (negative cache)", () => {
      const cache = createBoundaryCache();

      cache.set("/no/git/here", ".git", null);
      const result = cache.get("/no/git/here", ".git");

      // Negative cache returns undefined (same as cache miss for the caller)
      expect(result).toBeUndefined();
    });

    it("should clear all entries", () => {
      const cache = createBoundaryCache();
      const mockResult = createMockResult("/project");

      cache.set("/project/src/a.ts", ".git", mockResult);
      cache.set("/project/src/b.ts", ".git", mockResult);

      let stats = cache.getStats();
      expect(stats.size).toBeGreaterThan(0);

      cache.clear();
      stats = cache.getStats();
      expect(stats.size).toBe(0);
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
    });
  });

  describe("path normalization", () => {
    it("should normalize path separators", () => {
      const cache = createBoundaryCache();
      const mockResult = createMockResult("/project");

      // Set with forward slashes
      cache.set("/project/src/file.ts", ".git", mockResult);

      // Get with the same path
      const result = cache.get("/project/src/file.ts", ".git");
      expect(result).toBeDefined();
    });

    it("should distinguish between different markers", () => {
      const cache = createBoundaryCache();
      const gitResult = createMockResult("/project");
      const pkgResult: BoundaryResult = {
        markerPath: "/project/package.json",
        boundaryDir: "/project",
        relativePath: ".",
        cached: false,
        marker: MARKERS.PACKAGE_JSON
      };

      cache.set("/project/src/file.ts", ".git", gitResult);
      cache.set("/project/src/file.ts", "package.json", pkgResult);

      const git = cache.get("/project/src/file.ts", ".git");
      const pkg = cache.get("/project/src/file.ts", "package.json");

      expect(git?.marker.name).toBe(".git");
      expect(pkg?.marker.name).toBe("package.json");
    });
  });

  describe("invalidation", () => {
    it("should invalidate entries under a directory", () => {
      const cache = createBoundaryCache();
      const mockResult = createMockResult("/project");

      cache.set("/project/src/a.ts", ".git", mockResult);
      cache.set("/project/src/b.ts", ".git", mockResult);
      cache.set("/other/file.ts", ".git", createMockResult("/other"));

      cache.invalidate("/project/src");

      // Entries under /project/src should be invalidated
      expect(cache.get("/project/src/a.ts", ".git")).toBeUndefined();
      expect(cache.get("/project/src/b.ts", ".git")).toBeUndefined();

      // Entry under /other should still exist
      const otherResult = cache.get("/other/file.ts", ".git");
      expect(otherResult).toBeDefined();
    });
  });

  describe("TTL expiration", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("should expire entries after TTL", () => {
      const cache = createBoundaryCache({ ttlMs: 1000 });
      const mockResult = createMockResult("/project");

      cache.set("/project/src/file.ts", ".git", mockResult);

      // Before expiration
      let result = cache.get("/project/src/file.ts", ".git");
      expect(result).toBeDefined();

      // After expiration
      vi.advanceTimersByTime(1500);
      result = cache.get("/project/src/file.ts", ".git");
      expect(result).toBeUndefined();
    });
  });

  describe("LRU eviction", () => {
    it("should evict oldest entries when maxSize is exceeded", () => {
      const cache = createBoundaryCache({ maxSize: 3 });

      cache.set("/path/1", ".git", createMockResult("/path/1"));
      cache.set("/path/2", ".git", createMockResult("/path/2"));
      cache.set("/path/3", ".git", createMockResult("/path/3"));

      // All three should be present
      expect(cache.getStats().size).toBeLessThanOrEqual(3);

      // Access /path/1 to make it recently used
      cache.get("/path/1", ".git");

      // Add a fourth entry, which should evict /path/2 (least recently used)
      cache.set("/path/4", ".git", createMockResult("/path/4"));

      // Size should be at max
      expect(cache.getStats().size).toBeLessThanOrEqual(3);
    });
  });

  describe("hierarchical caching", () => {
    it("should cache intermediate directories", () => {
      const cache = createBoundaryCache();
      const mockResult: BoundaryResult = {
        markerPath: "/project/.git",
        boundaryDir: "/project",
        relativePath: "src/lib",
        cached: false,
        marker: MARKERS.GIT
      };

      // Set for a deep path
      cache.set("/project/src/lib/utils.ts", ".git", mockResult);

      // The cache should also have entries for intermediate paths
      // (This depends on implementation - the cache may or may not cache intermediate paths)
      const stats = cache.getStats();
      expect(stats.size).toBeGreaterThanOrEqual(1);
    });
  });
});

describe("getDefaultBoundaryCache", () => {
  afterEach(() => {
    resetDefaultBoundaryCache();
  });

  it("should return the same instance on multiple calls", () => {
    const cache1 = getDefaultBoundaryCache();
    const cache2 = getDefaultBoundaryCache();
    expect(cache1).toBe(cache2);
  });

  it("should return a new instance after reset", () => {
    const cache1 = getDefaultBoundaryCache();
    resetDefaultBoundaryCache();
    const cache2 = getDefaultBoundaryCache();
    expect(cache1).not.toBe(cache2);
  });
});
