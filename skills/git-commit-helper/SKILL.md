---
name: git-commit-helper
description: Plan, draft, and optionally execute git staging and committing for this repo. Use when the user asks to commit, asks for commit message suggestions, or after work is done and static checks have completed. Supports splitting changes into meaningful package-level commits, proposing Conventional Commits messages in English, and optionally auto-committing with safety checks.
---

# Git Commit Helper

## Overview

Provide a deterministic commit workflow: analyze changes, group by package or meaningful unit, propose Conventional Commits messages in English, and default to a commit plan. Only perform actual staging/committing when explicitly requested or when auto-commit is approved.

## Workflow

1. Verify repo context.
2. Inspect changes:
   - `git status -sb`
   - `git diff`
   - `git diff --staged`
3. Classify changes by package or meaningful unit. Prefer groups that make cherry-picking easy.
   - Keep changes in distinct packages separate unless tightly coupled.
   - Separate mechanical refactors from behavior changes.
   - If a change spans multiple packages for one feature, keep together only when necessary.
4. Produce a commit plan (default output):
   - List commit groups with included paths.
   - Provide a Conventional Commit message for each group.
   - Note any files that should stay uncommitted.
5. Accept follow-up instructions:
   - Adjust commit split.
   - Revise commit messages.
   - Proceed to stage/commit a subset.

## Commit message rules

- Use Conventional Commits in English.
- Keep the scope tied to the package or area when useful (e.g., `cli`, `daemon`, `core`).
- Use `!` for breaking changes and add a clear body line when needed.

## Auto-commit safety

Only perform auto-commit when explicitly requested. Before committing:

1. Ensure there are changes to commit; if `git diff --staged` is empty, stop and report.
2. Run required tests and confirm success (per repo standards).
3. Stage only the planned group of files.
4. Commit with the agreed message.
5. Report the resulting commit hash.

## Output format

When not auto-committing, output a concise plan with:

- Proposed commit groups and paths
- Proposed Conventional Commit messages
- Next actions the user can choose (edit message, adjust split, or run auto-commit)
