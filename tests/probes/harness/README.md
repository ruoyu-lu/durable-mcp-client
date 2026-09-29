# Harness handoff feasibility

Verified 2026-09-29 with Node 24.1.0. This isolated probe characterizes published Harness `0.2.0-rc.1` packages and Cordis `4.0.4`; the lockfile pins transitive packages. These are not CLI dependencies or a supported host adapter.

```sh
npm --prefix tests/probes/harness ci --ignore-scripts --legacy-peer-deps=false
npm --prefix tests/probes/harness test
```

No model, credentials or remote MCP server is used. Synthetic input exercises the real agent loop, session projection and JSONL persistence. The bridge test injects a raw Tasks result into the public tool-definition boundary; it is not a network interoperability test.

| Probe | Observed contract |
| --- | --- |
| Required Tasks tool | Built-in bridge refuses before invoking the callback |
| Optional raw task result | Bridge produces empty content without retaining the task ID |
| Flush without persistence | Resolves `false`; resolution alone is not a durable receipt |
| JSONL flush then SIGKILL | Queued input recovers in a new host context after the writer process is confirmed killed |
| JSONL flush then normal disposal | Pending input is canceled and removed; the durable log records the cancellation |
| Direct custom event append | Flush succeeds, but session resume rejects the unknown event without an `ignorable` envelope marker |
| Reusing a message ID | Duplicate pending input is rejected, but the same ID is accepted after removal |

The crash test waits for the writer's post-flush IPC signal, keeps it alive, verifies the `SIGKILL` exit signal, then opens the same JSONL directory. It does not use graceful disposal as a crash surrogate. No power-loss, model consumption, automatic continuation or exactly-once delivery guarantee is established. Unknown external events require an `ignorable` envelope marker, but the inspected public `Session.append` implementation does not expose that marker. Mutating the known-event catalog or persisted JSONL is not a supported workaround. A separate association store remains possible and untested here. The normal-disposal behavior may be intentional; the probe is not an upstream bug verdict.

## Decision

Built-in inbox persistence exists. Direct custom-event append does not establish a recoverable task/session association: the persisted record is rejected on resume. The built-in MCP bridge and queued-input acknowledgment are also insufficient for the proposed durable result-delivery contract. A custom adapter could reuse this project's CLI/HTTP boundary, but it must also define a supported association store, shutdown cancellation, historical deduplication, persist-before-ack, generated-message attribution and input presentation. No outbox or host fork is justified without a concrete agent workflow requiring those semantics.

R4 integration remains deferred; this completes its one bounded feasibility investigation, not its end-to-end acceptance gate. Keep the standalone CLI usable. Revisit only for a specific host workflow or a relevant contract/version change; do not repeat this investigation every daily run.

## Source inspection

Source inspected separately at [4878cdabd87d4041bdaff61d04c966883b9fd07a](https://github.com/deepseek-ai/deepseek-harness/tree/4878cdabd87d4041bdaff61d04c966883b9fd07a). No package-to-commit equivalence is asserted.

- [MCP bridge](https://github.com/deepseek-ai/deepseek-harness/blob/4878cdabd87d4041bdaff61d04c966883b9fd07a/packages/mcp/mcp-client/src/tools.ts): task-required refusal and result normalization. Reading the schema validator alone does not establish whether a task-shaped result is rejected; the published-package probe above measures that behavior.
- [Session store](https://github.com/deepseek-ai/deepseek-harness/blob/4878cdabd87d4041bdaff61d04c966883b9fd07a/packages/core/session/src/index.ts): synchronous append versus asynchronous flush.
- [Inbox](https://github.com/deepseek-ai/deepseek-harness/blob/4878cdabd87d4041bdaff61d04c966883b9fd07a/packages/core/agent-loop/src/inbox.ts) and [agent lifecycle](https://github.com/deepseek-ai/deepseek-harness/blob/4878cdabd87d4041bdaff61d04c966883b9fd07a/packages/core/agent-loop/src/index.ts): persisted splices and disposal cancellation.
- [Session-controller commands](https://github.com/deepseek-ai/deepseek-harness/blob/4878cdabd87d4041bdaff61d04c966883b9fd07a/packages/api/session-controller/src/commands.ts): prompt acceptance does not itself await a storage flush. Its user-prompt identity is not a proposed attribution mechanism for generated task results.
