/**
 * Dependency installation module.
 *
 * Provides engines for installing dependencies across different
 * package managers (Node.js and Python), with error classification
 * and actionable remediation suggestions.
 */

// Types
export type {
  DepsErrorCode,
  DepsError,
  DepsNextAction,
  PackageManagerInfo,
  PackageManagerType,
  NodePackageManagerType,
  PythonPackageManagerType,
  InstallResult,
  InstallOptions,
  ProjectInstallResult,
  InstallAllResult
} from "./types.js";

export { DepsInstallError } from "./types.js";

// Troubleshooter
export { troubleshootInstall, getDepsNextActions } from "./install-troubleshooter.js";
export type { TroubleshootResult } from "./install-troubleshooter.js";

// Node installers
export { installWithPnpm } from "./node/pnpm-installer.js";
export { installWithNpm } from "./node/npm-installer.js";
export { installWithYarn } from "./node/yarn-installer.js";
export { installWithBun } from "./node/bun-installer.js";
export { installNodeDependencies } from "./node/index.js";

// Python installers
export { installWithUv } from "./python/uv-installer.js";
export { installWithPip } from "./python/pip-installer.js";
export { installWithPoetry } from "./python/poetry-installer.js";
export { installPythonDependencies } from "./python/index.js";

// Install engine
export { createInstallEngine } from "./install-engine.js";
export type { InstallEngine, InstallEngineOptions } from "./install-engine.js";
