# CLI Reference (v0)

This document describes the **public CLI contract** for `agent-gate`.
The CLI is designed for **automation** (agent skills, CI, scripts). It is intentionally **low freedom**.

## Stability guarantees

- The CLI will remain backward compatible within the same **Major** version of the npm package.
- `agent-gate validate` JSON output is versioned by `schemaVersion` (see report schema).
- Command names, exit codes, and required JSON fields are stable contracts.

## Conventions

### Machine-readable output

- **STDOUT is always JSON** (even on failures).
- Human-readable details go into log files; the JSON includes paths to artifacts.

### Error output

Failures still return JSON with:

- `status: "error"` (or `"internal_error"` for unexpected failures)
- `error.type` (classified category)
- `error.message`
- `nextActions[]` with safe, actionable remediation steps

### Paths and ordering

- File paths in JSON are **repo-relative** with forward slashes (`/`).
- Arrays with file-like entries are emitted in stable order (lexicographic by path, then by position).

---

## Synopsis

```bash
agent-gate <command> [options]
```

### Commands

- `analyze` — detect repository structure (projects, package managers, toolchains).
- `prepare` — acquire dependencies (required), prime caches, and ensure toolchains are ready.
- `validate` — **required gate**: deps + compile/typecheck + LSP diagnostics (tests optional and off by default).
- `daemon` — operational commands (status/stop) for troubleshooting.


---

## Global options

> Keep usage low-freedom: prefer config file defaults. Use flags mainly for debugging or CI.

- `--repo <path>`
  - Repository root. Defaults to current working directory, then auto-detected git root.

- `--config <path>`
  - Path to config file. If omitted, tool searches in repo and user config locations.

- `--scope <mode>`
  - Controls what is validated.
  - Allowed:
    - `changed` (default): uncommitted changes = working tree + staged
    - `all`: validate all detected projects

  - More complex scopes must be expressed via config (future: `affected`, `explicit projects`, etc).

- `--pretty`
  - Pretty-print JSON output. Default is compact JSON.

- `--log-level <level>`
  - `error | warn | info | debug`. Default: `info`.

---

## Exit codes

Exit codes are stable:

- `0` — Success (all required steps succeeded; validation passed).
- `1` — Validation failed (deps/typecheck/compile/diagnostics contain errors).
- `2` — User/config error (invalid args, invalid config, unsupported repo layout).
- `3` — Infrastructure error (missing docker/podman/git, container runtime not reachable).
- `4` — Internal error (bug). JSON output still produced with `status: "internal_error"`.

---

## `agent-gate analyze`

Detects:

- monorepo projects (multiple subprojects supported),
- language packs (v0: TS/JS + Python),
- package managers,
- candidate commands (typecheck scripts, etc).

### Scope resolution

When `--scope changed` (default), the command:

1. Detects uncommitted changes (working tree + staged) via `git diff`
2. Maps changed files to their containing projects
3. Reports `selectedProjects` (projects with changes)

### Output (AnalyzeReport)

The output includes:

- `tool`, `toolVersion`, `schemaVersion`, `command`, `generatedAt`
- `repo.root`, `repo.id`
- `scope.mode` — `"changed"` or `"all"`
- `scope.changedFiles[]` — array of `{ path, changeType }` objects
- `scope.hasChanges` — boolean indicating if changes were detected
- `projects[]` — all detected subprojects
- `selectedProjects[]` — projects containing changed files
- `warnings[]` — e.g., ambiguous project boundaries, unmapped files
- `artifacts.logDir`, `artifacts.reportPath`

### Project detection

**Node/TypeScript projects** are detected using:

- `package.json` files
- Workspace configuration (`pnpm-workspace.yaml`, `package.json` workspaces)
- Package manager detection from lockfiles (`pnpm-lock.yaml`, `package-lock.json`, `yarn.lock`)

**Python projects** are detected using:

- `pyproject.toml` files
- Package manager detection (`uv.lock`, `poetry.lock`, `[tool.uv]`, `[tool.poetry]`)

### Project ID format

- Node: `node:<package-name>` or `node:<relative-path>` if no name
- Python: `python:<project-name>` or `python:<relative-path>` if no name

