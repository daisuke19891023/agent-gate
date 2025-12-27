# ADR 0001: Repo daemon lifecycle and single-instance IPC

## Status
Accepted

## Context
The CLI needs a repo-scoped daemon to manage long-lived processes (LSP, containers)
without requiring every CLI invocation to re-bootstrap state. We must ensure:

- One daemon per repo (no double start).
- CLI starts the daemon when missing and reuses it when running.
- IPC is deterministic and diagnosable.

## Decision
- Each repo owns a daemon socket under `.agent-gate/daemon/daemon.sock`.
- CLI commands (`analyze`, `prepare`, `validate`) ensure the daemon is running before
  executing command logic.
- The daemon exposes a JSON-line IPC protocol (`status`, `stop`, `ping`) over a
  UNIX socket.
- Startup checks for an active socket; if active, the daemon exits without starting
  another instance. If stale, the socket and state files are cleaned up.
- The daemon writes state metadata in `.agent-gate/daemon/daemon.json`.
- The daemon processes requests through an internal single-concurrency queue, so
  future concurrency changes are localized.

## Consequences
- CLI invocations now always have a running daemon available for future features.
- Stale daemon artifacts are cleaned up deterministically on startup or stop.
- IPC remains simple (JSON lines) and works without networking.
