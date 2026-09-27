# Architecture

## Implemented path

```text
CLI -> TaskCoordinator -> TaskAdapter -> JSON HTTP Tasks endpoint
              |
          TaskStore (SQLite WAL / immediate transactions)
```

- `bin/durable-mcp-client.js`: installed entry point and minimum-Node guard before importing SQLite.
- `src/cli.ts`: help/version, explicit commands, JSON output, wait deadlines and signal teardown.
- `src/version.ts`: shared package version for CLI output and MCP client metadata.
- `scripts/build.mjs`: clean compilation used by the prepack hook; no runtime build or supported library API.
- `src/coordinator.ts`: submission, observation, cancellation, input responses and bounded wait. It never runs remote jobs.
- `src/store.ts`: one JSON TaskRecord per SQLite row; transactional updates and per-input-key reservation. No schema-version migration mechanism yet.
- `src/input.ts` and `src/errors.ts`: local form validation and structured failures, including adapter-proven input rejection.
- `src/snapshot.ts`: normalized snapshot validation for supported statuses, required payloads and optional metadata before persistence.
- `src/adapters/http.ts`: replaceable fetch shim pinned to 2026-07-28 because the tested SDK public Client path rejects Tasks. The SDK is used in compatibility tests and the file-manifest server example, not client runtime calls.
- `examples/fastmcp/server.py`: independent FastMCP/Docket process with batch hashing and form input. TasksExtension reads FASTMCP_DOCKET_URL/NAME; memory is the default, Redis enables completed-result retrieval after server restart.
- `examples/file-manifest/server.mjs`: independent TypeScript SDK / mcp-durable-tasks server for bounded-chunk SHA-256 hashing; its in-memory task state survives client exit, not server exit.

## Stored state

TaskRecord contains local ID, adapter/endpoint hash, input, accepted remote ID, submission state, latest snapshot (including optional server progress text), observation error and timestamps. Optional cancellation attempts distinguish pending/acknowledged/unknown delivery. Input history also supports proven rejection, unique attempt IDs and non-acceptance evidence; structured failure details supplement existing error strings. There are no caller/session IDs, credential references or delivery outbox.

The handle is committed before the initial snapshot is persisted. Malformed payloads must not discard a known handle. Remote lifecycle, local reachability and cancellation/input delivery outcomes are separate. New observations validate their status and required payloads inside the transaction; invalid observations roll back. Terminal snapshots resist both later snapshot writes and late observation errors without changing timestamps or writing to SQLite. Existing valid records remain readable without migration.

## Recovery and concurrency

The user supplies the same endpoint and database; the hash prevents accidental cross-endpoint queries. Unknown submissions are retained without resubmission. Wait queries, respects valid server poll hints after observations, and ends at input, terminal state, deadline or interruption. Exiting observation does not cancel work.

SQLite serializes updates and guards input keys across processes. It does not elect one poller or prevent duplicate observations. Do not equate transactional writes with a global single-instance lock. Input responses are validated against the refreshed request inside the reservation transaction. Corrections compare the last rejected attempt ID observed before polling with the current stored attempt, preventing concurrent commands from authorizing each other. Late completions update only their own pending attempt.

Only a trusted adapter's `InputRejectedError` with non-acceptance evidence permits explicit correction. The JSON HTTP adapter never infers rejection from error codes or outstanding keys: successful updates are eventually consistent, and an error may follow partial server effects. Unknown, pending and acknowledged deliveries remain guarded, including legacy rows. Controlled adapters test proven rejection; live FastMCP tests local preflight correction, not server-side rejection reconciliation.

## Future boundaries

Before authentication, identity must include principal scope as well as endpoint and task ID, with credentials reacquired outside task payload storage. Structured errors should support unavailable/auth/transient distinctions. Before a host adapter, verify session association and idempotent acknowledgment; only then add a transactional result outbox. Redis-backed completed-result reattachment is tested with SIGKILL of FastMCP; worker checkpoints and Redis-process durability remain separate, unverified boundaries. See the [roadmap](roadmap.md).