### Example

```bash
agent-gate analyze --pretty
```

### Example output

```json
{
  "tool": "agent-gate",
  "toolVersion": "0.1.0",
  "schemaVersion": 1,
  "command": "analyze",
  "generatedAt": "2026-01-01T00:00:00.000Z",
  "repo": { "root": "/repo", "id": "abc12345" },
  "scope": {
    "mode": "changed",
    "changedFiles": [
      { "path": "packages/a/src/index.ts", "changeType": "modified" }
    ],
    "hasChanges": true
  },
  "projects": [
    { "id": "node:@repo/a", "kind": "node", "name": "@repo/a", "root": "packages/a", "packageManager": "pnpm" }
  ],
  "selectedProjects": [
    { "id": "node:@repo/a", "kind": "node", "name": "@repo/a", "root": "packages/a", "packageManager": "pnpm" }
  ],
  "warnings": [],
  "artifacts": { "logDir": ".agent-gate/logs", "reportPath": ".agent-gate/reports/analyze.json" }
}
```

---

## `agent-gate prepare`

Prepares the repo for validation:

- **Dependency acquisition is required** (JS/TS and Python).
- Produces actionable guidance for common failure cases (lockfile drift, auth, cache corruption, network constraints).

### Networking

`prepare` may use networking by default to fetch dependencies.

### Output (PrepareResult)

Includes:

- `steps[]` with at least `deps` step
- `nextActions[]` for remediation suggestions
- `artifacts.*`

### Example

```bash
agent-gate prepare
```

---

## `agent-gate validate`

Runs the required quality gate:

1. `deps` (required)
2. `typecheck` / `compile` (required)
3. `lspDiagnostics` (required)
4. `tests` (optional; off by default)

### Scope resolution

When `--scope changed` (default):

1. Detects uncommitted changes (working tree + staged) via `git diff`
2. Maps changed files to their containing projects
3. Validates only `selectedProjects` (projects with changes)
4. Reports `potentiallyImpactedProjects` (future: dependency-aware impact analysis)

The `scope` section of the output includes:

- `mode` — `"changed"` or `"all"`
- `changedFiles[]` — array of `{ path, changeType }` objects
- `selectedProjects[]` — projects containing changed files
- `potentiallyImpactedProjects[]` — projects potentially affected by changes

### Default scope

- `--scope changed` is the default:
  - includes uncommitted working tree + staged changes
  - validates **changed projects only** (config can override)

### Networking policy

Validation supports deny-all networking for the validation phase.

Recommended operational model:

- `deps` step runs with network enabled (if needed).
- validation steps (typecheck/compile/diagnostics) can run in an isolated container.

**Deny-all semantics**

- Docker: when using `--network none`, the container has only loopback; no external connectivity.
- Podman: `none` mode implies no network connectivity.

> The exact provider flags are an implementation detail, but the semantic contract is: `deny-all` means “no external network access”.

If `validate` runs with `runtime.network.validate = deny-all` and dependencies are missing, the report includes `code: "NETWORK_BLOCKED"` and `nextActions` that prompt running `agent-gate prepare`.

### Output (ValidationReport)

`agent-gate validate` returns a **ValidationReport** as defined in:

- `docs/reference/report-schema.md`

### Example

```bash
agent-gate validate --pretty
```

---

## `agent-gate daemon`

Operational commands for troubleshooting. Not intended for normal skill flows.

- `agent-gate daemon status`
- `agent-gate daemon stop`

These commands also output JSON.

---

## Environment variables

Optional environment variables (all optional; config file is preferred):

- `AGENT_TOOLS_CONFIG` — config file path override
- `AGENT_TOOLS_LOG_LEVEL` — same as `--log-level`
- `AGENT_TOOLS_LOG_DIR` — override log output directory (default `.agent-gate/logs`)

---

## Notes for automation (skills)

- Always parse STDOUT as JSON.
- Use exit code for quick pass/fail, but rely on JSON fields for details:
  - `summary.ok`
  - `steps[].status`
  - `diagnostics[]`
  - `nextActions[]`
  - `artifacts.logDir`
