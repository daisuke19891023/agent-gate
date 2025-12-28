/**
 * Boundary detection module.
 *
 * Provides utilities for finding project boundaries (e.g., .git, package.json)
 * by traversing ancestor directories. Supports caching for performance.
 *
 * @example
 * ```typescript
 * import {
 *   findNearestBoundary,
 *   findAllBoundaries,
 *   findAllMarkersInTree,
 *   createBoundaryCache,
 *   MARKERS,
 * } from './boundary/index.js';
 *
 * // Find the nearest .git directory
 * const cache = createBoundaryCache();
 * const gitRoot = await findNearestBoundary('/project/src/file.ts', MARKERS.GIT, { cache });
 *
 * // Find all pyproject.toml files in a repo
 * const pythonProjects = await findAllMarkersInTree('/repo', MARKERS.PYPROJECT_TOML);
 * ```
 */

// Types
export type {
  BoundaryMarker,
  BoundaryResult,
  BoundaryCacheOptions,
  BoundaryCache,
  BoundaryCacheStats,
  FindBoundaryOptions,
  MarkerName
} from "./types.js";

// Constants
export { MARKERS } from "./types.js";

// Cache
export {
  createBoundaryCache,
  getDefaultBoundaryCache,
  resetDefaultBoundaryCache
} from "./boundary-cache.js";

// Finder functions
export {
  findNearestBoundary,
  findNearestBoundaryAny,
  findAllBoundaries,
  findAllMarkersInTree
} from "./ancestor-finder.js";
