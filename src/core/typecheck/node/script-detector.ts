/**
 * Script detector for Node.js typecheck.
 *
 * Detects typecheck scripts in package.json and tsconfig.json presence.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { NodePackageManager, ScriptDetectionResult } from "../types.js";

/**
 * Common typecheck script names to look for (in priority order).
 */
const TYPECHECK_SCRIPT_NAMES = ["typecheck", "type-check", "check-types", "tsc"] as const;

/**
 * Package manager lockfile to manager mapping.
 */
const LOCKFILE_TO_MANAGER: Record<string, NodePackageManager> = {
  "pnpm-lock.yaml": "pnpm",
  "package-lock.json": "npm",
  "yarn.lock": "yarn",
  "bun.lockb": "bun"
};

/**
 * Check if a file exists.
 */
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath, fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Read and parse package.json.
 */
async function readPackageJson(
  projectRoot: string
): Promise<{ scripts?: Record<string, string> } | null> {
  const packageJsonPath = path.join(projectRoot, "package.json");
  try {
    const content = await fs.readFile(packageJsonPath, "utf-8");
    return JSON.parse(content) as { scripts?: Record<string, string> };
  } catch {
    return null;
  }
}

/**
 * Detect the package manager based on lockfiles.
 * Searches from projectRoot up to repoRoot.
 */
async function detectPackageManager(
  projectRoot: string,
  repoRoot?: string
): Promise<NodePackageManager> {
  let currentDir = projectRoot;
  const stopAt = repoRoot ?? path.parse(projectRoot).root;

  while (true) {
    for (const [lockfile, manager] of Object.entries(LOCKFILE_TO_MANAGER)) {
      if (await fileExists(path.join(currentDir, lockfile))) {
        return manager;
      }
    }

    // Check if we've reached the stop point
    if (currentDir === stopAt || currentDir === path.parse(currentDir).root) {
      break;
    }

    currentDir = path.dirname(currentDir);
  }

  return "unknown";
}

/**
 * Detect typecheck script and tsconfig presence.
 *
 * @param projectRoot - Absolute path to the project root
 * @param scriptNameOverride - Optional script name to look for (from config)
 * @param repoRoot - Optional repo root for lockfile detection
 * @returns Detection result with script info and tsconfig presence
 */
export async function detectTypecheckScript(
  projectRoot: string,
  scriptNameOverride?: string,
  repoRoot?: string
): Promise<ScriptDetectionResult> {
  // Read package.json
  const packageJson = await readPackageJson(projectRoot);
  const scripts = packageJson?.scripts ?? {};

  // Check for tsconfig.json
  const hasTsconfig = await fileExists(path.join(projectRoot, "tsconfig.json"));

  // Detect package manager
  const packageManager = await detectPackageManager(projectRoot, repoRoot);

  // If override is specified, check only that
  if (scriptNameOverride) {
    const hasScript = scriptNameOverride in scripts;
    return {
      hasTypecheckScript: hasScript,
      scriptName: hasScript ? scriptNameOverride : null,
      hasTsconfig,
      packageManager
    };
  }

  // Check common script names in priority order
  for (const name of TYPECHECK_SCRIPT_NAMES) {
    if (name in scripts) {
      return {
        hasTypecheckScript: true,
        scriptName: name,
        hasTsconfig,
        packageManager
      };
    }
  }

  // No typecheck script found
  return {
    hasTypecheckScript: false,
    scriptName: null,
    hasTsconfig,
    packageManager
  };
}

/**
 * Build the command to run a typecheck script.
 *
 * @param scriptName - The npm script name
 * @param packageManager - The package manager to use
 * @returns Command array [binary, ...args]
 */
export function buildScriptCommand(
  scriptName: string,
  packageManager: NodePackageManager
): readonly string[] {
  switch (packageManager) {
    case "pnpm":
      return ["pnpm", "run", scriptName];
    case "yarn":
      return ["yarn", "run", scriptName];
    case "bun":
      return ["bun", "run", scriptName];
    case "npm":
    case "unknown":
    default:
      return ["npm", "run", scriptName];
  }
}

/**
 * Build the fallback tsc command.
 *
 * @param packageManager - The package manager (for npx equivalent)
 * @param customCommand - Optional custom fallback command from config
 * @returns Command array [binary, ...args]
 */
export function buildTscFallbackCommand(
  packageManager: NodePackageManager,
  customCommand?: string
): readonly string[] {
  // If custom command is provided, split it
  if (customCommand) {
    return customCommand.split(/\s+/);
  }

  // Default: use npx tsc --noEmit
  switch (packageManager) {
    case "pnpm":
      return ["pnpm", "exec", "tsc", "--noEmit"];
    case "yarn":
      return ["yarn", "exec", "tsc", "--noEmit"];
    case "bun":
      return ["bun", "x", "tsc", "--noEmit"];
    case "npm":
    case "unknown":
    default:
      return ["npx", "tsc", "--noEmit"];
  }
}
