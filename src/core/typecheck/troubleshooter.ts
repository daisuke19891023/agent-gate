/**
 * Typecheck Troubleshooter - Error classification and nextActions generation.
 *
 * Classifies typecheck failures and provides safe,
 * actionable remediation suggestions.
 */

import type { TypecheckError, TypecheckErrorCode, TypecheckNextAction } from "./types.js";

/**
 * Error pattern definition for classification.
 */
interface ErrorPattern {
  readonly code: TypecheckErrorCode;
  readonly patterns: readonly RegExp[];
  readonly priority: number;
}

/**
 * Node.js typecheck error patterns.
 * Ordered by priority (higher = matched first).
 */
const NODE_TYPECHECK_PATTERNS: readonly ErrorPattern[] = [
  // TSC_NOT_FOUND - highest priority
  {
    code: "TSC_NOT_FOUND",
    priority: 110,
    patterns: [
      /tsc.*not found/i,
      /Cannot find module.*typescript/i,
      /ENOENT.*tsc/i,
      /command not found.*tsc/i,
      /typescript.*is not recognized/i,
      /npx.*tsc.*not found/i
    ]
  },
  // TSCONFIG_MISSING
  {
    code: "TSCONFIG_MISSING",
    priority: 100,
    patterns: [
      /Cannot find.*tsconfig\.json/i,
      /no input files/i,
      /tsconfig\.json.*not found/i,
      /error TS18003:/i, // No inputs were found
      /Could not find a tsconfig\.json/i
    ]
  },
  // TYPECHECK_SCRIPT_MISSING - for npm script execution
  {
    code: "TYPECHECK_SCRIPT_MISSING",
    priority: 90,
    patterns: [
      /Missing script.*typecheck/i,
      /npm ERR! Missing script/i,
      /Script.*not found/i,
      /No script.*typecheck/i,
      /ERR_PNPM_NO_SCRIPT/i,
      /error Command.*not found/i // yarn
    ]
  },
  // TYPECHECK_FAILED - any tsc errors
  {
    code: "TYPECHECK_FAILED",
    priority: 50,
    patterns: [/error TS\d+:/i, /Found \d+ error/i, /tsc.*exited with code/i]
  }
];

/**
 * Python typecheck error patterns.
 */
