# Config Schema (v0)

This document defines the **stable configuration contract** for `agent-gate`.

- The config is intended to keep automation **deterministic** and **low freedom**.
- Most users should not need to touch config beyond a few overrides.
- Unknown/typo keys should be rejected to prevent silent misconfiguration.

> Naming note: this repo/tool is **agent-gate** (CLI: `agent-gate`).

---

## 1) File format & loading

### Supported formats

Config may be expressed as **YAML** or **JSON**. The structure is the same.

### Recommended filenames

- Repo config (recommended):
  - `agent-gate.config.yaml`
  - `agent-gate.config.json`
- User config (optional, for defaults):
  - `~/.config/agent-gate/config.yaml`
  - `~/.config/agent-gate/config.json`

### Resolution order

1. `--config <path>` if provided
2. Repo config if found (recommended)
3. User config if found
4. Built-in defaults

> If both repo + user configs exist, repo config wins for conflicting keys.

---

## 2) Versioning & compatibility

### `schemaVersion`

Config is versioned by `schemaVersion` (integer).

Rules:

- **Backward-incompatible** changes require incrementing `schemaVersion`.
- Backward-compatible additions (new optional fields) may be added without bumping.
- Config parsing should be **strict**: unknown keys cause an error by default.

---

## 3) Top-level structure (overview)

```yaml
schemaVersion: 1

runtime: # container runtime + networking policies
scheduler: # concurrency limits (v0 defaults to 1 everywhere)
workspace: # session/workspace strategy (in-place in v0; worktree-ready)
cache: # cache layout + scoping policy
scope: # what "validate" checks by default (changed is default)
toolchains: # language packs (v0: node + python; v1: add java/csharp)
lsp: # LSP supervisor settings (daemon-managed)
reports: # report + log output configuration
security: # redaction + safety knobs
```

---

## 4) Detailed schema

## 4.1 `schemaVersion` (required)

```yaml
schemaVersion: 1
```

- Type: `number` (integer)
- Required: **yes**
- Allowed: currently `1`

---

## 4.2 `runtime`

Controls container runtime selection and networking policies.

```yaml
runtime:
  provider: auto
  network:
    prepare: default
    validate: deny-all
  images:
    base: "ghcr.io/your-org/agent-gate-base:latest"
  env:
    passthrough:
      - "HTTP_PROXY"
      - "HTTPS_PROXY"
      - "NO_PROXY"
```

### 4.2.1 `runtime.provider`

- Type: `"auto" | "docker" | "podman" | "none"`
- Default: `"auto"`

Meaning:

- `auto`: prefer docker if available, else podman, else none
- `none`: no containers (not recommended; primarily for dev/debug)

### 4.2.2 `runtime.network`

- Type: object
- Defaults:
  - `prepare: "default"`
  - `validate: "default"`

Fields:

- `prepare: "default" | "deny-all" | "proxy"`
  - v0 supports: `default`, `deny-all`
  - `proxy` reserved for future allowlist (not implemented in v0)

- `validate: "default" | "deny-all" | "proxy"`
  - v0 supports: `default`, `deny-all`
  - `deny-all` means: **no external network connectivity** during validate steps.

Recommended operational model:

- `prepare: default` (deps may require network)
- `validate: deny-all` (typecheck + LSP diagnostics should not need network if deps are present)

### 4.2.3 `runtime.images`

- Type: object
- Optional in v0 (tool may also use built-in images or local runtime defaults)

Fields:

