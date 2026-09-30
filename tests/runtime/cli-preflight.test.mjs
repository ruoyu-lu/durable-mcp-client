import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, existsSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { TaskStore } from '../../dist/store.js';

const exec = promisify(execFile);
test('CLI rejects local submission errors before persistence but preserves lost remote outcomes', async t => {
  const root = mkdtempSync(join(tmpdir(), 'durable-preflight-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const calls = [];
  const server = createServer(async (req, res) => {
    let raw = ''; for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw); calls.push(body.method);
    if (body.method === 'tools/call') { res.destroy(); return; }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ jsonrpc: '2.0', id: body.id, result: {
      resultType: 'complete', supportedVersions: ['2026-07-28'],
      capabilities: { extensions: { 'io.modelcontextprotocol/tasks': {} } },
    } }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const endpoint = `http://127.0.0.1:${server.address().port}/mcp`;
  const run = (db, ...args) => exec(process.execPath, [resolve('dist/cli.js'), 'submit', '--db', db, '--server', endpoint, ...args], { timeout: 10000 });
  const invalid = [
    ...['[]', 'null', 'true', '3', '"text"'].map(value => [['--tool', 'test', '--arguments', value], /--arguments must be a JSON object/]),
    [['--tool', 'test', '--arguments', '{'], /SyntaxError/],
    [['--tool', '   '], /non-empty --tool/],
    [['--tool', ''], /non-empty --tool/],
    [[], /non-empty --tool/],
  ];
  for (const [index, [args, message]] of invalid.entries()) {
    const directory = join(root, String(index));
    await assert.rejects(run(join(directory, 'tasks.sqlite'), ...args), error => {
      assert.equal(error.code, 1); assert.equal(error.stdout, ''); assert.match(error.stderr, message); return true;
    });
    assert.equal(existsSync(directory), false, 'Invalid input must not create a database directory');
  }
  const db = join(root, 'existing.sqlite');
  let store = new TaskStore(db);
  const existing = store.create('demo-v1', { text: 'retained' });
  store.close();
  await assert.rejects(run(db, '--tool', 'test', '--arguments', '[]'), /--arguments must be a JSON object/);
  store = new TaskStore(db);
  try { assert.deepEqual(store.list(), [existing]); } finally { store.close(); }
  assert.deepEqual(calls, [], 'Local validation must not send discovery or tool requests');

  await assert.rejects(run(db, '--tool', 'test', '--arguments', '{}'), /Submission outcome unknown/);
  store = new TaskStore(db);
  try {
    const records = store.list();
    assert.equal(records.length, 2);
    assert.deepEqual(records[0], existing);
    assert.equal(records[1].submission, 'unknown');
    assert.equal(records[1].remoteId, null);
    assert.deepEqual(records[1].input, { name: 'test', arguments: {} });
  } finally { store.close(); }
  const recovered = await exec(process.execPath, [resolve('dist/cli.js'), 'recover', '--db', db, '--server', endpoint], { timeout: 10000 });
  assert.equal(JSON.parse(recovered.stdout)[0].submission, 'unknown');
  assert.deepEqual(calls, ['server/discover', 'tools/call'], 'Recovery must not replay the lost tool call');
});
