/**
 * Typecheck module - public API.
 *
 * Provides typecheck functionality for Node.js and Python projects.
 */

// Types
export type {
  TypecheckErrorCode,
  DiagnosticSeverity,
  Position,
  Range,
  RelatedDiagnostic,
  TypecheckDiagnostic,
  TypecheckError,
  TypecheckNextAction,
  ProjectTypecheckResult,
  TypecheckAllResult,
  TypecheckOptions,
  NodePackageManager,
  ScriptDetectionResult
} from "./types.js";

export { TypecheckFailure } from "./types.js";

// Troubleshooter
export { troubleshootTypecheck, getTypecheckNextActions } from "./troubleshooter.js";
export type { TroubleshootResult } from "./troubleshooter.js";

// Engine
export { createTypecheckEngine, countDiagnosticsBySeverity } from "./typecheck-engine.js";
export type { TypecheckEngine, TypecheckEngineOptions } from "./typecheck-engine.js";

// Node
export { typecheckNodeProject } from "./node/index.js";
export type { NodeTypecheckOptions } from "./node/index.js";

// Python
export { typecheckPythonProject } from "./python/index.js";
export type { PythonTypecheckOptions } from "./python/index.js";
