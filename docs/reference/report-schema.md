# Report Schema (v0)

This document defines the stable, machine-readable contracts returned by:

- `agent-gate analyze`
- `agent-gate validate`

All reports are designed to be:

- deterministic,
- actionable (via `nextActions[]` where applicable),
- easy to consume by coding agents.

---

## Common Fields

All command outputs share these base fields:

- `tool: "agent-gate"` — always this constant
- `toolVersion: string` — SemVer of the installed npm package
- `schemaVersion: number` — contract version (v0 starts at `1`)
- `command: string` — the command that generated this report
- `generatedAt: string` — ISO 8601 timestamp

---

## Versioning

- `schemaVersion` is the **contract version** for this report format.
- Backward-incompatible changes require incrementing `schemaVersion`.

We publish an accompanying JSON Schema file at `docs/reference/validation-report.schema.json`. It targets JSON Schema draft 2020-12 and includes `$schema`. (This is a tooling detail; `schemaVersion` remains the app-level contract.)

### Compatibility rules

- Backward-compatible changes **may** add optional fields and new enum values.
- Backward-incompatible changes (removing fields, changing types, or making optional fields required) **must** increment `schemaVersion`.

---

# AnalyzeReport

The `agent-gate analyze` command returns an `AnalyzeReport` that describes the repository structure.

## Top-level object: `AnalyzeReport`

### Required fields

- `tool: "agent-gate"`
- `toolVersion: string`
- `schemaVersion: number`
- `command: "analyze"`
- `generatedAt: string` — ISO 8601 timestamp
- `repo: RepoRef`
- `scope: AnalyzeScopeInfo`
- `projects: ProjectRef[]`
- `selectedProjects: ProjectRef[]`
- `warnings: string[]`
- `artifacts: Artifacts`

---

## `AnalyzeScopeInfo`

Describes the scope that was analyzed.

- `mode: "changed" | "all"`
  - The scope mode used for analysis.

- `changedFiles: ChangedFile[]`
  - Files detected as changed (when `mode: "changed"`).

- `hasChanges: boolean`
  - Whether any changes were detected.

---

## `ChangedFile`

Represents a file that has been modified.

- `path: string`
  - Repo-relative path with forward slashes.

- `changeType: "added" | "modified" | "deleted" | "renamed" | "copied" | "untracked"`
  - The type of change detected.

---

## AnalyzeReport Example

```json
{
  "tool": "agent-gate",
  "toolVersion": "0.1.0",
  "schemaVersion": 1,
  "command": "analyze",
  "generatedAt": "2026-01-01T00:00:00.000Z",
  "repo": {
    "root": "/repo",
    "id": "abc12345"
  },
  "scope": {
    "mode": "changed",
    "changedFiles": [
      { "path": "packages/a/src/index.ts", "changeType": "modified" },
      { "path": "packages/b/src/new.ts", "changeType": "added" }
    ],
    "hasChanges": true
  },
  "projects": [
    {
      "id": "node:@repo/a",
      "kind": "node",
      "name": "@repo/a",
      "root": "packages/a",
      "packageManager": "pnpm"
    },
    {
      "id": "node:@repo/b",
      "kind": "node",
      "name": "@repo/b",
      "root": "packages/b",
      "packageManager": "pnpm"
    },
    {
      "id": "python:utils",
      "kind": "python",
      "name": "utils",
      "root": "python/utils",
      "packageManager": "uv"
    }
  ],
  "selectedProjects": [
    {
      "id": "node:@repo/a",
      "kind": "node",
      "name": "@repo/a",
      "root": "packages/a",
      "packageManager": "pnpm"
    },
    {
      "id": "node:@repo/b",
      "kind": "node",
      "name": "@repo/b",
      "root": "packages/b",
      "packageManager": "pnpm"
    }
  ],
  "warnings": [],
  "artifacts": {
    "logDir": ".agent-gate/logs",
    "reportPath": ".agent-gate/reports/analyze.json"
  }
}
```

---

# ValidationReport

The `agent-gate validate` command returns a `ValidationReport`.

## Top-level object: `ValidationReport`

