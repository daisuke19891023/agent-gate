/**
 * Parser for pyproject.toml files.
 *
 * Uses smol-toml to parse pyproject.toml and extract project metadata.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { parse as parseToml } from "smol-toml";
import type { PythonPackageManager } from "../types.js";

/**
 * Parsed pyproject.toml structure.
 */
export interface ParsedPyproject {
  /**
   * Project name from [project].name or [tool.poetry].name.
   */
  readonly name?: string;

  /**
   * Project version.
   */
  readonly version?: string;

  /**
   * Detected package manager.
   */
  readonly packageManager: PythonPackageManager;

  /**
   * Whether the project uses uv.
   */
  readonly hasUv: boolean;

  /**
   * Whether the project uses poetry.
   */
  readonly hasPoetry: boolean;
}

/**
 * Raw pyproject.toml structure.
 */
interface PyprojectToml {
  project?: {
    name?: string;
    version?: string;
  };
  tool?: {
    poetry?: {
      name?: string;
      version?: string;
    };
    uv?: Record<string, unknown>;
  };
}

/**
 * Parse a pyproject.toml file.
 *
 * @param filePath - Path to pyproject.toml
 * @returns Parsed project info or null if not found
 */
export async function parsePyprojectToml(filePath: string): Promise<ParsedPyproject | null> {
  try {
    const content = await fs.readFile(filePath, "utf-8");
    const parsed = parseToml(content) as PyprojectToml;

    // Determine package manager
    const hasUv = parsed.tool?.uv !== undefined;
    const hasPoetry = parsed.tool?.poetry !== undefined;

    let packageManager: PythonPackageManager = "pip";
    if (hasUv) {
      packageManager = "uv";
    } else if (hasPoetry) {
      packageManager = "poetry";
    }

    // Get project name - prefer [project].name over [tool.poetry].name
    const name = parsed.project?.name ?? parsed.tool?.poetry?.name;
    const version = parsed.project?.version ?? parsed.tool?.poetry?.version;

    return {
      name,
      version,
      packageManager,
      hasUv,
      hasPoetry
    };
  } catch {
    return null;
  }
}

/**
 * Detect package manager from lockfiles in a directory.
 *
 * @param dir - Directory to check
 * @returns Detected package manager
 */
export async function detectPythonPackageManager(dir: string): Promise<PythonPackageManager> {
  // Check for uv.lock
  try {
    await fs.access(path.join(dir, "uv.lock"));
    return "uv";
  } catch {
    // Not found
  }

  // Check for poetry.lock
  try {
    await fs.access(path.join(dir, "poetry.lock"));
    return "poetry";
  } catch {
    // Not found
  }

  // Check for requirements.txt (pip)
  try {
    await fs.access(path.join(dir, "requirements.txt"));
    return "pip";
  } catch {
    // Not found
  }

  return "unknown";
}

/**
 * Check if a directory contains a Python project marker.
 *
 * Looks for pyproject.toml, setup.py, or setup.cfg.
 *
 * @param dir - Directory to check
 * @returns true if a Python project marker exists
 */
export async function hasPythonProjectMarker(dir: string): Promise<boolean> {
  const markers = ["pyproject.toml", "setup.py", "setup.cfg"];

  for (const marker of markers) {
    try {
      await fs.access(path.join(dir, marker));
      return true;
    } catch {
      // Not found
    }
  }

  return false;
}
