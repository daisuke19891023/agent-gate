/**
 * Node.js package manager installers.
 */

export { installWithPnpm } from "./pnpm-installer.js";
export { installWithNpm } from "./npm-installer.js";
export { installWithYarn } from "./yarn-installer.js";
export { installWithBun } from "./bun-installer.js";

import type { InstallOptions, InstallResult, NodePackageManagerType } from "../types.js";
import { installWithPnpm } from "./pnpm-installer.js";
import { installWithNpm } from "./npm-installer.js";
import { installWithYarn } from "./yarn-installer.js";
import { installWithBun } from "./bun-installer.js";

/**
 * Install dependencies using the specified Node.js package manager.
 */
export async function installNodeDependencies(
  manager: NodePackageManagerType,
  options: InstallOptions
): Promise<InstallResult> {
  switch (manager) {
    case "pnpm":
      return installWithPnpm(options);
    case "npm":
      return installWithNpm(options);
    case "yarn":
      return installWithYarn(options);
    case "bun":
      return installWithBun(options);
    default: {
      // Exhaustive check
      const _exhaustive: never = manager;
      throw new Error(`Unknown package manager: ${_exhaustive}`);
    }
  }
}
