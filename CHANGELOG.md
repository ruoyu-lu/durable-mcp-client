# Changelog

## Unreleased

- Preserve advisory server progress messages in durable task snapshots.
- Add a real local file-manifest workflow using a second Tasks runtime, with client-restart recovery and cooperative cancellation.

## 0.1.0-alpha.1 — prepared for release

- Installable standalone `durable-mcp-client` command with help, version output and a Node 22.13+ check.
- SQLite task handles and results; submit, list, status, recover, wait, cancel and explicit form responses.
- Persistent uncertain-delivery guards, form preflight and structured errors.
- Verified FastMCP JSON HTTP flows and uncached completed-result retrieval after a server restart with Redis kept running.

CLI only: internal JavaScript modules are not a supported library API. No authentication, SSE, legacy protocol negotiation, host continuation, active-worker checkpoints or Redis-process restart durability. Payloads are stored in plaintext. An alpha version in source is not evidence of npm or tag publication; see the repository's release instructions.
