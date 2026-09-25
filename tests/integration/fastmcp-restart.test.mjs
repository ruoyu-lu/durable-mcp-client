import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { spawn, execFile } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer as createTcpServer } from 'node:net';
import { createServer, request as httpRequest } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import { HttpTaskAdapter } from '../../dist/adapters/http.js';

const exec = promisify(execFile);

function start(command, args, env = process.env) {
  const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], env });
  let logs = '', error;
  child.on('error', value => { error = value; });
  for (const stream of [child.stdout, child.stderr]) {
    stream.on('data', chunk => { logs = (logs + chunk).slice(-20000); });
  }
  return { child, get logs() { return logs; }, get error() { return error; } };
}

async function stop(process, signal = 'SIGTERM') {
  const { child } = process;
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, 'exit');
  child.kill(signal);
  const timer = setTimeout(() => child.kill('SIGKILL'), 5000);
  try { await exited; } finally { clearTimeout(timer); }
}

async function ready(process, pattern) {
  const deadline = Date.now() + 20000;
  while (true) {
    if (process.error) throw process.error;
    if (process.child.exitCode !== null || process.child.signalCode !== null || Date.now() > deadline) {
      throw new Error(`Service startup failed: ${process.logs}`);
    }
    const match = process.logs.match(pattern);
    if (match) return match;
    await delay(50);
  }
}

async function availablePort() {
  const server = createTcpServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return port;
}

test('Redis retains an uncached result across FastMCP restart without resubmission', { timeout: 90000 }, async t => {
  const dir = await mkdtemp(join(tmpdir(), 'durable-fastmcp-restart-'));
  const children = [];
  let proxy;
  t.after(async () => {
    if (proxy) {
      proxy.closeAllConnections();
      await new Promise(resolve => proxy.close(resolve));
    }
    const stopped = await Promise.allSettled(children.toReversed().map(child => stop(child)));
    await rm(dir, { recursive: true, force: true });
    for (const result of stopped) if (result.status === 'rejected') throw result.reason;
  });
  const launch = (...args) => { const child = start(...args); children.push(child); return child; };
  // A fresh owned process/database, never a shared Redis instance. No disk durability claim.
  const redisPort = await availablePort();
  const redis = launch(process.env.REDIS_SERVER ?? 'redis-server', [
    '--bind', '127.0.0.1', '--port', String(redisPort), '--save', '', '--appendonly', 'no', '--dir', dir,
  ]);
  await ready(redis, /Ready to accept connections/);
  const env = { ...process.env, FASTMCP_DOCKET_URL: `redis://127.0.0.1:${redisPort}/0`,
    FASTMCP_DOCKET_NAME: `durable-restart-${randomUUID()}` };
  const python = process.env.FASTMCP_PYTHON ?? 'python3';
  const first = launch(python, ['examples/fastmcp/server.py', '--port', '0'], env);
  const port = (await ready(first, /Uvicorn running on http:\/\/127\.0\.0\.1:(\d+)/))[1];

  // Count all RPCs at the client's stable endpoint, including accidental resubmissions.
  const requests = [];
  proxy = createServer(async (req, res) => {
    try {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = Buffer.concat(chunks);
      const rpc = JSON.parse(body);
      requests.push({ method: rpc.method, taskId: rpc.params?.taskId });
      const upstream = httpRequest({ hostname: '127.0.0.1', port, path: req.url, method: req.method,
        headers: { ...req.headers, host: `127.0.0.1:${port}`, connection: 'close' } }, response => {
        res.writeHead(response.statusCode, response.headers);
        response.on('error', () => res.destroy());
        response.pipe(res);
      });
      upstream.on('error', () => res.destroy());
      upstream.end(body);
    } catch (error) { res.destroy(error); }
  });
  proxy.listen(0, '127.0.0.1');
  await once(proxy, 'listening');
  const endpoint = `http://127.0.0.1:${proxy.address().port}/mcp`;
  const run = async (...args) => JSON.parse((await exec(process.execPath,
    ['dist/cli.js', ...args, '--db', join(dir, 'tasks.sqlite'), '--server', endpoint], { timeout: 10000 })).stdout);
  const texts = ['persisted result', '', 'café', 'persisted result'];
  const submitted = await run('submit', '--tool', 'hash_batch', '--arguments', JSON.stringify({ texts, delay_ms: 100 }));
  assert.equal(submitted.submission, 'accepted');
  assert.equal(submitted.snapshot, null);
  assert.ok(submitted.remoteId && !submitted.remoteId.startsWith('direct:'));

  // Observe completion without TaskStore: do not cache the result in the CLI database.
  const observer = new HttpTaskAdapter(endpoint, 2000);
  const deadline = Date.now() + 15000;
  let remote;
  do {
    remote = await observer.query(submitted.remoteId);
    if (remote.status === 'completed') break;
    assert.equal(remote.status, 'working');
    await delay(100);
  } while (Date.now() < deadline);
  assert.equal(remote.status, 'completed', first.logs);
  assert.equal(remote.result.isError, false);
  assert.deepEqual(await run('list'), [submitted], 'The terminal result must not be in local SQLite');

  // Kill only the server after completion; Redis remains the same running process.
  await stop(first, 'SIGKILL');
  assert.equal(first.child.signalCode, 'SIGKILL');
  const outage = await run('status', submitted.id);
  assert.equal(outage.remoteId, submitted.remoteId);
  assert.equal(outage.submission, 'accepted');
  assert.equal(outage.snapshot, null);
  assert.equal(outage.observationErrorDetails.kind, 'transport');
  assert.ok(outage.observationError);
  assert.deepEqual(await run('list'), [outage]);

  const second = launch(python, ['examples/fastmcp/server.py', '--port', port], env);
  assert.equal((await ready(second, /Uvicorn running on http:\/\/127\.0\.0\.1:(\d+)/))[1], port);
  const beforeRecover = requests.length;
  const recovered = await run('recover');
  assert.equal(recovered.length, 1);
  const completed = recovered[0];
  assert.equal(completed.id, submitted.id);
  assert.equal(completed.remoteId, submitted.remoteId);
  assert.equal(completed.observationError, null);
  assert.equal(completed.observationErrorDetails, undefined);
  assert.equal(completed.snapshot.status, 'completed');
  assert.equal(completed.snapshot.result.isError, false);
  assert.deepEqual(completed.snapshot.result.structuredContent.digests,
    texts.map(text => createHash('sha256').update(text).digest('hex')));
  assert.deepEqual(requests.slice(beforeRecover), [{ method: 'tasks/get', taskId: submitted.remoteId }],
    'Recovery must fetch remotely using only the original handle');
  assert.deepEqual(await run('list'), [completed]);
  assert.equal(requests.filter(request => request.method === 'tools/call').length, 1, 'Never resubmit');
  assert.ok(requests.filter(request => request.method === 'tasks/get').every(request => request.taskId === submitted.remoteId));
  assert.equal(redis.child.exitCode, null);
  assert.equal(redis.child.signalCode, null);
});
