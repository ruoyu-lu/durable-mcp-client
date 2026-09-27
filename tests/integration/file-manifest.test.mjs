import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { spawn, execFile } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, mkdir, writeFile, open, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import { HttpTaskAdapter } from '../../dist/adapters/http.js';
const exec = promisify(execFile);

test('published Tasks runtime serves real file manifests across independent CLI processes', { timeout: 30000 }, async t => {
  const dir = await mkdtemp(join(tmpdir(), 'file-manifest-interop-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const root = join(dir, 'files'); await mkdir(root); await mkdir(join(root, 'nested'));
  const data = { 'empty.txt': '', 'nested/résumé.txt': 'hello 你好', 'large.txt': 'data'.repeat(65536) };
  for (const [path, text] of Object.entries(data)) await writeFile(join(root, path), text);
  const server = spawn(process.execPath, ['examples/file-manifest/server.mjs', '--root', root, '--port', '0'], { stdio: ['ignore', 'pipe', 'pipe'] });
  let logs = '', spawnError;
  server.on('error', error => { spawnError = error; });
  for (const stream of [server.stdout, server.stderr]) stream.on('data', chunk => { logs = (logs + chunk).slice(-20000); });
  t.after(async () => {
    if (!server.pid || server.exitCode !== null || server.signalCode !== null) return;
    const exited = once(server, 'exit'); server.kill('SIGTERM');
    const timer = setTimeout(() => server.kill('SIGKILL'), 3000);
    try { await exited; } finally { clearTimeout(timer); }
  });
  let port;
  const startupDeadline = Date.now() + 10000;
  while (!(port = logs.match(/listening (\d+)/)?.[1])) {
    if (spawnError) throw spawnError;
    if (server.exitCode !== null || Date.now() > startupDeadline) throw new Error(`Server failed: ${logs}`);
    await delay(25);
  }
  const upstream = `http://127.0.0.1:${port}/mcp`;
  const unsupported = await fetch(upstream, {
    method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'mcp-protocol-version': '2026-07-28', 'mcp-method': 'tools/call', 'mcp-name': 'hash_files' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 'no-tasks', method: 'tools/call', params: { name: 'hash_files', arguments: { paths: ['empty.txt'] }, _meta: {
      'io.modelcontextprotocol/protocolVersion': '2026-07-28',
      'io.modelcontextprotocol/clientInfo': { name: 'probe', version: '1.0.0' },
      'io.modelcontextprotocol/clientCapabilities': {},
    } } }),
  });
  const refused = await unsupported.json();
  assert.equal(refused.result.isError, true);
  assert.match(refused.result.content[0].text, /Tasks extension is required/);
  assert.equal(refused.result.taskId, undefined);
  const calls = [];
  const proxy = createServer((req, res) => {
    void (async () => {
      const chunks = []; for await (const chunk of req) chunks.push(chunk);
      const body = Buffer.concat(chunks); calls.push(JSON.parse(body));
      const headers = { ...req.headers }; delete headers.host; delete headers.connection; delete headers['content-length'];
      const response = await fetch(upstream, { method: 'POST', headers, body });
      res.writeHead(response.status, { 'content-type': response.headers.get('content-type') });
      res.end(Buffer.from(await response.arrayBuffer()));
    })().catch(error => { res.writeHead(502); res.end(String(error)); });
  });
  await new Promise(resolve => proxy.listen(0, '127.0.0.1', resolve));
  t.after(() => { proxy.closeAllConnections(); return new Promise(resolve => proxy.close(resolve)); });
  const endpoint = `http://127.0.0.1:${proxy.address().port}/mcp`;
  const run = async (...args) => JSON.parse((await exec(process.execPath, ['dist/cli.js', ...args, '--db', join(dir, 'client.sqlite'), '--server', endpoint], { timeout: 10000 })).stdout);
  const submitted = await run('submit', '--tool', 'hash_files', '--arguments', JSON.stringify({ paths: Object.keys(data) }));
  assert.equal(submitted.submission, 'accepted'); assert.equal(submitted.snapshot, null);
  // Observe completion outside the durable client's database. Its result remains uncached.
  const observer = new HttpTaskAdapter(upstream);
  let remote;
  const deadline = Date.now() + 10000;
  do { remote = await observer.query(submitted.remoteId); if (remote.status !== 'completed') await delay(25); }
  while (remote.status === 'working' && Date.now() < deadline);
  assert.equal(remote.status, 'completed', JSON.stringify(remote));
  assert.equal((await run('list'))[0].snapshot, null);
  const [recovered] = await run('recover');
  assert.equal(recovered.remoteId, submitted.remoteId); assert.equal(recovered.observationError, null);
  assert.equal(recovered.snapshot.status, 'completed');
  assert.equal(recovered.snapshot.statusMessage, 'Hashed 3 files');
  const expected = { algorithm: 'sha256', files: Object.entries(data).map(([path, text]) => ({ path, bytes: Buffer.byteLength(text), sha256: createHash('sha256').update(text).digest('hex') })) };
  assert.deepEqual(recovered.snapshot.result.structuredContent, expected);
  assert.deepEqual(JSON.parse(recovered.snapshot.result.content[0].text), expected);
  assert.deepEqual((await run('list'))[0], recovered);
  assert.deepEqual(await run('status', submitted.id), recovered);
  assert.deepEqual(await run('recover'), []);
  assert.equal(calls.filter(call => call.method === 'tools/call').length, 1);
  assert.deepEqual(calls.filter(call => call.method === 'tasks/get').map(call => call.params.taskId), [submitted.remoteId]);

  const invalid = await run('submit', '--tool', 'hash_files', '--arguments', '{"paths":["../outside.txt"]}');
  const failed = await run('wait', invalid.id, '--interval-ms', '25');
  assert.equal(failed.reason, 'terminal'); assert.equal(failed.task.snapshot.status, 'failed');
  assert.match(failed.task.snapshot.error, /inside the root/);
  assert.equal(calls.filter(call => call.method === 'tools/call').length, 2);
  // A sparse input repeated in the batch keeps real hashing active until cancellation.
  const large = await open(join(root, 'cancellable.bin'), 'w');
  try { await large.truncate(64 * 1024 * 1024); } finally { await large.close(); }
  const cancellable = await run('submit', '--tool', 'hash_files', '--arguments', JSON.stringify({ paths: Array(100).fill('cancellable.bin') }));
  const working = await run('status', cancellable.id);
  assert.equal(working.snapshot.status, 'working'); assert.match(working.snapshot.statusMessage, /^Hashing \d+\/100:/);
  assert.deepEqual((await run('list')).find(task => task.id === working.id), working);
  const ack = await run('cancel', cancellable.id);
  assert.equal(ack.cancellation.outcome, 'acknowledged');
  const stopped = await run('wait', cancellable.id, '--interval-ms', '25', '--timeout-ms', '5000');
  assert.equal(stopped.task.snapshot.status, 'cancelled');
  assert.equal(stopped.task.snapshot.statusMessage, 'File hashing cancelled');
  assert.equal(calls.filter(call => call.method === 'tools/call').length, 3);
  assert.equal(calls.filter(call => call.method === 'tasks/cancel').length, 1);
  const forbidden = await fetch(upstream, { method: 'POST', headers: { origin: 'https://untrusted.example' }, body: '{}' });
  assert.equal(forbidden.status, 403); await forbidden.body?.cancel();
});
