# Product scope

## Users and problem

Developers use agents to launch indexing, batch processing, tests, and other long-running operations. They need to reconnect to the original task after the client exits, retrieve its result, and continue the originating session.

Client and remote task lifecycles differ. A client timeout does not establish task failure. Requesting cancellation does not establish that work stopped. Retrieving a result does not establish that the host session received it.

## Target workflow

1. Start a batch document-processing task from the CLI or selected host.
2. Persist submission intent, then associate the returned task handle with the caller and session.
3. Display task state while allowing the client to exit.
4. On restart, reauthenticate and resume observing recorded tasks.
5. Present pending input requests and submit responses.
6. Save completed results before delivering them to the CLI or original session.
7. Track delivery acknowledgements and deduplicate where the host supports it.

A separate cancellation scenario demonstrates both successful cancellation and completion winning the race.

## MVP scope

- One user, one local coordinator, one example MCP server.
- One verified HTTP transport and protocol/SDK combination.
- A deterministic batch document-processing example with inspectable output, independent of paid model APIs.
- Persistent records, restart recovery, input requests, cancellation tracking, and result delivery.
- Reproducible fault tests with pinned dependencies.
- A DeepSeek Harness adapter if the integration probe establishes a viable path.

## Non-goals

- A new distributed scheduler, generic workflow engine, or agent framework.
- Universal support for every MCP revision, transport, server, or host.
- Exactly-once external side effects enforced by the client.
- Automatic instruction-level continuation of arbitrary Python functions.
- Multi-tenant hosting, billing, or cross-device synchronization.
- Performance or ecosystem-first claims without evidence.

## Explicit boundaries

Unknown submission outcomes remain unknown unless a verified reconciliation mechanism resolves them. Non-idempotent requests must not be automatically resubmitted. Missing or expired remote tasks are distinguished from failed business operations. Delivery guarantees depend on host acknowledgement and deduplication support.

The example server runs independently of the client. A stdio subprocess that dies with the CLI cannot demonstrate remote task survival.

## Acceptance criteria

- Restarting the client reconnects to tasks whose handles were committed locally without resubmitting them.
- Both synchronous results and asynchronous task handles are handled.
- Completion, failure, cancellation, input required, unavailable tasks, and network errors are distinguishable.
- Crashes between result persistence and delivery are recoverable under the documented host contract.
- Required fault cases have reproducible evidence or explicit unsupported outcomes.
- A new contributor can reproduce the workflow and inspect real output rather than only a sleep demo.
