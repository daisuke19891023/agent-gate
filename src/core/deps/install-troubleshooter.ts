/**
 * InstallTroubleshooter - Error classification and nextActions generation.
 *
 * Classifies dependency installation failures and provides safe,
 * actionable remediation suggestions.
 */

import type { DepsError, DepsErrorCode, DepsNextAction, PackageManagerType } from "./types.js";

/**
 * Error pattern definition for classification.
 */
interface ErrorPattern {
  readonly code: DepsErrorCode;
  readonly patterns: readonly RegExp[];
  readonly priority: number;
}

/**
 * Node.js package manager error patterns.
 * Ordered by priority (higher = matched first).
 */
const NODE_ERROR_PATTERNS: readonly ErrorPattern[] = [
  // TOOLCHAIN_MISSING - highest priority
  {
    code: "TOOLCHAIN_MISSING",
    priority: 110,
    patterns: [/command not found/i, /ENOENT.*(npm|pnpm|yarn|bun)/i, /is not recognized as/i]
  },
  // LOCKFILE_DRIFT patterns
  {
    code: "LOCKFILE_DRIFT",
    priority: 100,
    patterns: [
      /npm ERR! `npm ci` can only install packages when your package-lock\.json/i,
      /npm ERR! Your lockfile needs to be updated/i,
      /npm ERR!.*package-lock\.json.*out of sync/i,
      /error Your lockfile needs to be updated/i,
      /ERR_PNPM_OUTDATED_LOCKFILE/i,
      /ERR_PNPM_LOCKFILE_BREAKING_CHANGE/i,
      /ERR_PNPM_LOCKFILE_MISSING_DEPENDENCY/i,
      /Lockfile is out of sync/i,
      /Cannot install with "frozen-lockfile"/i,
      /error: The lockfile is up to date but/i
    ]
  },
  // AUTH_REQUIRED patterns
  {
    code: "AUTH_REQUIRED",
    priority: 90,
    patterns: [
      /npm ERR! 401 Unauthorized/i,
      /npm ERR! 403 Forbidden/i,
      /error An unexpected error occurred:.*401/i,
      /error An unexpected error occurred:.*403/i,
      /E401/i,
      /E403/i,
      /EAUTHUNKNOWN/i,
      /code ENEEDAUTH/i,
      /authentication required/i,
      /Invalid credentials/i,
      /Unable to authenticate/i
    ]
  },
  // NETWORK_BLOCKED patterns
  {
    code: "NETWORK_BLOCKED",
    priority: 80,
    patterns: [
      /ENOTFOUND/i,
      /ECONNREFUSED/i,
      /ETIMEDOUT/i,
      /ECONNRESET/i,
      /ENETUNREACH/i,
      /getaddrinfo.*failed/i,
      /network.*unreachable/i,
      /Request failed "ETIMEDOUT"/i,
      /EAI_AGAIN/i,
      /EHOSTUNREACH/i,
      /ENETDOWN/i,
      /socket hang up/i
    ]
  },
  // CACHE_CORRUPTION patterns
  {
    code: "CACHE_CORRUPTION",
    priority: 70,
    patterns: [
      /EINTEGRITY/i,
      /Integrity checksum failed/i,
      /cacache.*error/i,
      /ERR_PNPM_UNEXPECTED_STORE/i,
      /corrupted.*cache/i,
      /cache.*corrupted/i,
      /Verification failed/i,
      /Invalid package/i
    ]
  },
  // PACKAGE_NOT_FOUND patterns
  {
    code: "PACKAGE_NOT_FOUND",
    priority: 60,
    patterns: [
      /npm ERR! 404 Not Found/i,
      /error Couldn't find package/i,
      /ERR_PNPM_NO_MATCHING_VERSION/i,
      /No matching version found/i,
      /Package.*not found/i,
      /E404/i,
      /404 Not Found.*GET/i
    ]
  },
  // DISK_FULL patterns
  {
    code: "DISK_FULL",
    priority: 50,
    patterns: [/ENOSPC/i, /No space left on device/i, /disk quota exceeded/i]
  },
  // PERMISSION_DENIED patterns
  {
    code: "PERMISSION_DENIED",
    priority: 40,
    patterns: [/EACCES/i, /permission denied/i, /EPERM/i, /access denied/i]
  }
];

/**
 * Python package manager error patterns.
 */
