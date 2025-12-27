# AGENTS.md

This repository builds **agent-oriented tooling** (CLI + repo daemon) to:

- prepare/build monorepos (multi-language),
- make LSP/BSP/DAP usable,
- validate AI-generated edits with deterministic, machine-readable reports.

This file is written for **coding agents** (and humans). Follow it strictly.

---

## 0) Prime directive

**Make the tool reliable for automation.**  
If you must choose between:

- adding a new feature quickly, or
- making the tool deterministic, diagnosable, and safe to run repeatedly,

choose **determinism and diagnosability**.

---

## 1) What we are building (mental model)

### External interface (public contract)

- A **low-freedom CLI** intended to be called from agent skills and other orchestrators:
  - `agent-gate analyze`
  - `agent-gate prepare`
  - `agent-gate validate`
- The CLI **always prints JSON** (success or failure), and uses stable exit codes.

### Internal architecture (implementation detail)

- A **repo-scoped daemon** that:
  - manages long-lived language servers (LSP),
  - manages container runtimes (docker/podman),
  - owns caches and logs,
  - enforces concurrency limits and timeouts.

Agents should treat the daemon as an optimization; correctness must not depend on it.

---

## 2) Scope & product constraints (do not “improve” without ADR)

### Repo assumptions

- **Monorepo** with **mixed languages** and **multiple subprojects** per language.

### Default scope rule

- Validate **uncommitted changes** by default:
  - working tree changes + staged changes
- It must be possible to override scope via config, but defaults must remain stable.

### “Buildable” definition

- **Required:** compile and/or typecheck
- **Optional:** tests

### Language roadmap

- v0: **TypeScript/JavaScript + Python** (must be solid)
- v1: add **Java + C#**
- After v1: extend with additional languages via plugin-style “toolchain packs”.

### Network policy

- `validate` should be able to run with **deny-all networking**.
- `prepare` may require networking (to fetch deps).
- “Allowlist networking” is a future feature; for now ensure a local config can enforce deny-all.

---

## 3) Golden rules for agents (how to work in this repo)

### 3.1 Prefer low freedom

Fragile workflows (deps/build/LSP process control) must be encoded as:

- explicit scripts,
- narrow command sequences,
- stable JSON outputs,
  not as “agent reasoning steps”.

### 3.2 Solve, don’t punt

If a step can fail, do **not** just surface raw stderr and ask the agent to decide.
Instead:

- classify the failure,
- emit a structured `nextActions[]` with safe, specific remediations,
- include enough context for humans (paths, command, exit code), but do not leak secrets.

### 3.3 Don’t introduce optionality unless needed

Avoid adding multiple ways to do the same thing.
If an escape hatch is required:

- provide one default,
- one override mechanism,
- document both.

### 3.4 Deterministic by default

- No hidden randomness.
- Fixed ordering in JSON arrays (sort by key/path).
- Timeouts everywhere (process spawn, RPC, container exec).
- Cleanup always (kill child processes; remove temp dirs unless configured to keep).

---

## 4) TypeScript standards (use these patterns consistently)

### 4.1 Compiler strictness

- Keep `"strict": true` in all TS configs.
- Treat new TS version upgrades as potentially introducing new errors; prefer pinning TS and upgrading intentionally.

### 4.2 Avoid `any` (especially in core)

- `any` is an escape hatch. Do not use it in core packages.
- Preferred alternatives:
  - `unknown` for untrusted/external data,
  - explicit interfaces/types,
  - generics with constraints.

### 4.3 Use `unknown` + narrowing for boundaries

Every boundary where data is untrusted or shape is uncertain should follow:

- parse/validate (e.g., with a schema),
- narrow via type guards,
- only then operate.

### 4.4 Error handling in TS

- Treat caught errors as `unknown`.
- Narrow with `instanceof Error` or a type guard before using `.message`, `.stack`, etc.
- Do not assume thrown values are `Error`.

### 4.5 Prefer type guards / narrowing over assertions

