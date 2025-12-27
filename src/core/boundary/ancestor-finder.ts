/**
 * Ancestor directory finder for boundary detection.
 *
 * Provides functions to find project boundaries (e.g., .git, package.json)
 * by traversing up the directory tree from a starting path.
 */

import fs from "node:fs/promises";
import path from "node:path";
import type { BoundaryMarker, BoundaryResult, FindBoundaryOptions } from "./types.js";

/**
 * Check if a path exists and matches the expected type.
 *
 * @param targetPath - Path to check
 * @param expectedType - Expected type ('file', 'directory', or 'either')
 * @returns true if the path exists and matches the type
 */
async function checkMarkerExists(
  targetPath: string,
  expectedType: BoundaryMarker["type"]
): Promise<boolean> {
  try {
    const stats = await fs.stat(targetPath);

    switch (expectedType) {
      case "file":
        return stats.isFile();
      case "directory":
        return stats.isDirectory();
      case "either":
        return stats.isFile() || stats.isDirectory();
      default:
        return false;
    }
  } catch {
    // Path doesn't exist or is inaccessible
    return false;
  }
}

/**
 * Normalize a path for consistent handling across platforms.
 * Uses forward slashes and resolves to absolute path.
 */
function normalizePath(inputPath: string): string {
  return path.resolve(inputPath).replace(/\\/g, "/");
}

/**
 * Calculate the relative path from one directory to another.
 * Always uses forward slashes.
 */
function getRelativePath(from: string, to: string): string {
  const relativePath = path.relative(from, to);
  return relativePath.replace(/\\/g, "/") || ".";
}

/**
 * Check if we should stop searching at this directory.
 */
function shouldStop(currentDir: string, stopAt: string | undefined): boolean {
  if (!stopAt) {
    return false;
  }
  const normalizedCurrent = normalizePath(currentDir);
  const normalizedStop = normalizePath(stopAt);

  // Stop if we've reached or passed the stop directory
  return (
    normalizedCurrent === normalizedStop || !normalizedCurrent.startsWith(normalizedStop + "/")
  );
}

/**
 * Find the nearest ancestor directory containing the specified marker.
 *
 * Traverses up the directory tree from the starting path until it finds
 * a directory containing the marker, or reaches the stop point / filesystem root.
 *
 * @param startPath - Absolute or relative path to start searching from
 * @param marker - The boundary marker to search for
 * @param options - Search options (stopAt, cache)
 * @returns BoundaryResult if found, null if not found
 *
 * @example
 * ```typescript
 * const result = await findNearestBoundary('/project/src/lib/utils.ts', MARKERS.GIT);
 * if (result) {
 *   console.log(`Git root: ${result.boundaryDir}`);
 * }
 * ```
 */
export async function findNearestBoundary(
  startPath: string,
  marker: BoundaryMarker,
  options: FindBoundaryOptions = {}
): Promise<BoundaryResult | null> {
  const { stopAt, cache } = options;
  const normalizedStart = normalizePath(startPath);

  // Check cache first
  if (cache) {
    const cached = cache.get(normalizedStart, marker.name);
    if (cached !== undefined) {
      return cached;
    }
  }

  // Determine if startPath is a file or directory
  let currentDir: string;
  try {
    const stats = await fs.stat(normalizedStart);
    currentDir = stats.isDirectory() ? normalizedStart : path.dirname(normalizedStart);
  } catch {
    // If path doesn't exist, treat it as a file path and get its parent
    currentDir = path.dirname(normalizedStart);
  }

  // Traverse up the directory tree
  let searchedDirs: string[] = [];

  while (true) {
    searchedDirs.push(currentDir);

    // Check if the marker exists in this directory
    const markerPath = path.join(currentDir, marker.name);
    const exists = await checkMarkerExists(markerPath, marker.type);

    if (exists) {
      // Run custom validation if provided
      if (marker.validate) {
        const isValid = await marker.validate(markerPath);
        if (!isValid) {
          // Validation failed, continue searching
          const parentDir = path.dirname(currentDir);
          if (parentDir === currentDir || shouldStop(parentDir, stopAt)) {
            break;
          }
          currentDir = parentDir;
          continue;
        }
      }

      // Found the marker!
      const result: BoundaryResult = {
        markerPath: normalizePath(markerPath),
        boundaryDir: normalizePath(currentDir),
        relativePath: getRelativePath(normalizedStart, currentDir),
        cached: false,
        marker
      };

      // Cache the result for the original start path and all searched directories
      if (cache) {
        // Cache for the original start path
        cache.set(normalizedStart, marker.name, result);

        // Also cache for intermediate directories
        for (const dir of searchedDirs) {
          if (dir !== normalizedStart) {
            cache.set(dir, marker.name, {
              ...result,
              relativePath: getRelativePath(dir, currentDir)
            });
          }
        }
      }

      return result;
    }

    // Move to parent directory
    const parentDir = path.dirname(currentDir);

    // Check if we've reached the root or stop point
    if (parentDir === currentDir || shouldStop(parentDir, stopAt)) {
      break;
    }

    currentDir = parentDir;
  }

  // Not found - cache negative result
  if (cache) {
    cache.set(normalizedStart, marker.name, null);
  }

  return null;
}