### Required fields

- `tool: string`
  - Always `"agent-gate"`.

- `toolVersion: string`
  - SemVer of the installed npm package.

- `schemaVersion: number`
  - Contract version for this report format. (v0 starts at `1`.)

- `command: "validate"`
  - Constant for this report type.

- `generatedAt: string`
  - ISO 8601 timestamp.

- `repo: RepoRef`
- `scope: ScopeInfo`
- `environment: EnvironmentInfo`
- `steps: StepResult[]`
- `diagnostics: Diagnostic[]`
- `summary: Summary`
- `warnings: Warning[]`
- `nextActions: NextAction[]`
- `artifacts: Artifacts`

---

## `RepoRef`

- `root: string`
  - Absolute path to repo root.

- `id: string`
  - Stable identifier for the repo (e.g., hash of root path + git metadata).

- `vcs?: { kind: "git", head?: string }`
  - Optional VCS context.

---

## `ScopeInfo`

- `mode: "changed" | "all"`
  - Default is `"changed"`.

- `changedFiles: string[]`
  - Repo-relative paths detected as changed.

- `selectedProjects: ProjectRef[]`
  - Projects actually validated (projects containing changed files).

- `potentiallyImpactedProjects: ProjectRef[]`
  - Projects not validated, but likely affected (future: "affected" mode).

- `overrides?: object`
  - Optional description of config/CLI overrides that influenced scope.

---

## `ProjectRef`

A project is a language-specific subproject (multiple per repo are supported).

- `id: string`
- `kind: "node" | "python" | "java" | "csharp" | "unknown"`
- `name?: string`
  - For Node, usually package name (`@scope/name`).

- `root: string`
  - Repo-relative directory for the subproject root.

- `packageManager?: string`
  - e.g., `pnpm | npm | yarn | uv | pip | poetry | maven | gradle | dotnet`.

- `language?: string`
  - e.g., `typescript | javascript | python`.

---

## `EnvironmentInfo`

- `runtime: RuntimeInfo`
- `fingerprints: Fingerprints`
- `toolchains?: ToolchainInfo[]`

### `RuntimeInfo`

- `provider: "docker" | "podman" | "none"`
- `networkPolicy: "default" | "deny-all" | "proxy" (future)`
- `containerImage?: string`
- `host?: { os: string, arch: string }`

### `Fingerprints`

Used to decide whether dependency acquisition can be skipped safely.

- `repoStateHash?: string`
- `nodeLockHash?: string`
- `pythonLockHash?: string`
- `configHash?: string`

---

## `StepResult`

Represents a pipeline step.

- `name: "deps" | "typecheck" | "compile" | "lspDiagnostics" | "tests"`
- `status: "ok" | "failed" | "skipped"`
- `startedAt?: string` (ISO 8601)
- `durationMs?: number`
- `command?: string`
  - Executed command line (sanitized; no secrets).

- `exitCode?: number`
- `logPath?: string`
  - Repo-relative path to step log file.

- `notes?: string[]`
  - Optional key details (e.g., “used fallback tsc --noEmit”).

---

## `Diagnostic`

Diagnostics are normalized across tools (LSP, tsc, pyright, etc).
The structure is intentionally aligned with formal static analysis formats
(e.g., SAIF/SARIF): `code` maps to a rule identifier and `file` + `range`
map to result locations.

### Required fields

- `source: string`
  - Example: `lsp:ts`, `tsc`, `pyright`, `deps:npm`, `deps:uv`.

- `severity: "error" | "warning" | "info" | "hint"`

- `message: string`

### Optional fields

- `file?: string`
  - Repo-relative path. May be omitted for global errors.

- `range?: Range`
  - Location in file, if available.

- `code?: string | number`
  - Tool-specific error code.

- `tags?: ("unnecessary" | "deprecated")[]`
  - If available from LSP-like sources.

- `related?: RelatedDiagnostic[]`
  - Supporting locations/messages.

### `Range`

All ranges use **1-based** line/column indexing for agent friendliness.

- `start: Position`
- `end: Position`
- `encoding?: "utf16" | "utf8" | "utf32" | "unknown"`
  - Default `"utf16"` when derived from LSP.

