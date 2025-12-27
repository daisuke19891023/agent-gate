/**
 * LRU cache implementation for boundary detection results.
 *
 * Features:
 * - Time-based expiration (TTL)
 * - Size-based eviction (LRU)
 * - Hierarchical invalidation (invalidate all entries under a path)
 * - Negative caching (cache "not found" results)
 */

import path from "node:path";
import type {
  BoundaryCache,
  BoundaryCacheOptions,
  BoundaryCacheStats,
  BoundaryResult
} from "./types.js";

/**
 * Internal cache entry structure.
 */
interface CacheEntry {
  /** The cached result, or null for negative cache (not found) */
  result: BoundaryResult | null;
  /** Timestamp when this entry was created */
  createdAt: number;
  /** Last access timestamp for LRU ordering */
  lastAccessedAt: number;
}

/**
 * Creates a cache key from start path and marker name.
 */
function makeCacheKey(startPath: string, markerName: string): string {
  // Normalize path separators for consistent keys
  const normalizedPath = startPath.replace(/\\/g, "/");
  return `${normalizedPath}::${markerName}`;
}

/**
 * Creates a new boundary cache instance.
 *
 * @param options - Cache configuration options
 * @returns A new BoundaryCache instance
 */
export function createBoundaryCache(options: BoundaryCacheOptions = {}): BoundaryCache {
  const maxSize = options.maxSize ?? 1000;
  const ttlMs = options.ttlMs ?? 30_000;

  const cache = new Map<string, CacheEntry>();
  let hits = 0;
  let misses = 0;

  /**
   * Evict entries to bring cache size within limits (LRU policy).
   */
  function evictIfNeeded(): void {
    if (cache.size <= maxSize) {
      return;
    }

    // Sort entries by last accessed time (oldest first)
    const entries = Array.from(cache.entries()).sort(
      ([, a], [, b]) => a.lastAccessedAt - b.lastAccessedAt
    );

    // Remove oldest entries until we're under the limit
    const entriesToRemove = entries.slice(0, cache.size - maxSize);
    for (const [key] of entriesToRemove) {
      cache.delete(key);
    }
  }

  /**
   * Check if an entry is expired based on TTL.
   */
  function isExpired(entry: CacheEntry): boolean {
    return Date.now() - entry.createdAt > ttlMs;
  }

  return {
    get(startPath: string, markerName: string): BoundaryResult | undefined {
      const key = makeCacheKey(startPath, markerName);
      const entry = cache.get(key);

      if (!entry) {
        misses++;
        return undefined;
      }

      if (isExpired(entry)) {
        // Entry has expired, remove it
        cache.delete(key);
        misses++;
        return undefined;
      }

      // Update last accessed time for LRU
      entry.lastAccessedAt = Date.now();
      hits++;

      // Return the result (may be null for negative cache)
      // For negative cache, we return undefined to indicate "not in cache"
      // The caller will need to distinguish between "not cached" and "cached as not found"
      if (entry.result === null) {
        // Return a special marker for negative cache
        // Actually, we should return undefined for "not found" cases
        // since the caller expects BoundaryResult | undefined
        return undefined;
      }

      // Mark as cached
      return {
        ...entry.result,
        cached: true
      };
    },

    set(startPath: string, markerName: string, result: BoundaryResult | null): void {
      const key = makeCacheKey(startPath, markerName);
      const now = Date.now();

      cache.set(key, {
        result:
          result === null
            ? null
            : {
                ...result,
                cached: false // Store without cached flag, we'll add it on get
              },
        createdAt: now,
        lastAccessedAt: now
      });

      evictIfNeeded();

      // Also cache intermediate paths for hierarchical optimization
      // If we found a boundary at /a/b/.git, we can cache that for /a/b/c/d as well
      if (result !== null) {
        const normalizedStart = path.normalize(startPath);
        const normalizedBoundary = path.normalize(result.boundaryDir);

        // Cache for all intermediate directories between start and boundary
        let current = path.dirname(normalizedStart);
        while (current !== normalizedBoundary && current.startsWith(normalizedBoundary)) {
          const intermediateKey = makeCacheKey(current, markerName);
          if (!cache.has(intermediateKey)) {
            const relativePath = path.relative(current, normalizedBoundary).replace(/\\/g, "/");
            cache.set(intermediateKey, {
              result: {
                ...result,
                relativePath: relativePath || ".",
                cached: false
              },
              createdAt: now,
              lastAccessedAt: now
            });
          }
          const parentDir = path.dirname(current);
          if (parentDir === current) break; // Reached root
          current = parentDir;
        }

        evictIfNeeded();
      }
    },

    invalidate(dirPath: string): void {
      const normalizedDir = dirPath.replace(/\\/g, "/");

      // Remove all entries whose start path is under the given directory
      for (const key of cache.keys()) {
        // Key format: "path::markerName"
        const pathPart = key.split("::")[0];
        if (pathPart?.startsWith(normalizedDir)) {
          cache.delete(key);
        }
      }
    },

    clear(): void {
      cache.clear();
      hits = 0;
      misses = 0;
    },

    getStats(): BoundaryCacheStats {
      const total = hits + misses;
      return {
        hits,
        misses,
        size: cache.size,
        maxSize,
        hitRate: total === 0 ? 0 : Math.round((hits / total) * 100)
      };
    }
  };
}

/**
 * Default shared cache instance.
 * Can be used when a single global cache is acceptable.
 */
let defaultCache: BoundaryCache | null = null;

/**
 * Get the default shared cache instance.
 * Creates one if it doesn't exist.
 */
export function getDefaultBoundaryCache(): BoundaryCache {
  if (!defaultCache) {
    defaultCache = createBoundaryCache();
  }
  return defaultCache;
}

/**
 * Reset the default cache (useful for testing).
 */
export function resetDefaultBoundaryCache(): void {
  defaultCache?.clear();
  defaultCache = null;
}
