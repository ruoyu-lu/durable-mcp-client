# Research and evidence boundaries

Reviewed: 2026-09-08. Findings below come from first-party online documentation, not installed-version testing or a completed source audit. Pin versions and commits before implementation.

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

M0 must use a pinned specification, SDK types, and actual wire exchanges to determine capability placement, methods, result shapes, input, polling, TTL, and cancellation. Keep legacy and modern Tasks separate.

## Open questions

- Q01: Which Python server / TypeScript SDK versions interoperate?
- Q02: How much MCP Tasks support already exists in Harness providers, response parsing, and tests?
- Q03: Can an external plugin access handles, or must a provider be replaced?
- Q04: Do jobs survive process restart and retain remote task associations?
- Q05: Can the host append/query session events idempotently by delivery ID?
- Q06: How can a restarted host register recovered tasks and request continuation?
- Q07: What submission deduplication or discovery exists, and what does it guarantee?
- Q08: What actually happens on cancellation, worker death, TTL cleanup, and Redis restart?

The [compatibility baseline](compatibility.md) now pins the Tasks source and records protocol requirements. Runtime and host answers remain pending and must include source locations and reproducible evidence.

## Related implementations

- [temporal-community/durable-async-mcp](https://github.com/temporal-community/durable-async-mcp): repository search results describe Temporal-based durable client lifecycle tracking. Audit this approach in M0 before assuming a client-side gap.
- [AndresSaa/mcp-durable-tasks](https://github.com/AndresSaa/mcp-durable-tasks): repository search results describe a server-side durable task state engine. Source review remains outstanding.

## Claim discipline

Do not claim the first MCP Tasks client, that cancellation/recovery are wholly unimplemented upstream, or that plugin architecture makes integration trivial. Upstream feedback should include a minimal reproduction and specification evidence. Product value depends on demonstrated gaps and recovery behavior.

## Naming

The repository is `durable-mcp-client`, displayed as **Durable MCP Client**. Durability refers to client-side records and recovery. Package registry availability has not been verified.
