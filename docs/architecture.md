# Architecture

This document defines implementation constraints. Wire fields and methods must follow the revision pinned in M0; internal records below are not MCP schema definitions.

## Layers

```text
CLI / Harness task presentation
              |
Host adapter: session association, input, delivery, continuation
              |
Coordinator -------- SQLite: records, inputs, results, outbox
              |
Protocol adapter using a compatible SDK
              |
Independent FastMCP server -- Redis/Valkey -- Docket worker
                                                 |
                                  Example job and checkpoints
```

| Component | Responsibility | Excludes |
| --- | --- | --- |
| Protocol adapter | Capabilities, submission, observation, input, cancellation, error normalization | Inventing a protocol |
| Coordinator | Recovery scan, polling, reconciliation, result capture | Running remote jobs |
| Local store | Transactions, migrations, outbox, recovery audit | Plaintext credentials |
| Host adapter | Session association, durable delivery, presentation, continuation | Remote business semantics |
| Example server | Batch processing, cooperative cancellation, checkpoints, artifacts | A generic workflow engine |

## Proposed records

- `TaskRecord`: local ID, server reference, identity reference, protocol revision, optional remote task ID, session/tool-call references, submission state, remote status, observation state, cancellation-request timestamp, observation/poll timestamps, expiry when available, result reference.
- `SubmissionIntent`: local operation ID, tool name, controlled argument storage, request digest, submission phase. A digest is audit metadata, not a remote idempotency guarantee.
- `PendingInput`: task reference, remote input identifier, payload/digest, answer, delivery state.
- `ResultRecord`: task reference, result type, payload or artifact reference, digest, saved timestamp.
- `DeliveryOutbox`: stable delivery ID, task/session references, payload reference, delivery state, host acknowledgement.

A task is identified by server, authenticated principal, and remote task ID together. Store credential references and reacquire valid credentials when needed; never treat a task ID as authorization.

## Separate state dimensions

1. Submission: not submitted, submitting, accepted, outcome unknown, direct result.
2. Remote lifecycle: mapped from the selected protocol, such as working, input required, completed, failed, cancelled.
3. Observation: reachable, temporarily unreachable, authentication required, unavailable.
4. Delivery: stored, pending delivery, acknowledged, or unable to deliver under the host contract.

Network errors must not overwrite remote business state. Stale responses must not regress a terminal state. Cancellation intent remains distinct from confirmed cancellation.

## Submission uncertainty

Commit intent before submitting and commit the remote handle immediately after receipt. This still leaves a window where the server accepted work but the response or local commit was lost.

M0 must establish whether the selected protocol/server supports discovery or idempotent submission. Without it, show an unknown outcome and require reconciliation rather than silently retrying. JSON-RPC request IDs are not assumed to deduplicate business operations.

## Observation recovery

On startup, load unfinished records and reconnect using the recorded server and identity. Respect the pinned specification's polling rules, applying bounded backoff where allowed. Pause on authentication failure and distinguish unavailable tasks from transient errors. Exiting the client detaches observation by default; it does not cancel remote work.

## Result delivery

Persist the result and pending outbox entry in one local transaction before contacting the host. To close the window between host acceptance and local acknowledgement, the host must support idempotent append by delivery ID or a reliable lookup of already accepted deliveries.

If the host cannot provide that contract, document the weaker guarantee. Do not claim exactly-once delivery. M0 must verify this seam. Delivering a result and waking an agent are separate operations: closed sessions or sessions no longer authorized to continue retain the result for inspection.

## Input requests

Persist input requests before presentation. After recovery, reconcile with the remote task before submitting an answer. Test stale answers, duplicate answers, and lost answer acknowledgements. User approval of side effects cannot be fabricated by the recovery layer.

## Server recovery

Reuse runtime scheduling. The example job saves per-file checkpoints and publishes artifacts atomically from temporary outputs. Kill-worker tests determine whether work retries, restarts, or resumes and whether cancellation reaches child work. Redis durability settings and Redis failure are separate from restarting the application server.

## Harness probe

Verify access to task responses, background-job registration, durable session events, idempotent delivery, and post-restart continuation. Session persistence alone is insufficient.

Proposed host operations: associate a task, present status, present input, deliver by stable ID, query delivery, and request continuation when allowed. A disposable probe determines whether an external plugin suffices or a provider replacement/upstream extension is needed.

## Runtime boundaries

MVP allows one coordinator writer, enforced by a startup lock. Keep credentials out of the task database and test evidence. Arguments/results may contain sensitive content: use controlled local storage, redacted logs, and documented retention. Dependency and wire compatibility belong at the protocol boundary rather than throughout the core.