/**
 * Find the nearest ancestor directory containing any of the specified markers.
 *
 * Returns the first match found (closest to the start path).
 * Markers are checked in the order they appear in the array.
 *
 * @param startPath - Path to start searching from
 * @param markers - Array of markers to search for
 * @param options - Search options
 * @returns BoundaryResult for the first match, null if none found
 *
 * @example
 * ```typescript
 * const result = await findNearestBoundaryAny('/project/src', [
 *   MARKERS.PNPM_LOCK,
 *   MARKERS.PACKAGE_LOCK,
 *   MARKERS.YARN_LOCK,
 * ]);
 * if (result) {
 *   console.log(`Lock file found: ${result.marker.name}`);
 * }
 * ```
 */
export async function findNearestBoundaryAny(
  startPath: string,
  markers: BoundaryMarker[],
  options: FindBoundaryOptions = {}
): Promise<BoundaryResult | null> {
  const { stopAt, cache } = options;
  const normalizedStart = normalizePath(startPath);

  // Determine starting directory
  let currentDir: string;
  try {
    const stats = await fs.stat(normalizedStart);
    currentDir = stats.isDirectory() ? normalizedStart : path.dirname(normalizedStart);
  } catch {
    currentDir = path.dirname(normalizedStart);
  }

  // Traverse up the directory tree
  while (true) {
    // Check each marker in this directory
    for (const marker of markers) {
      // Check cache first
      if (cache) {
        const cached = cache.get(currentDir, marker.name);
        if (cached !== undefined) {
          return cached;
        }
      }

      const markerPath = path.join(currentDir, marker.name);
      const exists = await checkMarkerExists(markerPath, marker.type);

      if (exists) {
        // Run custom validation if provided
        if (marker.validate) {
          const isValid = await marker.validate(markerPath);
          if (!isValid) {
            continue;
          }
        }

        const result: BoundaryResult = {
          markerPath: normalizePath(markerPath),
          boundaryDir: normalizePath(currentDir),
          relativePath: getRelativePath(normalizedStart, currentDir),
          cached: false,
          marker
        };

        // Cache the result
        if (cache) {
          cache.set(normalizedStart, marker.name, result);
        }

        return result;
      }
    }

    // Move to parent directory
    const parentDir = path.dirname(currentDir);

    if (parentDir === currentDir || shouldStop(parentDir, stopAt)) {
      break;
    }

    currentDir = parentDir;
  }

  return null;
}

/**
 * Find all ancestor directories containing the specified marker.
 *
 * Unlike findNearestBoundary, this returns all matches from the start path
 * up to the stop point (or filesystem root).
 *
 * @param startPath - Path to start searching from
 * @param marker - The boundary marker to search for
 * @param options - Search options
 * @returns Array of BoundaryResults, sorted from closest to farthest
 *
 * @example
 * ```typescript
 * // Find all .git directories (including parent repos and submodules)
 * const results = await findAllBoundaries('/project/submodule/src', MARKERS.GIT);
 * for (const result of results) {
 *   console.log(`Git repo at: ${result.boundaryDir}`);
 * }
 * ```
 */
