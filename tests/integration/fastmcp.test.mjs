import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn, execFile } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';

const exec = promisify(execFile);

test('FastMCP background hashes survive CLI restart and match independent digests', { timeout: 60000 }, async t => {
  const dir = await mkdtemp(join(tmpdir(), 'durable-fastmcp-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const server = spawn(process.env.FASTMCP_PYTHON ?? 'python3', ['examples/fastmcp/server.py', '--port', '0'], { stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, FASTMCP_DOCKET_URL: 'memory://' } });
  let logs = '', spawnError;
  server.on('error', error => { spawnError = error; });
  server.stdout.on('data', chunk => { logs = (logs + chunk).slice(-20000); });
  server.stderr.on('data', chunk => { logs = (logs + chunk).slice(-20000); });
  t.after(async () => {
    if (server.exitCode !== null || server.signalCode !== null || !server.pid) return;
    const exited = once(server, 'exit');
    server.kill('SIGTERM');
    const timer = setTimeout(() => server.kill('SIGKILL'), 5000);
    try { await exited; } finally { clearTimeout(timer); }
  });
  let port;
  const startupDeadline = Date.now() + 20000;
  while (!(port = logs.match(/Uvicorn running on http:\/\/127\.0\.0\.1:(\d+)/)?.[1])) {
    if (spawnError) throw spawnError;
    if (server.exitCode !== null || Date.now() > startupDeadline) throw new Error(`FastMCP startup failed: ${logs}`);
    await delay(100);
  }
  const endpoint = `http://127.0.0.1:${port}/mcp`;
  const run = async (...args) => JSON.parse((await exec(process.execPath, ['dist/cli.js', ...args, '--db', join(dir, 'tasks.sqlite'), '--server', endpoint], { timeout: 10000 })).stdout);
  const texts = ['hello', '', '你好', 'hello'];
  const submitted = await run('submit', '--tool', 'hash_batch', '--arguments', JSON.stringify({ texts, delay_ms: 2000 }));
  assert.equal(submitted.submission, 'accepted');
  assert.equal(submitted.snapshot, null);
  assert.ok(submitted.remoteId && !submitted.remoteId.startsWith('direct:'));
  const pending = await run('status', submitted.id);
  assert.equal(pending.observationError, null);
  assert.equal(pending.snapshot.status, 'working');
  const waited = await run('wait', submitted.id, '--interval-ms', '100', '--timeout-ms', '15000');
  assert.equal(waited.reason, 'terminal');
  const completed = waited.task;
  assert.ok(completed, `Task did not finish: ${logs}`);
  assert.equal(completed.id, submitted.id);
  assert.equal(completed.remoteId, submitted.remoteId);
  assert.deepEqual(completed.snapshot.result.structuredContent.digests, texts.map(text => createHash('sha256').update(text).digest('hex')));
  assert.equal((await run('list')).length, 1);
  assert.deepEqual(await run('recover'), []);
  assert.deepEqual(await run('status', submitted.id), completed);
  const cancellable = await run('submit', '--tool', 'hash_batch', '--arguments', JSON.stringify({ texts, delay_ms: 10000 }));
  const acknowledged = await run('cancel', cancellable.id);
  assert.equal(acknowledged.cancellation.outcome, 'acknowledged');
  assert.equal(acknowledged.snapshot, null, 'An ack alone cannot establish remote status');
  let cancelled;
  const cancelDeadline = Date.now() + 10000;
  while (Date.now() < cancelDeadline) {
    const record = await run('status', cancellable.id);
    assert.equal(record.observationError, null);
    if (record.snapshot.status === 'cancelled') { cancelled = record; break; }
    assert.equal(record.snapshot.status, 'working');
    await delay(250);
  }
  assert.ok(cancelled, 'FastMCP must confirm cancellation in this example');
  assert.equal(cancelled.remoteId, cancellable.remoteId);
  assert.deepEqual(await run('cancel', cancellable.id), cancelled);

  const interactive = await run('submit', '--tool', 'choose_label');
  const inputWait = await run('wait', interactive.id, '--interval-ms', '100', '--timeout-ms', '10000');
  assert.equal(inputWait.reason, 'input_required');
  const waiting = inputWait.task;
  assert.ok(waiting, `No input request: ${logs}`);
  const [key, request] = Object.entries(waiting.snapshot.inputRequests)[0];
  assert.equal(request.method, 'elicitation/create');
  assert.equal(request.params.requestedSchema.properties.label.type, 'string');
  assert.deepEqual((await run('list')).find(r => r.id === interactive.id).snapshot, waiting.snapshot);
  await assert.rejects(run('respond', interactive.id, `--request-key=${key}`, '--response', JSON.stringify({ action: 'accept', content: { label: 42 } })), /Invalid form content/);
  const afterInvalid = (await run('list')).find(r => r.id === interactive.id);
  assert.equal(afterInvalid.inputResponses, undefined, 'Local rejection must not reserve the key');
  assert.equal((await run('status', interactive.id)).snapshot.status, 'input_required');
  const response = { action: 'accept', content: { label: 'reviewed batch' } };
  const reply = await run('respond', interactive.id, `--request-key=${key}`, '--response', JSON.stringify(response));
  assert.equal(reply.inputResponses[0].outcome, 'acknowledged');
  let finished;
  const finishDeadline = Date.now() + 10000;
  while (Date.now() < finishDeadline) {
    const record = await run('status', interactive.id);
    assert.equal(record.observationError, null);
    if (record.snapshot.status === 'completed') { finished = record; break; }
    assert.ok(['working', 'input_required'].includes(record.snapshot.status));
    await delay(250);
  }
  assert.ok(finished, `Input task did not complete: ${logs}`);
  assert.equal(finished.snapshot.result.isError, false, JSON.stringify(finished.snapshot.result));
  assert.deepEqual(JSON.parse(finished.snapshot.result.content[0].text), { label: 'reviewed batch' });
  assert.equal(finished.remoteId, interactive.remoteId);
  assert.equal(finished.snapshot.inputRequests, undefined);

});