- `base: string`
  Base container image used for running toolchains (Node/Python, later Java/C#).
- `toolchainOverrides?: Record<string, string>`
  Optional per-toolchain image override (e.g., `node`, `python`).

### 4.2.4 `runtime.env`

- Type: object
- Purpose: control environment variables passed into containers and subprocesses.

Fields:

- `passthrough?: string[]`
  Allowlist of env var names to pass through (useful for proxies).
- `set?: Record<string, string>`
  Additional env values to set for all container runs.

---

## 4.3 `scheduler`

Controls concurrency. v0 should default to **single-process, fully serialized**.

```yaml
scheduler:
  mode: single-process
  slots:
    workspace: 1
    install: 1
    build: 1
    lsp:
      start: 1
      index: 1
    test: 1
```

### 4.3.1 `scheduler.mode`

- Type: `"single-process"`
- Default: `"single-process"`

### 4.3.2 `scheduler.slots`

- Type: object
- Defaults: all `1`

Fields:

- `workspace: number`
- `install: number`
- `build: number`
- `test: number`
- `lsp.start: number`
- `lsp.index: number`

Notes:

- In v0, treat all slot values as **upper bounds**; actual concurrency remains 1 unless explicitly enabled in later versions.
- Keep this section so future multi-agent scaling is a config change, not a rewrite.

---

## 4.4 `workspace`

Defines how agent-gate creates an isolated workspace/session.

```yaml
workspace:
  strategy: in-place
  baseDir: "~/.cache/agent-gate/workspaces"
  cleanup:
    ttlMinutes: 60
    keepLastN: 3
```

### 4.4.1 `workspace.strategy`

- Type: `"in-place" | "git-worktree"`
- Default: `"in-place"` (v0)

Meaning:

- `in-place`: run directly in the current repo working tree (v0 default).
- `git-worktree`: create per-session worktrees under `baseDir` (supported starting v1+; recommended for multi-agent).

### 4.4.2 `workspace.baseDir`

- Type: `string`
- Default: `~/.cache/agent-gate/workspaces`

### 4.4.3 `workspace.cleanup`

- Type: object

Fields:

- `ttlMinutes: number` (default `60`)
- `keepLastN: number` (default `3`)
- `keepOnFailure?: boolean` (default `true`)
  Keep failed sessions for troubleshooting.

---

## 4.5 `cache`

Controls cache layout and scoping. The defaults should favor “safe enough” behavior while still being usable on dev machines.

```yaml
cache:
  baseDir: "~/.cache/agent-gate/cache"
  profile: balanced
  toolOverrides:
    maven: { scope: workspace } # v1+ recommended
    gradle: { scope: workspace } # v1+ recommended
    nuget: { scope: repo } # v1+ recommended
    npm: { scope: repo }
    pnpm: { scope: repo }
    yarn: { scope: repo }
    pip: { scope: repo }
    uv: { scope: repo }
    poetry:{ scope: repo }
```

### 4.5.1 `cache.baseDir`

- Type: `string`
- Default: `~/.cache/agent-gate/cache`

### 4.5.2 `cache.profile`

- Type: `"safe" | "balanced" | "aggressive"`
- Default: `"balanced"`

Interpretation:

- `safe`: prefer `workspace` scope for most tool caches (least risk, more disk).
- `balanced`: isolate “fragile” caches more, share others per repo.
- `aggressive`: share globally where possible (fastest, highest contamination risk).

### 4.5.3 `cache.toolOverrides`

- Type: map of tool name → `{ scope: ... }`

Field:

- `scope: "workspace" | "repo" | "global"`

Tool names (v0):

- `npm | pnpm | yarn | pip | uv | poetry`

Tool names (v1+):

- `maven | gradle | nuget`

Notes:

- `repo` scope means: share caches between sessions for the same repo id.
- `workspace` scope means: each session gets its own cache subtree.

---

## 4.6 `scope`

Controls which projects are validated by default.

```yaml
scope:
  defaultMode: changed
  include:
    - "**/*"
  exclude:
    - "**/dist/**"
    - "**/.venv/**"
  onNoChanges: ok
  reportPotentialImpacts: true
```

### 4.6.1 `scope.defaultMode`

- Type: `"changed" | "all"`
- Default: `"changed"`

Meaning:

- `changed`: validate projects affected by **uncommitted changes** (working tree + staged).
- `all`: validate all detected subprojects.

### 4.6.2 `scope.include` / `scope.exclude`

- Type: `string[]` (glob patterns)
- Default:
  - `include: ["**/*"]`
  - `exclude: ["**/node_modules/**", "**/.git/**"]` (plus tool-defined defaults)

### 4.6.3 `scope.onNoChanges`

- Type: `"ok" | "skip" | "fail"`
- Default: `"ok"`

Meaning:

- `ok`: validation passes with no changes (useful for automation).
- `skip`: exit success but mark steps as skipped.
- `fail`: treat as misconfiguration/usage error.

### 4.6.4 `scope.reportPotentialImpacts`

- Type: `boolean`
- Default: `true`

Meaning:

- If true, the report includes `potentiallyImpactedProjects` even when `defaultMode=changed`.
- In v0, impacted computation may be heuristic. A precise `affected` mode is future work.

---

## 4.7 `toolchains`

Defines language pack behavior. v0 supports **Node (TS/JS)** and **Python**.
Java/C# sections may exist but are ignored in v0.

```yaml
toolchains:
  node:
    enabled: true
    packageManager: auto
    install:
      mode: auto
    typecheck:
      scriptName: typecheck
      fallback:
        enabled: true
        command: "tsc --noEmit"
      overrides:
        - projectRoot: "packages/foo"
          command: "pnpm -C packages/foo run check"

  python:
    enabled: true
    manager: auto
    install:
      mode: auto
    typecheck:
      tool: pyright
      overrides:
        - projectRoot: "python/services/service-a"
          command: "pyright"
```

### 4.7.1 `toolchains.node` (v0)

#### `toolchains.node.enabled`

- Type: `boolean`
- Default: `true`

#### `toolchains.node.packageManager`

- Type: `"auto" | "pnpm" | "npm" | "yarn"`
- Default: `"auto"`

#### `toolchains.node.install`

- Type: object

Fields:

- `mode: "auto" | "ci" | "install"`
  - `auto` selects a safe default per manager:
    - npm → `npm ci`
    - yarn → `yarn install --immutable`
    - pnpm → `pnpm install`

- `workingDirectory?: string`
  - Defaults to repo root (monorepo install).

#### `toolchains.node.typecheck`

- Type: object

Fields:

- `scriptName: string` (default `"typecheck"`)
- `fallback.enabled: boolean` (default `true`)
- `fallback.command: string` (default `"tsc --noEmit"`)
- `overrides?: { projectRoot: string, command: string }[]`
  - Used when a package lacks `scripts.typecheck`.
  - If overrides are not provided, fallback applies.
  - Regardless, report must include a warning when a package has no typecheck script.

Notes:

- The fallback command runs within the project root (or configured working directory).
- Prefer deterministic commands. Avoid commands that mutate lockfiles.

### 4.7.2 `toolchains.python` (v0)

#### `toolchains.python.enabled`

- Type: `boolean`
- Default: `true`

#### `toolchains.python.manager`

- Type: `"auto" | "uv" | "pip" | "poetry"`
- Default: `"auto"`

#### `toolchains.python.install`

- Type: object

Fields:

- `mode: "auto" | "sync" | "install"`
  - `auto` selects a best-effort default based on project files.

#### `toolchains.python.typecheck`

- Type: object

Fields:

- `tool: "pyright"` (v0 fixed)
- `overrides?: { projectRoot: string, command: string }[]`

Notes:

- Python subprojects are detected per `pyproject.toml` (multiple are supported).
- If typecheck requires per-project environment, prefer manager-controlled env creation in `prepare`.

### 4.7.3 `toolchains.java` / `toolchains.csharp` (reserved for v1)

- These keys may appear but are ignored in v0.
- v1 will define `enabled`, `manager`, `install/restore`, `compile`, and optional LSP settings.

---

## 4.8 `lsp`

LSP is daemon-managed. v0 requires TS/JS and Python LSP for diagnostics.

```yaml
lsp:
  enabled: true
  lifecycle:
    idleTtlMinutes: 20
    restart:
      maxRestarts: 3
      backoffMs: [1000, 2000, 5000]
  servers:
    ts:
      command: "typescript-language-server"
      args: ["--stdio"]
    python:
      command: "pyright-langserver"
      args: ["--stdio"]
```

### 4.8.1 `lsp.enabled`

- Type: `boolean`
- Default: `true`

### 4.8.2 `lsp.lifecycle`

Fields:

- `idleTtlMinutes: number` (default `20`)
- `restart.maxRestarts: number` (default `3`)
- `restart.backoffMs: number[]` (default `[1000, 2000, 5000]`)

### 4.8.3 `lsp.servers`

- Type: map of server key → server spec

Server spec:

- `command: string` (required)
- `args: string[]` (optional)
- `env?: Record<string, string>` (optional)
- `initializationOptions?: object` (optional)
- `settings?: object` (optional; used for language-server settings)

Notes:

- v0 expects:
  - TS/JS LSP uses stdio transport.
  - Python LSP uses stdio transport.

- LSP diagnostics are **required** for `validate` in v0.

---

## 4.9 `reports`

Controls output directories and formatting.

```yaml
reports:
  outputDir: ".agent-gate/reports"
  logDir: ".agent-gate/logs"
  prettyJson: false
  maxDiagnostics: 2000
  redact:
    enabled: true
    patterns:
      - "(?i)token\\s*[:=]\\s*\\S+"
      - "(?i)password\\s*[:=]\\s*\\S+"
```

### 4.9.1 `reports.outputDir` / `reports.logDir`

- Type: `string`
- Defaults:
  - `outputDir: ".agent-gate/reports"`
  - `logDir: ".agent-gate/logs"`

### 4.9.2 `reports.prettyJson`

- Type: `boolean`
- Default: `false`

### 4.9.3 `reports.maxDiagnostics`

- Type: `number`
- Default: `2000`

Meaning:

- Hard cap to keep reports bounded. If exceeded, include a warning and summarize.

### 4.9.4 `reports.redact`

Fields:

- `enabled: boolean` (default `true`)
- `patterns: string[]` (regex strings)
- `keys?: string[]` (field names to redact in structured output)

---

## 4.10 `security`

Safety guardrails for automation.

```yaml
security:
  redactEnvKeys:
    - "TOKEN"
    - "PASSWORD"
    - "SECRET"
    - "API_KEY"
  maxLogBytesPerStep: 10485760
  allowDangerousCommands: false
```

### 4.10.1 `security.redactEnvKeys`

- Type: `string[]`
- Default: `["TOKEN", "PASSWORD", "SECRET", "API_KEY"]`

Used to prevent leaking secrets in:

- rendered command lines,
- env passthrough echoes,
- logs and `nextActions`.

### 4.10.2 `security.maxLogBytesPerStep`

- Type: `number`
- Default: `10_485_760` (10MB)

Meaning:

- Truncate per-step log capture to avoid unbounded memory/disk.

### 4.10.3 `security.allowDangerousCommands`

- Type: `boolean`
- Default: `false`

Meaning:

- If false, `nextActions.commands[]` must not include commands that mutate lockfiles unless explicitly requested.
- In v0, the tool should prefer guidance and classification rather than “automatic fixes”.

---

## 5) Examples

## 5.1 Minimal (recommended for most repos)

```yaml
schemaVersion: 1

runtime:
  provider: auto
  network:
    prepare: default
    validate: deny-all

scope:
  defaultMode: changed
  reportPotentialImpacts: true

toolchains:
  node:
    enabled: true
    packageManager: auto
    typecheck:
      scriptName: typecheck
      fallback:
        enabled: true
        command: "tsc --noEmit"

  python:
    enabled: true
    manager: auto
    typecheck:
      tool: pyright
```

## 5.2 Override typecheck for a package with no `typecheck` script (warn + run override)

```yaml
schemaVersion: 1

toolchains:
  node:
    typecheck:
      overrides:
        - projectRoot: "packages/legacy"
          command: "pnpm -C packages/legacy run build"
```

## 5.3 Validate with networking enabled (debug / dev)

```yaml
schemaVersion: 1

runtime:
  network:
    prepare: default
    validate: default
```

---

## 6) Validation rules (summary)

- Config parsing is strict:
  - unknown keys → error (exit code: config error)

- `schemaVersion` must be supported.
- If `runtime.network.validate = deny-all`, validate steps must not attempt dependency fetch.
  - If deps are missing, `validate` should fail with actionable `nextActions` (e.g., rerun `prepare`).

- If a Node package lacks a `typecheck` script:
  - the tool must emit a warning,
  - then run either an override or fallback command.

---

## 7) Relationship to other reference docs

- CLI semantics and exit codes: `docs/reference/cli.md`
- Validation report format: `docs/reference/report-schema.md`
