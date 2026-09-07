# Durable MCP Client

A client-side approach to managing long-running MCP tasks across disconnects and restarts.

Durable MCP Client focuses on keeping remote tasks connected to the people and agent sessions that started them: tracking task handles, resuming observation, handling input requests, and delivering results reliably.

## Design

- **Persistent task records** associate remote task IDs with their server, caller identity, and originating session.
- **Recovery coordination** separates connection failures from task failures and avoids blindly resubmitting uncertain requests.
- **Explicit cancellation** distinguishes a cancellation request from a confirmed terminal state.
- **Reliable result delivery** uses a local outbox and host-side deduplication where supported.
- **Independent adapters** keep protocol handling, a standalone CLI, and agent-host integrations separate.

The implementation roadmap starts with a compatible MCP Tasks / SDK / FastMCP combination and a small DeepSeek Harness integration probe. The client core is developed through a standalone CLI before full host integration.

## Architecture

```text
CLI / Agent host
       |
Host adapter
       |
Task coordinator ---- SQLite task records and delivery outbox
       |
MCP protocol adapter
       |
FastMCP server ---- Redis / Valkey ---- Docket workers
```

Server scheduling and execution are delegated to existing runtimes. Here, **durable** refers to client-side task tracking and recovery; it does not promise automatic checkpointing of arbitrary server code or exactly-once external side effects.

## Documentation

| Document | Contents |
| --- | --- |
| [Product scope](docs/product.md) | Use cases, boundaries, and acceptance criteria |
| [Architecture](docs/architecture.md) | Components, records, recovery, and delivery semantics |
| [Roadmap](docs/roadmap.md) | Milestones and decision gates |
| [Validation](docs/validation.md) | Protocol checks and fault-injection scenarios |
| [Research](docs/research.md) | Upstream references and assumptions to verify |
| [Decision record](docs/decisions/0001-scope-and-reuse.md) | Scope and reuse strategy |
| [Backlog](docs/backlog.md) | Development tasks and progress |

## Development

The proposed stack is TypeScript for the client and adapters, Python for a FastMCP example server, SQLite for local records, and Redis or Valkey for the server runtime. Dependency versions and executable setup instructions will be added with the compatibility milestone.

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidelines.

## License

[MIT](LICENSE) © 2026 Ruoyu Lu.
