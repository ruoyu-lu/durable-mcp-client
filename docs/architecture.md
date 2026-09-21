# Architecture

## Implemented path

```text
CLI -> TaskCoordinator -> TaskAdapter -> JSON HTTP FastMCP endpoint
              |
          TaskStore (SQLite WAL / immediate transactions)
```

- `src/cli.ts`: explicit commands, JSON output, wait deadlines and signal teardown.
- `src/coordinator.ts`: submission, observation, cancellation, input responses and bounded wait. It never runs remote jobs.
- `src/store.ts`: one JSON TaskRecord per SQLite row; transactional updates and per-input-key reservation. No schema-version migration mechanism yet.
- `src/adapters/http.ts`: replaceable fetch shim pinned to 2026-07-28 because the tested SDK public Client path rejects Tasks. The SDK is currently used in compatibility tests, not runtime calls.
- `examples/fastmcp/server.py`: independent FastMCP/Docket process with memory backend, batch hashing and form input. Redis configuration is R1 work.

## Stored state

TaskRecord contains local ID, adapter/endpoint hash, input, accepted remote ID, submission state, latest snapshot, observation error and timestamps. Optional cancellation attempts and per-request response records distinguish pending/acknowledged/unknown delivery. There are no caller/session IDs, credential references or delivery outbox.

The handle is committed before the initial snapshot is persisted. Malformed payloads must not discard a known handle. Remote lifecycle, local reachability and cancellation/input delivery outcomes are separate. Terminal snapshots resist later snapshot writes; guarding late error writes and semantic validation are tracked in #15.

## Recovery and concurrency

The user supplies the same endpoint and database; the hash prevents accidental cross-endpoint queries. Unknown submissions are retained without resubmission. Wait queries, respects valid server poll hints after observations, and ends at input, terminal state, deadline or interruption. Exiting observation does not cancel work.

SQLite serializes updates and guards input keys across processes. It does not elect one poller or prevent duplicate observations. Do not equate transactional writes with a global single-instance lock. Input guards currently block even explicitly rejected attempts; #16 adds a narrowly justified correction path without replaying unknown deliveries.

## Future boundaries

Before authentication, identity must include principal scope as well as endpoint and task ID, with credentials reacquired outside task payload storage. Structured errors should support unavailable/auth/transient distinctions. Before a host adapter, verify session association and idempotent acknowledgment; only then add a transactional result outbox. Before server-recovery claims, test Redis-backed result reattachment independently from worker checkpoints and Redis durability. See the [roadmap](roadmap.md).
