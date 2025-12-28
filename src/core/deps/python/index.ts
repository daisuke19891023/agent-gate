/**
 * Python package manager installers.
 */

export { installWithUv } from "./uv-installer.js";
export { installWithPip } from "./pip-installer.js";
export { installWithPoetry } from "./poetry-installer.js";

import type { InstallOptions, InstallResult, PythonPackageManagerType } from "../types.js";
import { installWithUv } from "./uv-installer.js";
import { installWithPip } from "./pip-installer.js";
import { installWithPoetry } from "./poetry-installer.js";

/**
 * Install dependencies using the specified Python package manager.
 */
export async function installPythonDependencies(
  manager: PythonPackageManagerType,
  options: InstallOptions
): Promise<InstallResult> {
  switch (manager) {
    case "uv":
      return installWithUv(options);
    case "pip":
      return installWithPip(options);
    case "poetry":
      return installWithPoetry(options);
    default: {
      // Exhaustive check
      const _exhaustive: never = manager;
      throw new Error(`Unknown package manager: ${_exhaustive}`);
    }
  }
}
