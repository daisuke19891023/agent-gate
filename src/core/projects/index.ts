/**
 * Project detection module.
 *
 * Provides utilities for detecting projects in monorepos.
 */

// Types
export type {
  ProjectKind,
  NodePackageManager,
  PythonPackageManager,
  ProjectRef,
  NodeDetectionResult,
  PythonDetectionResult,
  ProjectWarning,
  ProjectWarningCode,
  ProjectDetectionResult,
  ProjectDetectionOptions,
  ProjectErrorCode
} from "./types.js";

export { ProjectError } from "./types.js";

// Node project detection
export { detectNodeProjects, findNodeProjectForFile } from "./node/index.js";

// Python project detection
export { detectPythonProjects, findPythonProjectForFile } from "./python/index.js";

// Project detection orchestrator
export { detectProjects, createProjectDetector } from "./detector.js";

// File to project mapping
export { mapFilesToProjects, findProjectForFile, getAffectedProjects } from "./file-mapper.js";
export type { FileMappingResult } from "./file-mapper.js";
