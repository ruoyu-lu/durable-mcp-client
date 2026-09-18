import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { HttpTaskAdapter } from '../../dist/adapters/http.js';
const exec = promisify(execFile);

async function fixture(t, respond) {
  const calls = [];
  const server = createServer(async (req, res) => {
    let text = ''; for await (const chunk of req) text += chunk;
    const body = JSON.parse(text); calls.push(body);
    assert.equal(req.headers['mcp-method'], body.method);
    assert.equal(req.headers['mcp-protocol-version'], '2026-07-28');
    assert.deepEqual(body.params._meta['io.modelcontextprotocol/clientCapabilities'].extensions, { 'io.modelcontextprotocol/tasks': {} });
    if (body.method !== 'server/discover') assert.equal(req.headers['mcp-name'], body.params.name ?? body.params.taskId);
    const result = body.method === 'server/discover'
      ? { resultType: 'complete', supportedVersions: ['2026-07-28'], capabilities: { extensions: { 'io.modelcontextprotocol/tasks': {} } } }
      : respond(body);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ jsonrpc: '2.0', id: body.id, result }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  return { endpoint: `http://127.0.0.1:${server.address().port}/mcp`, calls };
}

test('live HTTP CLI persists handle and queries after process restart without resubmission', async t => {
  let offline = false;
  const { endpoint, calls } = await fixture(t, body => body.method === 'tools/call'
    ? { resultType: 'task', taskId: 'remote-1', status: 'malformed-initial-state' }
    : offline ? { resultType: 'complete', taskId: 'wrong-id', status: 'completed', result: {} }
    : { resultType: 'complete', taskId: 'remote-1', status: 'completed', result: { content: [{ type: 'text', text: 'real HTTP result' }] } });
  const dir = await mkdtemp(join(tmpdir(), 'mcp-http-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const run = async (...args) => JSON.parse((await exec(process.execPath, ['dist/cli.js', ...args, '--db', join(dir, 'tasks.sqlite'), '--server', endpoint])).stdout);
  const submitted = await run('submit', '--tool', 'batch', '--arguments', '{"count":2}');
  assert.equal(submitted.remoteId, 'remote-1'); assert.equal(submitted.submission, 'accepted'); assert.equal(submitted.snapshot, null);
  offline = true;
  const failedObservation = await run('status', submitted.id);
  assert.match(failedObservation.observationError, /Invalid task snapshot/); assert.equal(failedObservation.snapshot, null);
  offline = false;
  const [recovered] = await run('recover');
  assert.equal(recovered.id, submitted.id); assert.equal(recovered.snapshot.status, 'completed');
  assert.equal(recovered.snapshot.result.content[0].text, 'real HTTP result');
  assert.equal(recovered.observationError, null);
  await run('status', submitted.id);
  assert.equal(calls.filter(c => c.method === 'tools/call').length, 1);
  assert.equal(calls.filter(c => c.method === 'tasks/get').length, 2);
});

test('direct tool errors are completed results and endpoint identities are isolated', async t => {
  const { endpoint } = await fixture(t, () => ({ resultType: 'complete', content: [], isError: true }));
  const adapter = new HttpTaskAdapter(endpoint);
  const result = await adapter.submit({ name: 'tool', arguments: {} });
  assert.equal(result.snapshot.status, 'completed'); assert.equal(result.snapshot.result.isError, true);
  assert.equal(adapter.name, new HttpTaskAdapter(endpoint).name);
  assert.notEqual(adapter.name, new HttpTaskAdapter(`${endpoint}/other`).name);
  for (const url of ['file:///tmp/mcp', 'https://user:pass@example.com/mcp', 'https://example.com?key=secret']) assert.throws(() => new HttpTaskAdapter(url));
});

test('malformed terminal snapshots remain observation errors', async t => {
  const { endpoint } = await fixture(t, () => ({ resultType: 'complete', taskId: 'task', status: 'completed' }));
  await assert.rejects(new HttpTaskAdapter(endpoint).query('task'), /no result/);
});

test('HTTP cancellation routes task ID and validates acknowledgment', async t => {
  let valid = true;
  const { endpoint, calls } = await fixture(t, () => ({ resultType: valid ? 'complete' : 'task' }));
  const adapter = new HttpTaskAdapter(endpoint);
  await adapter.cancel('remote-task');
  assert.equal(calls[0].method, 'tasks/cancel'); assert.equal(calls[0].params.taskId, 'remote-task');
  valid = false;
  await assert.rejects(adapter.cancel('remote-task'), /Invalid cancellation acknowledgment/);
});

test('CLI retains outstanding input across restart and malformed observations', async t => {
  const inputRequests = { approval: { method: 'elicitation/create', params: {
    mode: 'form', message: 'Choose a label', requestedSchema: { type: 'object', properties: { label: { type: 'string' } } },
  } } };
  let state = 'input_required', malformed = false;
  const { endpoint, calls } = await fixture(t, body => body.method === 'tools/call'
    ? { resultType: 'task', taskId: 'input-task' }
    : { resultType: 'complete', taskId: 'input-task', status: state,
      ...(state === 'input_required' ? { inputRequests: malformed ? { approval: { method: 123 } } : inputRequests } : {}) });
  const dir = await mkdtemp(join(tmpdir(), 'mcp-input-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const run = async (...args) => JSON.parse((await exec(process.execPath, ['dist/cli.js', ...args, '--db', join(dir, 'tasks.sqlite'), '--server', endpoint])).stdout);
  const submitted = await run('submit', '--tool', 'interactive');
  const waiting = await run('status', submitted.id);
  assert.deepEqual(waiting.snapshot.inputRequests, inputRequests);
  assert.deepEqual((await run('list'))[0].snapshot, waiting.snapshot);
  assert.deepEqual((await run('recover'))[0].snapshot, waiting.snapshot);
  malformed = true;
  const invalid = await run('status', submitted.id);
  assert.match(invalid.observationError, /Invalid input request method/);
  assert.deepEqual(invalid.snapshot, waiting.snapshot);
  state = 'working';
  const resumed = await run('status', submitted.id);
  assert.equal(resumed.observationError, null);
  assert.deepEqual(resumed.snapshot, { status: 'working' });
  assert.equal(calls.filter(c => c.method === 'tools/call').length, 1);
  assert.equal(calls.filter(c => c.method === 'tasks/update').length, 0);
});

test('input-required responses must contain a request map with valid envelopes', async t => {
  let requests;
  const { endpoint } = await fixture(t, () => ({ resultType: 'complete', taskId: 'task', status: 'input_required', inputRequests: requests }));
  for (requests of [undefined, null, [], { key: null }, { key: { method: '' } }, { key: { method: 'custom/request', params: [] } }]) {
    await assert.rejects(new HttpTaskAdapter(endpoint).query('task'));
  }
  requests = { custom: { method: 'custom/request' } };
  assert.deepEqual((await new HttpTaskAdapter(endpoint).query('task')).inputRequests, requests);
});

test('CLI explicitly answers once across processes and continues observation', async t => {
  let answered = false;
  const response = { action: 'accept', content: { label: 'chosen' } };
  const { endpoint, calls } = await fixture(t, body => {
    if (body.method === 'tools/call') return { resultType: 'task', taskId: 'interactive' };
    if (body.method === 'tasks/update') {
      assert.deepEqual(body.params.inputResponses, { choice: response });
      answered = true; return { resultType: 'complete' };
    }
    return answered ? { resultType: 'complete', taskId: 'interactive', status: 'completed', result: { content: [] } }
      : { resultType: 'complete', taskId: 'interactive', status: 'input_required', inputRequests: { choice: { method: 'elicitation/create', params: { message: 'Choose' } } } };
  });
  const dir = await mkdtemp(join(tmpdir(), 'mcp-answer-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const run = async (...args) => JSON.parse((await exec(process.execPath, ['dist/cli.js', ...args, '--db', join(dir, 'tasks.sqlite'), '--server', endpoint])).stdout);
  const task = await run('submit', '--tool', 'interactive'); await run('status', task.id);
  const ack = await run('respond', task.id, '--request-key', 'choice', '--response', JSON.stringify(response));
  assert.equal(ack.inputResponses[0].outcome, 'acknowledged');
  assert.equal(ack.snapshot.status, 'input_required');
  await assert.rejects(run('respond', task.id, '--request-key', 'choice', '--response', JSON.stringify(response)), /already attempted/);
  assert.equal((await run('recover'))[0].snapshot.status, 'completed');
  assert.equal(calls.filter(c => c.method === 'tasks/update').length, 1);
});

test('HTTP query respects an external deadline while the server stalls', async t => {
  const server = createServer((_req, _res) => {});
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); return new Promise(resolve => server.close(resolve)); });
  const adapter = new HttpTaskAdapter(`http://127.0.0.1:${server.address().port}/mcp`);
  const start = performance.now();
  await assert.rejects(adapter.query('task', AbortSignal.timeout(30)), { name: 'TimeoutError' });
  assert.ok(performance.now() - start < 2000, 'External deadline must override the 30-second request timeout');
});