const PYTHON_ERROR_PATTERNS: readonly ErrorPattern[] = [
  // TOOLCHAIN_MISSING - highest priority
  {
    code: "TOOLCHAIN_MISSING",
    priority: 110,
    patterns: [
      /command not found.*pip/i,
      /command not found.*uv/i,
      /command not found.*poetry/i,
      /pip.*not found/i,
      /uv.*not found/i,
      /poetry.*not found/i,
      /No module named pip/i,
      /Python.*not found/i,
      /ENOENT.*python/i
    ]
  },
  // AUTH_REQUIRED for Python
  {
    code: "AUTH_REQUIRED",
    priority: 90,
    patterns: [
      /401 Unauthorized/i,
      /403 Forbidden/i,
      /Invalid credentials/i,
      /authentication required/i,
      /HTTP error 401/i,
      /HTTP error 403/i
    ]
  },
  // NETWORK_BLOCKED for Python
  {
    code: "NETWORK_BLOCKED",
    priority: 80,
    patterns: [
      /Could not fetch URL/i,
      /Connection refused/i,
      /Name or service not known/i,
      /Network is unreachable/i,
      /error: Failed to download/i,
      /HTTPSConnectionPool.*Max retries exceeded/i,
      /NewConnectionError/i,
      /ConnectTimeoutError/i,
      /ConnectionError/i,
      /Temporary failure in name resolution/i
    ]
  },
  // CACHE_CORRUPTION for Python
  {
    code: "CACHE_CORRUPTION",
    priority: 70,
    patterns: [
      /Hash mismatch/i,
      /Hashes are required/i,
      /cache.*corrupt/i,
      /Invalid cache/i,
      /Inconsistent cache/i,
      /digest mismatch/i
    ]
  },
  // PACKAGE_NOT_FOUND for Python
  {
    code: "PACKAGE_NOT_FOUND",
    priority: 60,
    patterns: [
      /No matching distribution found/i,
      /Could not find a version/i,
      /error: Package.*not found/i,
      /PackageNotFoundError/i,
      /ResolutionImpossible/i,
      /Could not find.*versions/i
    ]
  },
  // DISK_FULL for Python
  {
    code: "DISK_FULL",
    priority: 50,
    patterns: [/No space left on device/i, /OSError.*No space/i, /disk quota exceeded/i]
  },
  // PERMISSION_DENIED for Python
  {
    code: "PERMISSION_DENIED",
    priority: 40,
    patterns: [/Permission denied/i, /PermissionError/i, /EPERM/i, /Access denied/i]
  }
];

/**
 * Result of error classification.
 */
export interface TroubleshootResult {
  readonly code: DepsErrorCode;
  readonly message: string;
  readonly nextActions: readonly DepsNextAction[];
}

/**
 * Classify an installation failure and generate nextActions.
 *
 * @param manager - The package manager that was used
 * @param exitCode - The exit code from the command
 * @param stderr - Standard error output
 * @param stdout - Standard output
 * @param timedOut - Whether the command timed out
 */
