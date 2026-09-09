# Durable MCP Client

A client-side approach to managing long-running MCP tasks across disconnects and restarts.

Durable MCP Client focuses on keeping remote tasks connected to the people and agent sessions that started them: tracking task handles, resuming observation, handling input requests, and delivering results reliably.

## Design

- **Persistent task records** associate remote task IDs with their server, caller identity, and originating session.
- **Recovery coordination** separates connection failures from task failures and avoids blindly resubmitting uncertain requests.
- **Explicit cancellation** distinguishes a cancellation request from a confirmed terminal state.
- **Reliable result delivery** uses a local outbox and host-side deduplication where supported.
- **Independent adapters** keep protocol handling, a standalone CLI, and agent-host integrations separate.

The SQLite coordinator and standalone CLI can run against the included demo adapter. MCP and host integrations are developed behind replaceable adapter boundaries.

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
| [Compatibility baseline](docs/compatibility.md) | Pinned Tasks contract and outstanding implementation checks |
| [Research](docs/research.md) | Upstream references and assumptions to verify |
| [Decision record](docs/decisions/0001-scope-and-reuse.md) | Scope and reuse strategy |
| [Backlog](docs/backlog.md) | Development tasks and progress |

## Run the CLI

Requires Node 22.13 or newer. This version uses Node's built-in SQLite, which may emit an experimental-feature warning.

```sh
npm ci --ignore-scripts
npm run build
node dist/cli.js submit --text "hello after restart" --delay-ms 1000
# Exit the shell/process if desired. Reuse the same database path.
node dist/cli.js list
node dist/cli.js recover
node dist/cli.js status <task-id>
```

Commands return JSON. `--db PATH` selects the SQLite file (default `.runtime/tasks.sqlite`, relative to the current directory). Use the same absolute path when running from different directories. `status` refreshes one task; `recover` refreshes unfinished tasks once and exits. Unknown submissions are retained without automatic resubmission. Query errors are recorded separately from remote task status.

The included `demo-v1` adapter is a deterministic mock: its handle encodes a readiness time and result. It demonstrates client persistence across processes, not server scheduling or live MCP interoperability. The adapter interface allows replacing it without changing the SQLite coordinator. Cancellation, input handling, host delivery and continuous polling are not implemented yet. The database stores task input/results in plaintext; use non-sensitive demo data.

## Development

```sh
npm run check
npm test
```

Tests compile the TypeScript runtime and cover separate-process CLI recovery, persistent handles, unknown submissions, observation failures and terminal-state preservation. Additional SDK probes characterize known compatibility gaps. See [CONTRIBUTING.md](CONTRIBUTING.md) and the [compatibility baseline](docs/compatibility.md).

## License

[MIT](LICENSE) © 2026 Ruoyu Lu.
