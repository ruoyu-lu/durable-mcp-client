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

Core interoperability versions are pinned in `requirements.txt`; transitive dependencies are resolved by pip. This example uses an explicitly in-memory Docket backend: **client restarts are tested, server restarts lose tasks**. Redis persistence, authentication, cancellation, input and SSE remain separate work. See the [FastMCP background task documentation](https://gofastmcp.com/servers/tasks).
