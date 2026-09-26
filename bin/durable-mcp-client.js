#!/usr/bin/env node
const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 13)) {
  console.error('durable-mcp-client requires Node.js 22.13 or newer.');
  process.exitCode = 1;
} else {
  await import('../dist/cli.js');
}
