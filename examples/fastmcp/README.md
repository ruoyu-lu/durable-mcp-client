# FastMCP background hashing

Requires Python 3.12+ and Node 22.13+. From the repository root:

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r examples/fastmcp/requirements.txt
npm ci --ignore-scripts
npm run build
.venv/bin/python examples/fastmcp/server.py
```

In another terminal:

```sh
node dist/cli.js submit --server http://127.0.0.1:8000/mcp --tool hash_batch --arguments '{"texts":["hello","world"],"delay_ms":5000}'
# Each command starts a new client process. Keep the server running.
node dist/cli.js recover --server http://127.0.0.1:8000/mcp
node dist/cli.js status <task-id> --server http://127.0.0.1:8000/mcp
```

Repeat recovery after the work delay. The result's `structuredContent.digests` contains ordered SHA-256 digests of UTF-8 strings. The example accepts at most 100 strings and a 0–10000 ms delay. It binds only to loopback and uses JSON HTTP responses with the modern Tasks extension.

Run the automated integration test:

```sh
FASTMCP_PYTHON=.venv/bin/python npm run test:fastmcp
```

The test starts a real FastMCP service on an OS-assigned port, submits a background task, queries through separate CLI processes, checks an intermediate working state and independently verifies each digest. It shuts down its server and removes its temporary SQLite database.

Core interoperability versions are pinned in `requirements.txt`; transitive dependencies are resolved by pip. This example uses an explicitly in-memory Docket backend: **client restarts are tested, server restarts lose tasks**. The integration also submits another task, sends `cancel`, and checks the eventual `cancelled` state from a new CLI process. To try this manually, run `node dist/cli.js cancel <task-id> --server http://127.0.0.1:8000/mcp` before the delay ends, then query its status. The background form-input flow is covered below and by the same integration test. Redis persistence, authentication, other input methods and SSE remain separate work. See the [FastMCP background task documentation](https://gofastmcp.com/servers/tasks).

## Answer a background input request

With the same server running:

```sh
node dist/cli.js submit --server http://127.0.0.1:8000/mcp --tool choose_label
node dist/cli.js status <task-id> --server http://127.0.0.1:8000/mcp
node dist/cli.js list
node dist/cli.js respond <task-id> --server http://127.0.0.1:8000/mcp --request-key='<key-from-snapshot.inputRequests>' --response '{"action":"accept","content":{"label":"reviewed batch"}}'
node dist/cli.js status <task-id> --server http://127.0.0.1:8000/mcp
```

Poll until input_required before answering. Use the equals form so keys beginning with a dash are accepted. Use the surfaced request key exactly: FastMCP assigns keys per task execution leg. Each command runs in a fresh client process, and `list` reads the saved request without contacting the server. Poll after the acknowledgment to retrieve the chosen label.

The tool returns `InputRequiredResult` to park the task, then reads a typed `ElicitResult` from `ctx.input_responses` when FastMCP re-enters it. It validates the accepted label before returning it. The integration first submits an invalid numeric label, verifies local rejection leaves the key unreserved, then sends a valid string and verifies the full cycle; no extra elicitation capability was required for this pinned background-task path. This does not establish standalone elicitation or other input-method support.
