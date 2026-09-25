# Research and evidence boundaries

Initial upstream research: 2026-09-08. Status reconciled with local code and tests on 2026-09-22. The reference table records what documentation established at the time; installed-version evidence is recorded in [compatibility](compatibility.md) and [validation](validation.md). The current [roadmap](roadmap.md) supersedes the original M0 research sequence.

## References

| Source | Documentation supports | Does not establish |
| --- | --- | --- |
| [MCP Tasks](https://modelcontextprotocol.io/extensions/tasks/overview) | Task handles, observation, input, cooperative cancellation, persistent client IDs | Universal business checkpoints or submission deduplication |
| [Tasks specification](https://github.com/modelcontextprotocol/ext-tasks) | Upstream specification reference | Compatibility with every SDK revision |
| [FastMCP server tasks](https://gofastmcp.com/servers/tasks) | Docket, Redis/Valkey, workers, progress, identity snapshots | Instruction-level resume or exactly-once side effects |
| [FastMCP client tasks](https://gofastmcp.com/clients/tasks) | Existing handles, observation, results, cancellation, input | Cross-process delivery into our selected host |
| [FastMCP 3.0 announcement](https://jlowin.dev/blog/fastmcp-3) | Release context | Every current documentation feature existed in initial 3.0 |
| [Harness](https://github.com/deepseek-ai/deepseek-harness) | Cordis plugins, MIT, preview compatibility warning | Every MCP behavior is externally extensible |
| [Harness architecture](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/architecture.md) | Jobs, session events, tool pipeline, agent extension points | Complete MCP Tasks support or idempotent delivery |

## Documentation differences to resolve

The Tasks overview describes capability advertisement and server-directed task responses. Some FastMCP wording refers to per-request opt-in and protocol terminology from different stages. Do not combine snippets into an invented protocol.

The CLI now uses the pinned modern contract and a tested JSON HTTP shim. SDK probes and live FastMCP exchanges establish the supported path; the original wording differences are not blockers for that implementation. Keep legacy and modern Tasks separate. Revisit upstream assumptions when a dependency changes or a concrete interoperability requirement arises.

## Research status

| Question | Evidence and next gate |
| --- | --- |
| Q01: Server / SDK interoperability | FastMCP 4.0.3 works through the HTTP shim; the pinned TypeScript SDK rejects Tasks. See the compatibility tests and real-server integration. |
| Q02–Q06: Host providers, session recovery and delivery | Unverified and deferred to the bounded R4 host probe. They do not block R1/R2. |
| Q07: Submission deduplication / discovery | The pinned contract provides no standard submission idempotency key or tasks/list. Unknown submissions remain unreplayed; server-specific reconciliation needs separate evidence. |
| Q08: Cancellation and server durability | Live cancellation is tested. Redis-backed completed-result retrieval after FastMCP restart is tested, with Redis kept running and no cached client result (#17). Active-worker recovery, TTL cleanup and Redis restart remain unverified. |

## Related implementations

- [temporal-community/durable-async-mcp](https://github.com/temporal-community/durable-async-mcp): repository search results describe Temporal-based durable client lifecycle tracking. Revisit the implementation before making comparative claims or selecting a host integration; this is not an unfinished CLI initialization gate.
- [AndresSaa/mcp-durable-tasks](https://github.com/AndresSaa/mcp-durable-tasks): repository search results describe a server-side durable task state engine. Source review remains outstanding.

## Claim discipline

Do not claim the first MCP Tasks client, that cancellation/recovery are wholly unimplemented upstream, or that plugin architecture makes integration trivial. Upstream feedback should include a minimal reproduction and specification evidence. Product value depends on demonstrated gaps and recovery behavior.

## Naming

The repository is `durable-mcp-client`, displayed as **Durable MCP Client**. Durability refers to client-side records and recovery. Package registry availability has not been verified.
