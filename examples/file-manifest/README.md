# Local file manifests with a second Tasks runtime

Generate SHA-256 manifests for explicitly selected local files, leave the CLI, and retrieve the results later. The server reuses `mcp-durable-tasks` 0.2.1 for the task lifecycle and `@modelcontextprotocol/server` / `@modelcontextprotocol/node` 2.0.0 for modern MCP HTTP. These are development/example dependencies; the installed client does not depend on them.

## Run

From the repository root, install and build the client, then start the server against a trusted directory:

```sh
npm ci --ignore-scripts
npm run build
node examples/file-manifest/server.mjs --root ./examples/file-manifest --port 8001
```

In another terminal, from the same checkout:

```sh
node dist/cli.js submit --db .runtime/manifest.sqlite --server http://127.0.0.1:8001/mcp --tool hash_files --arguments '{"paths":["server.mjs","README.md"]}'
# Copy the local id from the JSON response. Every command is a separate process.
node dist/cli.js status <task-id> --db .runtime/manifest.sqlite --server http://127.0.0.1:8001/mcp
node dist/cli.js recover --db .runtime/manifest.sqlite --server http://127.0.0.1:8001/mcp
node dist/cli.js wait <task-id> --db .runtime/manifest.sqlite --server http://127.0.0.1:8001/mcp
```

For an installed client, replace `node dist/cli.js` with `durable-mcp-client`. Keep the exact endpoint and database path across restarts; use an absolute database path when changing directories.

`snapshot.statusMessage` reports the last observed progress, such as `Hashing 2/3: archive.zip`. The completed result's `structuredContent` contains `{ algorithm: "sha256", files: [{ path, bytes, sha256 }] }` in request order. The text content contains the same manifest as JSON. Small batches may finish before the first poll. `list` reads saved progress/results without contacting the server.

Use `cancel <task-id>` with the same endpoint/database to request cooperative cancellation. Hashing checks the signal between 64 KiB reads; poll again to confirm `cancelled`. Errors such as a missing file produce a failed task, not a successful partial manifest.

## Scope

- One local server process, JSON HTTP, protocol 2026-07-28; no authentication or SSE.
- The in-memory server keeps tasks for one hour from creation. **Only client restarts are covered here.** Stopping this server discards task state and running work. For completed-result retrieval after server restart, use the separate [Redis/FastMCP example](../fastmcp/README.md).
- Bindings are loopback-only with SDK Host/Origin guards. Use a trusted, stable directory; this is not a filesystem sandbox against concurrent directory replacement. Absolute/escaping paths, symlinks and non-regular files are rejected. Size/time checks detect ordinary changes during hashing; the manifest is not an atomic filesystem snapshot.
- At most 100 explicit file paths per request, each at most 1024 characters. Files are read in bounded chunks; no directory traversal or file writes are performed. Results and file names are stored in the client's plaintext database.
- The SDK's pinned protocol-era gate rejects Tasks methods before custom handlers. This example confines the verified HTTP middleware workaround to `tasks/*`, following the upstream [crash-recovery example](https://github.com/AndresSaa/mcp-durable-tasks/blob/b30fc6a1853309efdc360306091725155987a7cf/examples/crash-recovery/server.mts) (MIT). The task state machine is reused, not reimplemented.

## Verify

```sh
npm test
npm run test:manifest
```

The integration launches the real server and independent CLI processes. It checks empty/Unicode/multi-chunk digests, uncached result retrieval under the original handle, persisted progress, explicit cancellation, invalid paths and rejected cross-origin access. A recording proxy verifies exactly one submission per job. This establishes this workflow, not universal Tasks conformance or server crash recovery.