### `Position`

- `line: number` (1-based)
- `column: number` (1-based)

### Notes

When diagnostics originate from LSP, they are conceptually derived from LSP `Diagnostic` / `DiagnosticSeverity` constructs, but the report normalizes severity to strings and positions to 1-based indices.

---

## `Warning`

Warnings represent non-fatal issues that do not necessarily map to a file range.

- `kind: string`
  - Example:
    - `MISSING_TYPECHECK_SCRIPT`
    - `FALLBACK_TYPECHECK_USED`
    - `AMBIGUOUS_PROJECT_ROOT`
    - `POTENTIALLY_IMPACTED_NOT_VALIDATED`

- `message: string`
- `projectId?: string`
- `details?: object`

**Contract:** If a Node project lacks a `typecheck` script and validation uses a fallback, the report must include a warning.

---

## `NextAction`

A structured remediation suggestion.

- `kind: string`
  - Typical values:
    - `fix-lockfile`
    - `clear-cache`
    - `check-auth`
    - `rerun-prepare`
    - `enable-network`
    - `install-toolchain`
    - `add-typecheck-script`
    - `configure-typecheck`

- `message: string`
  - Human-readable explanation.

- `commands?: string[]`
  - Safe commands the user/agent can run verbatim.

- `docs?: string[]`
  - Doc references (relative links) for guidance.

**Rules:**

- `commands[]` must be safe, deterministic, and must not include secrets.
- If `deps` fails, at least one `nextActions[]` entry must be produced.

---

## `Artifacts`

- `logDir: string`
  - Repo-relative directory with logs.

- `reportPath: string`
  - Repo-relative path to the full report JSON.

- `stepLogs?: Record<string, string>`
  - Map from step name → repo-relative log path.

- `daemonLog?: string`
  - Optional daemon log path.

---

## `Summary`

- `ok: boolean`
- `errors: number`
- `warnings: number`
- `infos?: number`
- `hints?: number`
- `durationMs?: number`

**Contract:** `ok` must be `false` if any required step failed or any `diagnostics[].severity == "error"` exists.

---

## Minimal example

```json
{
  "tool": "agent-gate",
  "toolVersion": "0.1.0",
  "schemaVersion": 1,
  "command": "validate",
  "generatedAt": "2026-01-01T00:00:00.000Z",
  "repo": { "root": "/repo", "id": "repo-abc" },
  "scope": {
    "mode": "changed",
    "changedFiles": [
      "packages/a/src/index.ts"
    ],
    "selectedProjects": [
      { "id": "node:@repo/a", "kind": "node", "name": "@repo/a", "root": "packages/a", "packageManager": "pnpm" }
    ],
    "potentiallyImpactedProjects": []
  },
  "environment": {
    "runtime": { "provider": "docker", "networkPolicy": "deny-all" },
    "fingerprints": { "nodeLockHash": "..." }
  },
  "steps": [
    {
      "name": "deps",
      "status": "ok",
      "durationMs": 12000,
      "logPath": ".agent-gate/logs/deps.log"
    },
    {
      "name": "typecheck",
      "status": "failed",
      "durationMs": 3000,
      "logPath": ".agent-gate/logs/typecheck.log"
    },
    { "name": "lspDiagnostics", "status": "ok", "durationMs": 500 }
  ],
  "diagnostics": [
    {
      "source": "tsc",
      "severity": "error",
      "file": "packages/a/src/index.ts",
      "range": {
        "start": { "line": 10, "column": 5 },
        "end": { "line": 10, "column": 12 },
        "encoding": "utf16"
      },
      "message": "Cannot find name 'x'."
    }
  ],
  "summary": { "ok": false, "errors": 1, "warnings": 0, "durationMs": 15500 },
  "warnings": [],
  "nextActions": [
    {
      "kind": "configure-typecheck",
      "message": "Add a typecheck script to packages/a or configure a fallback command."
    }
  ],
  "artifacts": { "logDir": ".agent-gate/logs", "reportPath": ".agent-gate/reports/validate.json" }
}
```
