# Product scope

## Current product

A standalone TypeScript CLI that tracks long-running MCP tasks in local SQLite and resumes observation after client exit. Users run remote work on an independent server, keep the handle, inspect results and pending input, and explicitly request cancellation or send responses.

The supported baseline is one local user, the pinned modern JSON HTTP contract and the FastMCP example. CLI commands are submit, list, status, recover, cancel, respond and wait. Authentication, agent-session delivery and broad server compatibility are not implemented.

## Alpha workflow

1. Install the CLI artifact (R2; currently build from source).
2. Submit a task and persist intent before network effects, then its accepted handle.
3. Exit and restart the client with the same database and endpoint.
4. Query or wait; distinguish remote status from observation failure.
5. Inspect form input and send an explicit response, or request cancellation.
6. Read the saved result. With the configured Redis example, retrieve completed results after a FastMCP restart using the original handle.

## Guarantees and limits

Accepted handles survive client restarts. Unknown submission outcomes are never automatically retried. Cancellation acknowledgments do not prove cancellation. Input response attempts are durably guarded against duplicates. Invalid forms can be corrected before sending; adapter-proven rejection permits an explicit, refreshed correction with retained history. The generic HTTP path cannot establish non-acceptance from remote errors, so those outcomes remain unknown and cannot be replayed. The database stores payloads in plaintext. The current endpoint identity is a URL hash, not an authenticated-principal identity.

The memory-backed example loses remote tasks when its server exits. With Redis kept running, completed results can be fetched after FastMCP restarts at the same endpoint; the test verifies the result was not already cached in SQLite. No active-job checkpointing, Redis restart durability, outbox, exactly-once delivery, or host continuation is claimed.

## Acceptance and non-goals

The alpha must pass R1 failure tests and the R2 clean-install workflow. Each supported behavior has a test and each unsupported fault has a visible boundary. Reuse server scheduling; do not build a workflow engine, hosted service, multi-tenant system or another agent framework. Website deployment is not required. A host adapter is considered only after the standalone product is usable and a concrete integration contract is verified.
