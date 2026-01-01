---
name: post-edit-checks
description: Run post-edit static analysis and tests for the agent-gate repo after code changes. Use when a code-modifying task is finished and you need to run AGENTS.md check tasks (pnpm format, lint, typecheck, test), fix any failures, and rerun until clean.
---

# Post Edit Checks

## Overview

Enforce the agent-gate post-edit checklist by running the required pnpm checks in a deterministic order and addressing any failures.

## Workflow

1. Confirm you are at the repository root (where `package.json` exist).
2. Run the checks in this order:
   - `pnpm format`
   - `pnpm lint`
   - `pnpm typecheck`
   - `pnpm test`
3. If any step fails:
   - Read the error output.
   - Fix the underlying issue.
   - Re-run the failed command, then continue with the remaining steps.
4. Report results and any fixes applied.

## Resources

### scripts/

Use `scripts/run_checks.sh` to run the standard sequence.
