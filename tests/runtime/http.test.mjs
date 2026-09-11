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
