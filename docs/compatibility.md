# MCP Tasks compatibility baseline

## Pinned source

The initial adapter target is the **2026-07-28** Tasks extension, pinned to [ext-tasks commit 9263312d11a682ac83f83fe84794d4627efd22f5](https://github.com/modelcontextprotocol/ext-tasks/blob/9263312d11a682ac83f83fe84794d4627efd22f5/specification/2026-07-28/tasks.md). The machine-readable [source pin](protocol-baseline.json) includes the SHA-256 of the decoded source file. This is a source-level baseline, not a claim that a working SDK/server combination has been established.

Reviewed on 2026-09-08 for [issue #1](https://github.com/ruoyu-lu/durable-mcp-client/issues/1). All section links below target the immutable source. Later upstream changes require an explicit compatibility review.

## Implementation matrix

| Area | Pinned requirement | Client consequence |
| --- | --- | --- |
| [Capabilities](https://github.com/modelcontextprotocol/ext-tasks/blob/9263312d11a682ac83f83fe84794d4627efd22f5/specification/2026-07-28/tasks.md#capability-negotiation) | Advertise the extension inside per-request client capabilities; server advertises through `server/discover`. No extension-specific settings. | Include the capability on task operations as well as eligible calls. Do not rely on a previous declaration. |
| [Supported methods](https://github.com/modelcontextprotocol/ext-tasks/blob/9263312d11a682ac83f83fe84794d4627efd22f5/specification/2026-07-28/tasks.md#supported-methods) | Only `tools/call` is currently task-augmentable. | Reject a task result on an unsupported request type. |
| [Creation](https://github.com/modelcontextprotocol/ext-tasks/blob/9263312d11a682ac83f83fe84794d4627efd22f5/specification/2026-07-28/tasks.md#task-creation) | Server decides whether to return a task. `resultType: "task"` identifies the response; fields are flat in the declared type and example. Handle must be queryable before response. | Accept direct results too. Save the returned handle immediately; do not add a speculative creation-wait phase. |
| [Task metadata](https://github.com/modelcontextprotocol/ext-tasks/blob/9263312d11a682ac83f83fe84794d4627efd22f5/specification/2026-07-28/tasks.md#tasks) | `taskId`, status, creation/update timestamps and `ttlMs` are present; `pollIntervalMs` and status message are optional. | Retain the metadata; TTL is measured from creation, can change, and may be null. |
| [Polling](https://github.com/modelcontextprotocol/ext-tasks/blob/9263312d11a682ac83f83fe84794d4627efd22f5/specification/2026-07-28/tasks.md#task-polling) | `tasks/get` returns detailed state with `resultType: "complete"`. Clients SHOULD respect the current suggested interval and persist IDs. | Result retrieval is in `tasks/get`, not a separate `tasks/result` call. |
| [Execution errors](https://github.com/modelcontextprotocol/ext-tasks/blob/9263312d11a682ac83f83fe84794d4627efd22f5/specification/2026-07-28/tasks.md#task-execution-errors) | JSON-RPC execution errors use `failed` plus `error`. Tool-level `isError: true` uses `completed` plus `result`. | Preserve protocol completion separately from business success. |
| [Input](https://github.com/modelcontextprotocol/ext-tasks/blob/9263312d11a682ac83f83fe84794d4627efd22f5/specification/2026-07-28/tasks.md#task-update-requests) | `inputRequests` keys are unique for the task lifetime; answers go in `tasks/update` with `inputResponses`. Successful acknowledgement is eventually consistent. | Persist presentation/answer state, deduplicate keys, and keep observing after acknowledgement. Do not retry the original tool to answer a task input request. |
| [Partial/stale input](https://github.com/modelcontextprotocol/ext-tasks/blob/9263312d11a682ac83f83fe84794d4627efd22f5/specification/2026-07-28/tasks.md#task-update-requests) | Server MAY accept partial responses and SHOULD ignore keys no longer outstanding. | Do not assume every server implements identical stale-answer behavior; verify in T005. |
| [Cancellation](https://github.com/modelcontextprotocol/ext-tasks/blob/9263312d11a682ac83f83fe84794d4627efd22f5/specification/2026-07-28/tasks.md#task-cancellation) | Use `tasks/cancel`, never `notifications/cancelled`. The acknowledgement has `resultType: "complete"` and does not guarantee work stops. | Record intent independently. Completion can win the race. |
| [HTTP routing](https://github.com/modelcontextprotocol/ext-tasks/blob/9263312d11a682ac83f83fe84794d4627efd22f5/specification/2026-07-28/tasks.md#streamable-http-routing-headers) | For get/update/cancel, `Mcp-Name` MUST equal `params.taskId`; `Mcp-Method` follows the method name. | Verify SDK-generated headers on actual HTTP requests, not only decoded JSON. |
| [Missing task](https://github.com/modelcontextprotocol/ext-tasks/blob/9263312d11a682ac83f83fe84794d4627efd22f5/specification/2026-07-28/tasks.md#protocol-errors) | Invalid/nonexistent ID uses `-32602`: MUST for get, SHOULD for update/cancel. | Report task unavailable; do not infer business failure or nonexecution from absence. |
| [Missing capability](https://github.com/modelcontextprotocol/ext-tasks/blob/9263312d11a682ac83f83fe84794d4627efd22f5/specification/2026-07-28/tasks.md#protocol-errors) | Non-declaring task clients receive `-32021`. | Surface a compatibility error rather than an ordinary transient retry. |
| [Notifications](https://github.com/modelcontextprotocol/ext-tasks/blob/9263312d11a682ac83f83fe84794d4627efd22f5/specification/2026-07-28/tasks.md#task-status-notifications) | Optional `notifications/tasks` carries detailed state via subscriptions. Task progress/message notifications are not supported here. | MVP uses polling; do not equate framework progress helpers with standard task notification support. |
| [Authorization/discovery](https://github.com/modelcontextprotocol/ext-tasks/blob/9263312d11a682ac83f83fe84794d4627efd22f5/specification/2026-07-28/tasks.md#security-considerations) | Authorization checks apply to every task request; task IDs require sufficient entropy. There is no `tasks/list`. | Keep server/identity association and treat handles as sensitive. No standard list-based recovery of a lost handle. |

## Product policies, not protocol requirements

- Continue observing after requesting cancellation so the user can see the actual outcome. The specification permits deleting local state immediately after sending cancellation; our stronger observation policy is deliberate and does not make cancellation completion mandatory.
- Do not retry an uncertain non-idempotent submission. The pinned extension offers no `tasks/list` or standard submission idempotency key. A server-specific reconciliation contract may be added only after verification.
- Keep remote task state separate from local reachability, business success and session delivery state.
- Persist results and delivery intent together, and require a verified host contract before claiming deduplicated delivery.
- Preserve input trust and user-approval boundaries during restart recovery.

## Source inconsistencies requiring implementation checks

The Task Creation prose refers to an embedded `task` and `task.taskId`, while its type (`Result & Task`) and JSON example are flat. The adapter target follows the flat declared shape, but T002/T005 must check actual SDK types and wire output before implementation is accepted.

Notification type text uses the base Task while later prose requires a complete DetailedTask. Notifications are outside the initial polling-only scope; revisit this before implementing them.

Examples are illustrative and sometimes omit capability metadata or use inconsistent input payload names. Build probes from pinned types and normative clauses rather than copying example messages unchecked. No upstream issue has been filed; a minimal SDK reproduction is needed first.

## Compatibility status

| Component | Evidence | Status |
| --- | --- | --- |
| Tasks extension | Immutable source and digest; matrix above | Source baseline established |
| TypeScript SDK | `@modelcontextprotocol/client@2.0.0`, pinned in package-lock.json; fetch-seam tests below | Modern Tasks blocked in the public client API |
| FastMCP/tasks/Docket | Repository release lookup alone is insufficient | T002 pending |
| HTTP wire behavior | Real SDK serialization tested through an injected fetch responder; no sockets or FastMCP | T005 real-server probe pending |
| Harness | No source audit or plugin probe completed | T003/T004 pending |

Do not interpret these pending rows as successful interoperability.

## Reproduce the source check

With Python 3 and authenticated GitHub CLI available, fetch and hash the exact source without cloning moving branches:

```sh
gh api 'repos/modelcontextprotocol/ext-tasks/contents/specification/2026-07-28/tasks.md?ref=9263312d11a682ac83f83fe84794d4627efd22f5' --jq .content > /tmp/mcp-tasks-source.b64
python3 -c 'import base64, hashlib, pathlib; print(hashlib.sha256(base64.b64decode(pathlib.Path("/tmp/mcp-tasks-source.b64").read_bytes())).hexdigest())'
```

Compare the output with `sha256` in `docs/protocol-baseline.json`. This verifies source bytes, not protocol conformance. No application build or runtime tests are applicable to this documentation-only change.

## Published client probe (2026-09-08, Australia/Melbourne)

Install with `npm ci --ignore-scripts`, run `npm run check`, then `npm test` (Node 22 or newer). The lockfile pins the dependency tree. Tests use the published SDK and its public HTTP transport fetch hook with a controlled responder, not a real HTTP server or FastMCP process.

Observed with Node 24.1.0 and `@modelcontextprotocol/client@2.0.0`:

| Probe | Observed result |
| --- | --- |
| Pin modern protocol and call a synchronous tool | PASS: per-request capability metadata and MCP method/name/version headers are emitted |
| Receive flat `resultType: task` from tools/call | BLOCKED: `UNSUPPORTED_RESULT_TYPE` |
| Call tasks/get on the modern connection | BLOCKED: `METHOD_NOT_SUPPORTED_BY_PROTOCOL_VERSION`, before HTTP dispatch |

The tests assert these observed limitations to detect changes in the pinned baseline. A green test run does **not** mean Tasks interoperability works. No task routing headers or detailed task results were verified because the request never reached the transport. Do not advertise the Tasks capability in production until a working extension/adapter is established; the probe deliberately advertises it to test the response path.

The SDK's declared client options document a legacy default and explicit `versionNegotiation: { mode: { pin: '2026-07-28' } }`. Its discovery result schema requires `supportedVersions`, not a single `protocolVersion` field. Package metadata and installed declarations/behavior, rather than the monorepo root version, determine this finding.

The CLI now uses a replaceable JSON HTTP shim for the pinned Tasks contract. Socket-level tests cover submission, durable handle recovery, direct results and invalid observations. This does not establish FastMCP interoperability. Next T002 action: verify a minimal FastMCP example against this adapter. PyPI reports FastMCP 4.0.3 with the separate fastmcp-tasks 4.0.3 extra; this is metadata only, not an installed/verified runtime combination. T002 remains open in the backlog.
