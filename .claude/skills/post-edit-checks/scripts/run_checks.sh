#!/usr/bin/env bash
set -euo pipefail

repo_root="$(
  git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel 2>/dev/null \
    || cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd
)"
cd "$repo_root"

pnpm format
pnpm lint
pnpm typecheck
pnpm test
