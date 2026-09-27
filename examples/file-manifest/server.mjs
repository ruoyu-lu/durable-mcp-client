import { createServer } from 'node:http';
import { realpath, stat } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { McpServer, createMcpHandler } from '@modelcontextprotocol/server';
import { toNodeHandler, localhostHostValidation, localhostOriginValidation } from '@modelcontextprotocol/node';
import { TaskLifecycle, MemoryTaskStore } from 'mcp-durable-tasks';
import { z } from 'zod';
import { hashFiles } from './hash-files.mjs';

const { values } = parseArgs({ options: { root: { type: 'string' }, port: { type: 'string', default: '8001' } } });
if (!values.root) throw new Error('Usage: node examples/file-manifest/server.mjs --root <directory> [--port <port>]');
const root = await realpath(values.root);
if (!(await stat(root)).isDirectory()) throw new Error('Root must be a directory');
const port = Number(values.port);
if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid port');
const extension = 'io.modelcontextprotocol/tasks';
const version = '2026-07-28';
// Reuse the published lifecycle. This example survives client restarts only.
const tasks = new TaskLifecycle({ store: new MemoryTaskStore(), defaultTtlMs: 3600000, defaultPollIntervalMs: 250, sweepIntervalMs: 60000 });

async function work(taskId, paths) {
  const task = tasks.handle(taskId);
  try {
    const manifest = await hashFiles(root, paths, task.signal, message => task.progress(message));
    await task.complete({ content: [{ type: 'text', text: JSON.stringify(manifest) }], structuredContent: manifest });
  } catch (error) {
    if (task.signal.aborted) await task.cancelled('File hashing cancelled');
    else await task.fail({ code: -32603, message: String(error) });
  }
}

const handler = createMcpHandler(() => {
  const mcp = new McpServer({ name: 'file-manifest', version: '1.0.0' }, { capabilities: { extensions: { [extension]: {} } } });
  mcp.registerTool('hash_files', {
    description: 'Stream SHA-256 checksums for up to 100 relative files under the configured root.',
    inputSchema: { paths: z.array(z.string().min(1).max(1024)).min(1).max(100) },
  }, async ({ paths }, context) => {
    if (!context.mcpReq.envelope?.['io.modelcontextprotocol/clientCapabilities']?.extensions?.[extension]) throw new Error('The Tasks extension is required');
    const created = await tasks.createTask({ statusMessage: 'Queued file manifest' });
    // A worker failure after expiry/shutdown must not become an unhandled rejection.
    void work(created.taskId, paths).catch(error => console.error('Worker stopped:', String(error)));
    return created;
  });
  return mcp;
}, { legacy: 'reject' });
const nodeHandler = toNodeHandler(handler);
const validHost = localhostHostValidation(), validOrigin = localhostOriginValidation();
const reply = (res, id, payload) => {
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ jsonrpc: '2.0', id, ...payload }));
};

const server = createServer((req, res) => {
  if (!validHost(req, res) || !validOrigin(req, res)) return;
  if (req.url !== '/mcp' || req.method !== 'POST') { res.writeHead(404); res.end(); return; }
  void (async () => {
    let bytes = 0, chunks = [];
    for await (const chunk of req) {
      bytes += chunk.length;
      if (bytes > 256 * 1024) { res.writeHead(413); res.end(); return; }
      chunks.push(chunk);
    }
    let body;
    try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
    catch { return reply(res, null, { error: { code: -32700, message: 'Invalid JSON' } }); }
    if (!body || body.jsonrpc !== '2.0' || typeof body.method !== 'string' || !['string', 'number'].includes(typeof body.id)) {
      return reply(res, null, { error: { code: -32600, message: 'Expected a JSON-RPC request' } });
    }
    if (!body.method.startsWith('tasks/')) return nodeHandler(req, res, body);
    // SDK 2.0.0 rejects retired tasks/get and tasks/cancel before custom handlers.
    // Keep the upstream example's middleware workaround confined to this server.
    const params = body.params;
    if (req.headers['mcp-method'] !== body.method || req.headers['mcp-name'] !== params?.taskId
      || req.headers['mcp-protocol-version'] !== version || params?._meta?.['io.modelcontextprotocol/protocolVersion'] !== version
      || !params?._meta?.['io.modelcontextprotocol/clientCapabilities']?.extensions?.[extension]
      || typeof params?.taskId !== 'string') {
      return reply(res, body.id, { error: { code: -32602, message: 'Invalid Tasks request metadata' } });
    }
    try {
      let result;
      if (body.method === 'tasks/get') result = await tasks.getTask(params.taskId);
      else if (body.method === 'tasks/cancel') result = await tasks.cancelTask(params.taskId);
      else if (body.method === 'tasks/update') result = await tasks.updateTask(params.taskId, params.inputResponses ?? {});
      else return reply(res, body.id, { error: { code: -32601, message: 'Unknown method' } });
      reply(res, body.id, { result });
    } catch (error) {
      reply(res, body.id, { error: { code: -32602, message: String(error) } });
    }
  })().catch(error => {
    console.error(String(error));
    if (!res.headersSent) res.writeHead(500);
    res.end();
  });
});
server.listen(port, '127.0.0.1', () => console.log(`listening ${server.address().port}`));
for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => {
  server.close(); server.closeAllConnections();
  void Promise.all([handler.close(), tasks.close()]).finally(() => process.exit(0));
});