export async function findAllBoundaries(
  startPath: string,
  marker: BoundaryMarker,
  options: FindBoundaryOptions = {}
): Promise<BoundaryResult[]> {
  const { stopAt, cache } = options;
  const normalizedStart = normalizePath(startPath);
  const results: BoundaryResult[] = [];

  // Determine starting directory
  let currentDir: string;
  try {
    const stats = await fs.stat(normalizedStart);
    currentDir = stats.isDirectory() ? normalizedStart : path.dirname(normalizedStart);
  } catch {
    currentDir = path.dirname(normalizedStart);
  }

  // Traverse up the directory tree
  while (true) {
    const markerPath = path.join(currentDir, marker.name);
    const exists = await checkMarkerExists(markerPath, marker.type);

    if (exists) {
      // Run custom validation if provided
      let isValid = true;
      if (marker.validate) {
        isValid = await marker.validate(markerPath);
      }

      if (isValid) {
        const result: BoundaryResult = {
          markerPath: normalizePath(markerPath),
          boundaryDir: normalizePath(currentDir),
          relativePath: getRelativePath(normalizedStart, currentDir),
          cached: false,
          marker
        };

        results.push(result);

        // Cache this result
        if (cache) {
          cache.set(currentDir, marker.name, result);
        }
      }
    }

    // Move to parent directory
    const parentDir = path.dirname(currentDir);

    if (parentDir === currentDir || shouldStop(parentDir, stopAt)) {
      break;
    }

    currentDir = parentDir;
  }

  return results;
}

/**
 * Find all files matching a marker within a directory tree (top-down search).
 *
 * Unlike findAllBoundaries which searches upward, this searches downward
 * through the directory tree. Useful for finding all project roots within a repo.
 *
 * @param rootDir - Directory to start searching from
 * @param marker - The boundary marker to search for
 * @param options - Search options including depth limit and excludes
 * @returns Array of BoundaryResults for all matches
 *
 * @example
 * ```typescript
 * // Find all pyproject.toml files in a repo
 * const results = await findAllMarkersInTree('/repo', MARKERS.PYPROJECT_TOML, {
 *   excludeDirs: ['node_modules', '.git', '__pycache__', '.venv'],
 * });
 * ```
 */
export async function findAllMarkersInTree(
  rootDir: string,
  marker: BoundaryMarker,
  options: {
    excludeDirs?: string[];
    maxDepth?: number;
  } = {}
): Promise<BoundaryResult[]> {
  const { excludeDirs = [], maxDepth = 20 } = options;
  const normalizedRoot = normalizePath(rootDir);
  const results: BoundaryResult[] = [];

  const defaultExcludes = new Set([
    "node_modules",
    ".git",
    "__pycache__",
    ".venv",
    "venv",
    ".tox",
    "dist",
    "build",
    ".next",
    ".nuxt",
    "coverage"
  ]);

  const excludeSet = new Set([...defaultExcludes, ...excludeDirs]);

  async function searchDir(dirPath: string, depth: number): Promise<void> {
    if (depth > maxDepth) {
      return;
    }

    // Check if the marker exists in this directory
    const markerPath = path.join(dirPath, marker.name);
    const exists = await checkMarkerExists(markerPath, marker.type);

    if (exists) {
      let isValid = true;
      if (marker.validate) {
        isValid = await marker.validate(markerPath);
      }

      if (isValid) {
        results.push({
          markerPath: normalizePath(markerPath),
          boundaryDir: normalizePath(dirPath),
          relativePath: getRelativePath(normalizedRoot, dirPath),
          cached: false,
          marker
        });
      }
    }

    // Read directory contents and recurse
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      const subdirs = entries.filter((entry) => {
        if (!entry.isDirectory()) {
          return false;
        }
        // Skip excluded directories
        if (excludeSet.has(entry.name)) {
          return false;
        }
        // Skip hidden directories (except .git which we might want)
        if (entry.name.startsWith(".") && entry.name !== marker.name) {
          return false;
        }
        return true;
      });

      // Process subdirectories in parallel with concurrency limit
      const CONCURRENCY = 10;
      for (let i = 0; i < subdirs.length; i += CONCURRENCY) {
        const batch = subdirs.slice(i, i + CONCURRENCY);
        await Promise.all(
          batch.map((entry) => searchDir(path.join(dirPath, entry.name), depth + 1))
        );
      }
    } catch {
      // Directory is not readable, skip it
    }
  }

  await searchDir(normalizedRoot, 0);

  // Sort results by path for deterministic output
  results.sort((a, b) => a.boundaryDir.localeCompare(b.boundaryDir));

  return results;
}