Avoid `as SomeType` unless you can prove it.
Instead:

- use `typeof`, `instanceof`, `"in"` checks, discriminated unions,
- use predicate functions for reusable checks.

### 4.6 Use `satisfies` for config objects

When defining object-literal configs or maps:

- prefer `satisfies SomeType` to validate keys/values **without** losing inference.

### 4.7 Avoid boxed primitive types

Use `string`, `number`, `boolean`, `symbol`.
Do not use `String`, `Number`, `Boolean`, `Object`.

---

## 5) Repo conventions & code organization

### 5.1 Packages

We use a monorepo layout (exact paths may evolve). Keep layering clean:

- **core**: pure domain logic, schemas, error taxonomy
- **daemon**: lifecycle management, LSP supervision, caches
- **cli**: argument parsing, JSON output, exit codes, daemon bootstrap
- **providers/**: docker/podman adapters
- **toolchains/**: language packs (ts/js, python, later java/csharp)

Do not import “up” the layers (core must not depend on daemon).

### 5.2 Schemas are contracts

Config schema and report schema are public contracts.
If you change them:

- bump `schemaVersion`,
- update `docs/reference/*`,
- add migration notes if needed,
- add tests for backward compatibility expectations.

### 5.3 Logging

- Logs are machine-readable (JSON).
- Always include: `repoId`, `sessionId`, `projectId` (if applicable), and `step`.

### 5.4 Paths

- Always use forward slashes in documentation and examples.
- Avoid OS-specific assumptions; primary targets are Linux and WSL2.

---

## 6) Process execution & lifecycle safety

### 6.1 Child processes

- Must be killable on cancellation/timeouts.
- Must not leak zombies.
- Must stream logs without buffering unbounded output.

### 6.2 Language servers (LSP)

- Managed by the daemon.
- Must support restart-on-crash with backoff and max retry.
- Must enforce idle TTL shutdown.
- Must isolate workspaces/caches by session (design for future concurrency, even if v0 runs single-process).

### 6.3 Containers (docker/podman)

- Abstract via provider interface.
- Validate mode must support `network=deny-all`.
- Avoid mounting secrets into containers by default.

---

## 7) Testing strategy (required for each meaningful change)

### 7.1 Test layers

- **Unit tests (fast, deterministic):**
  - scope resolution,
  - config parsing/validation,
  - error classification,
  - report generation (stable ordering).
- **Integration tests (fixtures):**
  - minimal TS workspace fixture,
  - minimal Python workspace fixture,
  - run `analyze → prepare → validate` in a controlled environment.
- **E2E tests (optional / gated):**
  - require docker/podman installed,
  - run only when explicitly enabled (env flag).

### 7.2 What to add when fixing a bug

- Repro test first (unit or integration).
- Fix.
- Assert JSON report includes the expected classification + `nextActions`.

---

## 8) Documentation rules

We maintain:

- `docs/adr/` (architecture decisions)
- `docs/reference/` (stable contracts: CLI, config schema, report schema, exit codes)
- `docs/user-manual/` (how to use; troubleshooting)

### ADR requirement

Add an ADR when you change:

- external CLI semantics,
- report/config schema,
- daemon lifecycle policy,
- networking policy,
- plugin/toolchain architecture.

---

## 9) Pull request checklist (agents must satisfy)

Before submitting changes:

- [ ] `pnpm lint` passes
- [ ] `pnpm test` passes
- [ ] JSON output remains stable (ordering, required fields)
- [ ] No new `any` in core packages
- [ ] New failure modes are classified + have `nextActions`
- [ ] Docs updated (reference and/or ADR) when public behavior changes

---

## 10) If you are stuck (agent fallback protocol)

When uncertain:

1. Minimize the change (reduce surface area).
2. Add observability (logs + report fields) rather than guess.
3. Prefer a safe default with one override mechanism.
4. If a decision affects contracts or architecture, write an ADR stub immediately.
