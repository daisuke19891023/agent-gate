/**
 * Pyright output parser.
 *
 * Parses pyright --outputjson output into normalized diagnostics.
 */

import * as path from "node:path";
import type { DiagnosticSeverity, TypecheckDiagnostic } from "../types.js";

/**
 * Pyright JSON output structure.
 */
interface PyrightOutput {
  readonly version?: string;
  readonly time?: string;
  readonly generalDiagnostics?: readonly PyrightDiagnostic[];
  readonly summary?: {
    readonly filesAnalyzed?: number;
    readonly errorCount?: number;
    readonly warningCount?: number;
    readonly informationCount?: number;
  };
}

/**
 * Pyright diagnostic entry.
 */
interface PyrightDiagnostic {
  readonly file?: string;
  readonly severity?: number; // 1=error, 2=warning, 3=info
  readonly message?: string;
  readonly range?: {
    readonly start?: { readonly line?: number; readonly character?: number };
    readonly end?: { readonly line?: number; readonly character?: number };
  };
  readonly rule?: string;
}

/**
 * Map pyright severity number to normalized severity.
 *
 * Pyright severity: 1=error, 2=warning, 3=info
 */
function mapPyrightSeverity(severity: number | undefined): DiagnosticSeverity {
  switch (severity) {
    case 1:
      return "error";
    case 2:
      return "warning";
    case 3:
      return "info";
    default:
      return "error";
  }
}

/**
 * Normalize file path to be repo-relative with forward slashes.
 */
function normalizeFilePath(filePath: string, projectRoot: string, repoRoot: string): string {
  // Handle absolute paths
  let absolutePath: string;
  if (path.isAbsolute(filePath)) {
    absolutePath = filePath;
  } else {
    // Relative to project root
    absolutePath = path.resolve(projectRoot, filePath);
  }

  // Make repo-relative
  const repoRelative = path.relative(repoRoot, absolutePath);

  // Use forward slashes
  return repoRelative.replace(/\\/g, "/");
}

/**
 * Convert a single pyright diagnostic to normalized format.
 */
function convertDiagnostic(
  diag: PyrightDiagnostic,
  projectRoot: string,
  repoRoot: string
): TypecheckDiagnostic | null {
  if (!diag.message) {
    return null;
  }

  const file = diag.file ? normalizeFilePath(diag.file, projectRoot, repoRoot) : undefined;

  // Pyright uses 0-based line numbers, we use 1-based
  const range = diag.range
    ? {
        start: {
          line: (diag.range.start?.line ?? 0) + 1,
          column: (diag.range.start?.character ?? 0) + 1
        },
        end: {
          line: (diag.range.end?.line ?? diag.range.start?.line ?? 0) + 1,
          column: (diag.range.end?.character ?? diag.range.start?.character ?? 0) + 1
        }
      }
    : undefined;

  return {
    source: "pyright",
    severity: mapPyrightSeverity(diag.severity),
    message: diag.message,
    file,
    range,
    code: diag.rule
  };
}

/**
 * Parse pyright JSON output into normalized diagnostics.
 *
 * @param output - Raw pyright --outputjson stdout
 * @param projectRoot - Absolute path to project root
 * @param repoRoot - Absolute path to repo root
 * @returns Array of normalized diagnostics, sorted by file then line
 */
export function parsePyrightOutput(
  output: string,
  projectRoot: string,
  repoRoot: string
): readonly TypecheckDiagnostic[] {
  // Handle empty output
  if (!output.trim()) {
    return [];
  }

  let parsed: PyrightOutput;
  try {
    parsed = JSON.parse(output) as PyrightOutput;
  } catch {
    // If JSON parsing fails, return empty array
    // The caller should handle this as a parse error
    return [];
  }

  const diagnostics: TypecheckDiagnostic[] = [];

  // Process general diagnostics
  if (parsed.generalDiagnostics) {
    for (const diag of parsed.generalDiagnostics) {
      const converted = convertDiagnostic(diag, projectRoot, repoRoot);
      if (converted) {
        diagnostics.push(converted);
      }
    }
  }

  // Sort by file, then by line
  return diagnostics.sort((a, b) => {
    const fileCompare = (a.file ?? "").localeCompare(b.file ?? "");
    if (fileCompare !== 0) return fileCompare;

    const aLine = a.range?.start.line ?? 0;
    const bLine = b.range?.start.line ?? 0;
    if (aLine !== bLine) return aLine - bLine;

    const aCol = a.range?.start.column ?? 0;
    const bCol = b.range?.start.column ?? 0;
    return aCol - bCol;
  });
}

/**
 * Try to parse pyright output and return result with status.
 *
 * @returns Object with diagnostics array and parseSuccess flag
 */
export function tryParsePyrightOutput(
  output: string,
  projectRoot: string,
  repoRoot: string
): { diagnostics: readonly TypecheckDiagnostic[]; parseSuccess: boolean } {
  if (!output.trim()) {
    return { diagnostics: [], parseSuccess: true };
  }

  try {
    const parsed = JSON.parse(output) as PyrightOutput;
    const diagnostics: TypecheckDiagnostic[] = [];

    if (parsed.generalDiagnostics) {
      for (const diag of parsed.generalDiagnostics) {
        const converted = convertDiagnostic(diag, projectRoot, repoRoot);
        if (converted) {
          diagnostics.push(converted);
        }
      }
    }

    // Sort by file, then by line
    const sorted = diagnostics.sort((a, b) => {
      const fileCompare = (a.file ?? "").localeCompare(b.file ?? "");
      if (fileCompare !== 0) return fileCompare;

      const aLine = a.range?.start.line ?? 0;
      const bLine = b.range?.start.line ?? 0;
      if (aLine !== bLine) return aLine - bLine;

      const aCol = a.range?.start.column ?? 0;
      const bCol = b.range?.start.column ?? 0;
      return aCol - bCol;
    });

    return { diagnostics: sorted, parseSuccess: true };
  } catch {
    return { diagnostics: [], parseSuccess: false };
  }
}