export function troubleshootInstall(
  manager: PackageManagerType,
  exitCode: number | null,
  stderr: string,
  stdout: string,
  timedOut = false
): TroubleshootResult {
  // Handle timeout first
  if (timedOut) {
    return {
      code: "TIMEOUT",
      message: "Installation timed out.",
      nextActions: getNextActionsForCode("TIMEOUT", manager)
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

  // Select patterns based on manager type
  const isNode = isNodePackageManager(manager);
  const patterns = isNode ? NODE_ERROR_PATTERNS : PYTHON_ERROR_PATTERNS;

  // Sort patterns by priority (descending)
  const sortedPatterns = [...patterns].sort((a, b) => b.priority - a.priority);

  // Find matching pattern
  for (const pattern of sortedPatterns) {
    for (const regex of pattern.patterns) {
      if (regex.test(combinedOutput)) {
        return {
          code: pattern.code,
          message: getMessageForCode(pattern.code, manager),
          nextActions: getNextActionsForCode(pattern.code, manager)
        };
      }
    }
  }

  // No pattern matched - return UNKNOWN
  return {
    code: "UNKNOWN",
    message: `Unclassified error (exit code: ${exitCode ?? "null"}).`,
    nextActions: getNextActionsForCode("UNKNOWN", manager)
  };
}

/**
 * Get nextActions for a given error.
 */
export function getDepsNextActions(error: DepsError): readonly DepsNextAction[] {
  return getNextActionsForCode(error.code, "unknown");
}

/**
 * Get nextActions for a specific error code and manager.
 */
function getNextActionsForCode(
  code: DepsErrorCode,
  manager: PackageManagerType
): readonly DepsNextAction[] {
  switch (code) {
    case "LOCKFILE_DRIFT":
      return [
        {
          kind: "update-lockfile",
          message: "Lockfile is out of sync with manifest. Regenerate it locally.",
          commands: getLockfileUpdateCommands(manager),
          docs: ["docs/user-manual/troubleshooting.md#lockfile-drift"]
        }
      ];

    case "AUTH_REQUIRED":
      // Never emit credentials or auth commands for security
      return [
        {
          kind: "configure-auth",
          message: "Registry authentication is required. Configure credentials.",
          docs: ["docs/user-manual/troubleshooting.md#auth-required"]
        }
      ];

    case "NETWORK_BLOCKED":
      return [
        {
          kind: "run-prepare",
          message: "Network access is blocked. Run prepare with network enabled.",
          commands: ["agent-gate prepare"],
          docs: ["docs/user-manual/troubleshooting.md#network-blocked"]
        },
        {
          kind: "check-network",
          message: "Verify network connectivity to package registries.",
          docs: ["docs/user-manual/troubleshooting.md#network-blocked"]
        }
      ];

    case "CACHE_CORRUPTION":
      return [
        {
          kind: "clear-cache",
          message: "Package cache may be corrupted. Clear it and retry.",
          commands: getCacheClearCommands(manager),
          docs: ["docs/user-manual/troubleshooting.md#cache-corruption"]
        }
      ];

    case "TOOLCHAIN_MISSING":
      return [
        {
          kind: "install-toolchain",
          message: `Package manager '${manager}' is not installed or not in PATH.`,
          commands: getToolchainInstallHints(manager),
          docs: ["docs/user-manual/troubleshooting.md#toolchain-missing"]
        }
      ];

    case "PACKAGE_NOT_FOUND":
      return [
        {
          kind: "check-package",
          message: "One or more packages were not found. Check package names and versions.",
          docs: ["docs/user-manual/troubleshooting.md#package-not-found"]
        }
      ];

    case "DISK_FULL":
      return [
        {
          kind: "free-disk-space",
          message: "Disk is full. Free up space and retry.",
          docs: ["docs/user-manual/troubleshooting.md#disk-full"]
        }
      ];

    case "PERMISSION_DENIED":
      return [
        {
          kind: "check-permissions",
          message: "Permission denied. Check file system permissions.",
          docs: ["docs/user-manual/troubleshooting.md#permission-denied"]
        }
      ];

    case "TIMEOUT":
      return [
        {
          kind: "increase-timeout",
          message: "Installation timed out. Increase timeout or check network.",
          docs: ["docs/user-manual/troubleshooting.md#timeout"]
        }
      ];

    case "UNKNOWN":
    default:
      return [
        {
          kind: "check-logs",
          message: "Unclassified error. Check logs for details.",
          docs: ["docs/user-manual/troubleshooting.md"]
        }
      ];
  }
}

/**
 * Get a human-readable message for an error code.
 */
function getMessageForCode(code: DepsErrorCode, manager: PackageManagerType): string {
  switch (code) {
    case "LOCKFILE_DRIFT":
      return "Lockfile is out of sync with package manifest.";
    case "AUTH_REQUIRED":
      return "Registry authentication is required.";
    case "NETWORK_BLOCKED":
      return "Network connection failed or is blocked.";
    case "CACHE_CORRUPTION":
      return "Package cache is corrupted.";
    case "TOOLCHAIN_MISSING":
      return `Package manager '${manager}' is not installed.`;
    case "PACKAGE_NOT_FOUND":
      return "One or more packages were not found.";
    case "DISK_FULL":
      return "Disk is full.";
    case "PERMISSION_DENIED":
      return "Permission denied.";
    case "TIMEOUT":
      return "Installation timed out.";
    case "UNKNOWN":
    default:
      return "Unclassified installation error.";
  }
}

/**
 * Get commands to update lockfile for a given manager.
 */
function getLockfileUpdateCommands(manager: PackageManagerType): readonly string[] {
  switch (manager) {
    case "pnpm":
      return ["pnpm install"];
    case "npm":
      return ["npm install"];
    case "yarn":
      return ["yarn install"];
    case "bun":
      return ["bun install"];
    case "uv":
      return ["uv lock"];
    case "pip":
      return ["pip freeze > requirements.txt"];
    case "poetry":
      return ["poetry lock"];
    default:
      return [];
  }
}

/**
 * Get commands to clear cache for a given manager.
 */
function getCacheClearCommands(manager: PackageManagerType): readonly string[] {
  switch (manager) {
    case "pnpm":
      return ["pnpm store prune"];
    case "npm":
      return ["npm cache clean --force"];
    case "yarn":
      return ["yarn cache clean"];
    case "bun":
      return ["bun pm cache rm"];
    case "uv":
      return ["uv cache clean"];
    case "pip":
      return ["pip cache purge"];
    case "poetry":
      return ["poetry cache clear --all pypi"];
    default:
      return [];
  }
}

/**
 * Get hints for installing a package manager.
 */
function getToolchainInstallHints(manager: PackageManagerType): readonly string[] {
  switch (manager) {
    case "pnpm":
      return ["npm install -g pnpm"];
    case "yarn":
      return ["npm install -g yarn"];
    case "bun":
      return ["curl -fsSL https://bun.sh/install | bash"];
    case "uv":
      return ["pip install uv", "curl -LsSf https://astral.sh/uv/install.sh | sh"];
    case "poetry":
      return ["pip install poetry", "curl -sSL https://install.python-poetry.org | python3 -"];
    case "npm":
      return ["Install Node.js from https://nodejs.org/"];
    case "pip":
      return ["Ensure Python is installed with pip"];
    default:
      return [];
  }
}

/**
 * Check if a manager is a Node.js package manager.
 */
function isNodePackageManager(manager: PackageManagerType): boolean {
  return manager === "npm" || manager === "pnpm" || manager === "yarn" || manager === "bun";
}
