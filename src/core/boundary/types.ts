/**
 * Boundary detection types.
 *
 * This module provides types for finding project boundaries (e.g., .git, package.json)
 * by traversing ancestor directories. It supports caching for performance optimization.
 */

/**
 * Defines a marker used to identify a boundary (e.g., `.git`, `package.json`).
 */
export interface BoundaryMarker {
  /**
   * Name of the marker file or directory.
   * Supports exact names (e.g., '.git') or glob patterns (e.g., '*.csproj').
   */
  readonly name: string;

  /**
   * Type of the marker:
   * - 'file': The marker must be a file
   * - 'directory': The marker must be a directory
   * - 'either': The marker can be either a file or directory
   */
  readonly type: "file" | "directory" | "either";

  /**
   * Optional validation function to perform additional checks.
   * Called after the marker is found to verify it's the correct one.
   *
   * @param markerPath - Absolute path to the found marker
   * @returns Promise<boolean> - true if valid, false otherwise
   */
  readonly validate?: (markerPath: string) => Promise<boolean>;
}

/**
 * Result of a boundary search.
 */
export interface BoundaryResult {
  /**
   * Absolute path to the found marker (file or directory).
   */
  readonly markerPath: string;

  /**
   * Absolute path to the directory containing the marker.
   * This is the "boundary directory" - typically the project root.
   */
  readonly boundaryDir: string;

  /**
   * Relative path from the start path to the boundary directory.
   * Uses forward slashes regardless of platform.
   */
  readonly relativePath: string;

  /**
   * Whether this result was retrieved from cache.
   */
  readonly cached: boolean;

  /**
   * The marker that matched.
   */
  readonly marker: BoundaryMarker;
}

/**
 * Configuration options for the boundary cache.
 */
export interface BoundaryCacheOptions {
  /**
   * Maximum number of entries to store in the cache.
   * Older entries are evicted when this limit is reached (LRU policy).
   * @default 1000
   */
  readonly maxSize?: number;

  /**
   * Time-to-live for cache entries in milliseconds.
   * Entries older than this are considered stale and will be refreshed.
   * @default 30000 (30 seconds)
   */
  readonly ttlMs?: number;
}

/**
 * Options for boundary search functions.
 */
export interface FindBoundaryOptions {
  /**
   * Stop searching when reaching this directory (exclusive).
   * If not specified, search continues to the filesystem root.
   */
  readonly stopAt?: string;

  /**
   * Cache instance to use for storing/retrieving results.
   * If not provided, no caching is performed.
   */
  readonly cache?: BoundaryCache;
}

/**
 * Interface for the boundary cache.
 * Implementations must be thread-safe and support LRU eviction.
 */
export interface BoundaryCache {
  /**
   * Get a cached result for a given start path and marker.
   *
   * @param startPath - The path from which the search started
   * @param markerName - Name of the marker being searched for
   * @returns Cached result if found and not expired, undefined otherwise
   */
  get(startPath: string, markerName: string): BoundaryResult | undefined;

  /**
   * Store a result in the cache.
   *
   * @param startPath - The path from which the search started
   * @param markerName - Name of the marker
   * @param result - The result to cache (null means "not found")
   */
  set(startPath: string, markerName: string, result: BoundaryResult | null): void;

  /**
   * Invalidate all cached entries for paths under the given directory.
   * Used when filesystem changes are detected.
   *
   * @param dirPath - Directory path; all cached entries under this path are invalidated
   */
  invalidate(dirPath: string): void;

  /**
   * Clear all cached entries.
   */
  clear(): void;

  /**
   * Get cache statistics for debugging/monitoring.
   */
  getStats(): BoundaryCacheStats;
}

/**
 * Statistics about cache performance.
 */
export interface BoundaryCacheStats {
  /** Number of cache hits */
  readonly hits: number;

  /** Number of cache misses */
  readonly misses: number;

  /** Current number of entries in the cache */
  readonly size: number;

  /** Maximum allowed size */
  readonly maxSize: number;

  /** Hit rate as a percentage (0-100) */
  readonly hitRate: number;
}

/**
 * Common boundary markers used throughout the codebase.
 */
export const MARKERS = {
  /**
   * Git repository marker.
   * Can be a directory (.git folder) or a file (worktree/submodule).
   */
  GIT: { name: ".git", type: "either" } as const satisfies BoundaryMarker,

  /**
   * Node.js package marker.
   */
  PACKAGE_JSON: { name: "package.json", type: "file" } as const satisfies BoundaryMarker,

  /**
   * Python project marker.
   */
  PYPROJECT_TOML: { name: "pyproject.toml", type: "file" } as const satisfies BoundaryMarker,

  /**
   * Node modules directory.
   */
  NODE_MODULES: { name: "node_modules", type: "directory" } as const satisfies BoundaryMarker,

  /**
   * pnpm workspace configuration.
   */
  PNPM_WORKSPACE: { name: "pnpm-workspace.yaml", type: "file" } as const satisfies BoundaryMarker,

  /**
   * pnpm lock file.
   */
  PNPM_LOCK: { name: "pnpm-lock.yaml", type: "file" } as const satisfies BoundaryMarker,

  /**
   * npm lock file.
   */
  PACKAGE_LOCK: { name: "package-lock.json", type: "file" } as const satisfies BoundaryMarker,

  /**
   * Yarn lock file.
   */
  YARN_LOCK: { name: "yarn.lock", type: "file" } as const satisfies BoundaryMarker,

  /**
   * Gradle build directory.
   */
  GRADLE: { name: ".gradle", type: "directory" } as const satisfies BoundaryMarker,

  /**
   * Gradle build file.
   */
  BUILD_GRADLE: { name: "build.gradle", type: "file" } as const satisfies BoundaryMarker,

  /**
   * Gradle Kotlin build file.
   */
  BUILD_GRADLE_KTS: { name: "build.gradle.kts", type: "file" } as const satisfies BoundaryMarker,

  /**
   * Poetry lock file.
   */
  POETRY_LOCK: { name: "poetry.lock", type: "file" } as const satisfies BoundaryMarker,

  /**
   * uv lock file.
   */
  UV_LOCK: { name: "uv.lock", type: "file" } as const satisfies BoundaryMarker
} as const;

/**
 * Type representing all predefined marker names.
 */
export type MarkerName = keyof typeof MARKERS;
