# Dependency review

Runtime dependencies are installed separately by npm; their own license and copyright notices remain with each package. No dependency source is bundled in this tarball.

The October 27, 2026 lockfile review covers Ajv 8.20.0, ajv-formats 3.0.1, fast-deep-equal 3.1.3, fast-uri 3.1.9, json-schema-traverse 1.0.0 and require-from-string 2.0.2. All declare MIT except fast-uri, which declares BSD-3-Clause. Transitive versions may vary within dependency ranges on a fresh install; review the installed dependency tree when publishing.

The MCP SDK and TypeScript compiler are development dependencies only. The pinned SDK client/server/core 2.4.0 and node 2.1.2 packages declare Apache-2.0 and retain their own notices in their installed packages; their source is not bundled in this CLI. The optional Python/FastMCP example is not distributed in the CLI package. This project is MIT licensed; see LICENSE.