const PYTHON_TYPECHECK_PATTERNS: readonly ErrorPattern[] = [
  // PYRIGHTCONFIG_MISSING - check first before PYRIGHT_NOT_FOUND
  // because the pattern might otherwise match "pyright.*not found"
  {
    code: "PYRIGHTCONFIG_MISSING",
    priority: 120,
    patterns: [/pyrightconfig\.json.*not found/i, /No pyright config/i]
  },
  // PYRIGHT_NOT_FOUND - high priority but lower than config missing
  {
    code: "PYRIGHT_NOT_FOUND",
    priority: 110,
    patterns: [
      /^pyright:.*not found/im,
      /ENOENT.*\bpyright\b/i,
      /command not found.*\bpyright\b/i,
      /No module named pyright/i,
      /\bpyright\b.*is not recognized/i,
      /Cannot find module ['"]?pyright['"]?(?!config)/i
    ]
  },
  // TYPECHECK_FAILED - any pyright errors
  {
    code: "TYPECHECK_FAILED",
    priority: 50,
    patterns: [/"severity":\s*1/i, /pyright.*found \d+ error/i, /"errorCount":\s*[1-9]/i]
  }
];

/**
 * Result of error classification.
 */
export interface TroubleshootResult {
  readonly code: TypecheckErrorCode;
  readonly message: string;
  readonly nextActions: readonly TypecheckNextAction[];
}

/**
 * Classify a typecheck failure and generate nextActions.
 *
 * @param kind - The project kind (node or python)
 * @param exitCode - The exit code from the command
 * @param stderr - Standard error output
 * @param stdout - Standard output
 * @param timedOut - Whether the command timed out
 */
export function troubleshootTypecheck(
  kind: "node" | "python",
  exitCode: number | null,
  stderr: string,
  stdout: string,
  timedOut = false
): TroubleshootResult {
  // Handle timeout first
  if (timedOut) {
    return {
      code: "TIMEOUT",
      message: "Typecheck timed out.",
      nextActions: getNextActionsForCode("TIMEOUT", kind)
    };
  }

  // If exit code is 0, this shouldn't be called, but handle gracefully
  if (exitCode === 0) {
    return {
      code: "UNKNOWN",
      message: "No error detected.",
      nextActions: []
    };
  }

  // Combine stderr and stdout for pattern matching
  const combinedOutput = `${stderr}\n${stdout}`;

  // Select patterns based on kind
  const patterns = kind === "node" ? NODE_TYPECHECK_PATTERNS : PYTHON_TYPECHECK_PATTERNS;

  // Sort patterns by priority (descending)
  const sortedPatterns = [...patterns].sort((a, b) => b.priority - a.priority);

  // Find matching pattern
  for (const pattern of sortedPatterns) {
    for (const regex of pattern.patterns) {
      if (regex.test(combinedOutput)) {
        return {
          code: pattern.code,
          message: getMessageForCode(pattern.code, kind),
          nextActions: getNextActionsForCode(pattern.code, kind)
        };
      }
    }
  }

  // No pattern matched - return UNKNOWN
  return {
    code: "UNKNOWN",
    message: `Unclassified typecheck error (exit code: ${exitCode ?? "null"}).`,
    nextActions: getNextActionsForCode("UNKNOWN", kind)
  };
}

/**
 * Get nextActions for a given error.
 */
export function getTypecheckNextActions(error: TypecheckError): readonly TypecheckNextAction[] {
  // Determine kind from error code
  const kind: "node" | "python" =
    error.code === "PYRIGHT_NOT_FOUND" || error.code === "PYRIGHTCONFIG_MISSING"
      ? "python"
      : "node";
  return getNextActionsForCode(error.code, kind);
}

/**
 * Get nextActions for a specific error code and kind.
 */
function getNextActionsForCode(
  code: TypecheckErrorCode,
  kind: "node" | "python"
): readonly TypecheckNextAction[] {
  switch (code) {
    case "TYPECHECK_SCRIPT_MISSING":
      return [
        {
          kind: "add-typecheck-script",
          message: "Add a typecheck script to package.json.",
          commands: ['npm pkg set scripts.typecheck="tsc --noEmit"'],
          docs: ["docs/user-manual/troubleshooting.md#typecheck-script-missing"]
        }
      ];

    case "TSC_NOT_FOUND":
      return [
        {
          kind: "install-typescript",
          message: "TypeScript is not installed. Install it as a dev dependency.",
          commands: [
            "npm install -D typescript",
            "pnpm add -D typescript",
            "yarn add -D typescript"
          ],
          docs: ["docs/user-manual/troubleshooting.md#tsc-not-found"]
        }
      ];

    case "PYRIGHT_NOT_FOUND":
      return [
        {
          kind: "install-pyright",
          message: "Pyright is not installed. Install it to enable Python type checking.",
          commands: ["pip install pyright", "uv pip install pyright", "npm install -g pyright"],
          docs: ["docs/user-manual/troubleshooting.md#pyright-not-found"]
        }
      ];

    case "TSCONFIG_MISSING":
      return [
        {
          kind: "create-tsconfig",
          message: "No tsconfig.json found. Create one to configure TypeScript.",
          commands: ["npx tsc --init"],
          docs: ["docs/user-manual/troubleshooting.md#tsconfig-missing"]
        }
      ];

    case "PYRIGHTCONFIG_MISSING":
      return [
        {
          kind: "create-pyrightconfig",
          message:
            "No pyrightconfig.json found. Consider creating one for project-specific settings.",
          docs: ["docs/user-manual/troubleshooting.md#pyrightconfig-missing"]
        }
      ];

    case "TYPECHECK_FAILED":
      return [
        {
          kind: "fix-type-errors",
          message: "Fix the type errors shown in diagnostics.",
          docs: ["docs/user-manual/troubleshooting.md#typecheck-failed"]
        }
      ];

    case "PARSE_ERROR":
      return [
        {
          kind: "check-output",
          message: "Failed to parse typecheck output. Check the command output format.",
          docs: ["docs/user-manual/troubleshooting.md#parse-error"]
        }
      ];

    case "TIMEOUT":
      return [
        {
          kind: "increase-timeout",
          message:
            "Typecheck timed out. Consider increasing the timeout or checking for infinite loops.",
          docs: ["docs/user-manual/troubleshooting.md#timeout"]
        }
      ];

    case "UNKNOWN":
    default:
      if (kind === "python") {
        return [
          {
            kind: "check-logs",
            message: "Unclassified Python typecheck error. Check logs for details.",
            docs: ["docs/user-manual/troubleshooting.md"]
          }
        ];
      }
      return [
        {
          kind: "check-logs",
          message: "Unclassified typecheck error. Check logs for details.",
          docs: ["docs/user-manual/troubleshooting.md"]
        }
      ];
  }
}

/**
 * Get a human-readable message for an error code.
 */
function getMessageForCode(code: TypecheckErrorCode, kind: "node" | "python"): string {
  switch (code) {
    case "TYPECHECK_SCRIPT_MISSING":
      return "No typecheck script found in package.json.";
    case "TSC_NOT_FOUND":
      return "TypeScript compiler (tsc) is not installed.";
    case "PYRIGHT_NOT_FOUND":
      return "Pyright is not installed.";
    case "TSCONFIG_MISSING":
      return "No tsconfig.json found in project.";
    case "PYRIGHTCONFIG_MISSING":
      return "No pyrightconfig.json found (optional).";
    case "TYPECHECK_FAILED":
      return kind === "python" ? "Pyright found type errors." : "TypeScript found type errors.";
    case "PARSE_ERROR":
      return "Failed to parse typecheck output.";
    case "TIMEOUT":
      return "Typecheck timed out.";
    case "UNKNOWN":
    default:
      return "Unclassified typecheck error.";
  }
}
