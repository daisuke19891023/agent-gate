/**
 * TSC output parser.
 *
 * Parses TypeScript compiler output into normalized diagnostics.
 * Handles both tsc CLI output formats.
 */

import * as path from "node:path";
import type { DiagnosticSeverity, TypecheckDiagnostic } from "../types.js";

/**
 * TSC output line format patterns.
 *
 * Format 1 (classic): file.ts(line,col): error TS1234: message
 * Format 2 (pretty): file.ts:line:col - error TS1234: message
 */
const TSC_CLASSIC_PATTERN = /^(.+?)\((\d+),(\d+)\):\s*(error|warning|info)\s+(TS\d+):\s*(.+)$/;
const TSC_PRETTY_PATTERN = /^(.+?):(\d+):(\d+)\s*-\s*(error|warning|info)\s+(TS\d+):\s*(.+)$/;

/**
 * Map tsc severity string to normalized severity.
 */
function mapSeverity(tscSeverity: string): DiagnosticSeverity {
  switch (tscSeverity.toLowerCase()) {
    case "error":
      return "error";
    case "warning":
      return "warning";
    case "info":
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
 * Parse a single line of tsc output.
 *
 * @returns Parsed diagnostic or null if line doesn't match pattern.
 */
function parseTscLine(
  line: string,
  projectRoot: string,
  repoRoot: string
): TypecheckDiagnostic | null {
  // Try classic format first
  let match = TSC_CLASSIC_PATTERN.exec(line);
  if (match) {
    const [, file, lineStr, colStr, severity, code, message] = match;
    if (file && lineStr && colStr && severity && code && message) {
      const lineNum = parseInt(lineStr, 10);
      const colNum = parseInt(colStr, 10);
      return {
        source: "tsc",
        severity: mapSeverity(severity),
        file: normalizeFilePath(file, projectRoot, repoRoot),
        range: {
          start: { line: lineNum, column: colNum },
          end: { line: lineNum, column: colNum }
        },
        code,
        message: message.trim()
      };
    }
  }

  // Try pretty format
  match = TSC_PRETTY_PATTERN.exec(line);
  if (match) {
    const [, file, lineStr, colStr, severity, code, message] = match;
    if (file && lineStr && colStr && severity && code && message) {
      const lineNum = parseInt(lineStr, 10);
      const colNum = parseInt(colStr, 10);
      return {
        source: "tsc",
        severity: mapSeverity(severity),
        file: normalizeFilePath(file, projectRoot, repoRoot),
        range: {
          start: { line: lineNum, column: colNum },
          end: { line: lineNum, column: colNum }
        },
        code,
        message: message.trim()
      };
    }
  }

  return null;
}

/**
 * Parse tsc output into normalized diagnostics.
 *
 * @param output - Raw tsc stdout/stderr output
 * @param projectRoot - Absolute path to project root
 * @param repoRoot - Absolute path to repo root
 * @returns Array of normalized diagnostics, sorted by file then line
 */
export function parseTscOutput(
  output: string,
  projectRoot: string,
  repoRoot: string
): readonly TypecheckDiagnostic[] {
  const diagnostics: TypecheckDiagnostic[] = [];
  const lines = output.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const diagnostic = parseTscLine(trimmed, projectRoot, repoRoot);
    if (diagnostic) {
      diagnostics.push(diagnostic);
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
 * Count diagnostics by severity.
 */
export function countDiagnostics(diagnostics: readonly TypecheckDiagnostic[]): {
  errors: number;
  warnings: number;
  info: number;
  hints: number;
} {
  let errors = 0;
  let warnings = 0;
  let info = 0;
  let hints = 0;

  for (const d of diagnostics) {
    switch (d.severity) {
      case "error":
        errors++;
        break;
      case "warning":
        warnings++;
        break;
      case "info":
        info++;
        break;
      case "hint":
        hints++;
        break;
    }
  }

  return { errors, warnings, info, hints };
}
