import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { TaskStore } from '../../dist/store.js';
import { TaskCoordinator } from '../../dist/coordinator.js';

function database(t) {
  const dir = mkdtempSync(join(tmpdir(), 'durable-client-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return join(dir, 'tasks.sqlite');
}
function cli(db, ...args) {
  const child = spawnSync(process.execPath, [resolve('dist/cli.js'), ...args, '--db', db], { encoding: 'utf8', timeout: 10000 });
  assert.equal(child.status, 0, child.stderr || String(child.error));
  return JSON.parse(child.stdout);
}

test('CLI submit, process exit, reload, query and result survive independent processes', t => {
  const db = database(t);
  const submitted = cli(db, 'submit', '--text', 'persistent result', '--delay-ms', '0');
  const listed = cli(db, 'list');
  assert.equal(listed.length, 1);
  assert.equal(listed[0].id, submitted.id);
  const result = cli(db, 'status', submitted.id);
  assert.equal(result.submission, 'accepted');
  assert.deepEqual(result.snapshot, { status: 'completed', result: { text: 'persistent result' } });
  assert.equal(result.remoteId, submitted.remoteId);
});

test('reopened coordinator queries a stored handle without submitting again', async t => {
  const db = database(t);
  let store = new TaskStore(db);
  const initial = new TaskCoordinator(store, {
    name: 'controlled',
    submit: async () => ({ remoteId: 'remote-1', snapshot: { status: 'working' } }),
    query: async () => { throw new Error('Not called'); },
  });
  const submitted = await initial.submit({ text: 'input' });
  store.close();
  store = new TaskStore(db);
  t.after(() => store.close());
  const recovered = new TaskCoordinator(store, {
    name: 'controlled',
    submit: async () => { throw new Error('Must not resubmit'); },
    query: async remoteId => { assert.equal(remoteId, 'remote-1'); return { status: 'completed', result: 42 }; },
  });
  const [result] = await recovered.recover();
  assert.equal(result.id, submitted.id);
  assert.equal(result.snapshot.result, 42);
  assert.deepEqual(await recovered.recover(), []);
});

test('unknown submissions remain durable and are never retried by recovery', async t => {
  const store = new TaskStore(database(t));
  t.after(() => store.close());
  let submissions = 0;
  const coordinator = new TaskCoordinator(store, {
    name: 'uncertain',
    submit: async () => { submissions++; throw new Error('Response lost'); },
    query: async () => { throw new Error('Unknown handle must not be queried'); },
  });
  await assert.rejects(coordinator.submit({}), /Submission outcome unknown/);
  const [record] = await coordinator.recover();
  assert.equal(record.submission, 'unknown');
  assert.equal(record.remoteId, null);
  assert.match(record.observationError, /Response lost/);
  assert.equal(submissions, 1);
});

test('observation failure preserves remote state and later recovery clears the error', async t => {
  const store = new TaskStore(database(t));
  t.after(() => store.close());
  let connected = false;
  const coordinator = new TaskCoordinator(store, {
    name: 'unstable',
    submit: async () => ({ remoteId: 'job', snapshot: { status: 'working' } }),
    query: async () => { if (!connected) throw new Error('Offline'); return { status: 'completed', result: 'ok' }; },
  });
  const record = await coordinator.submit({});
  const offline = await coordinator.refresh(record.id);
  assert.equal(offline.snapshot.status, 'working');
  assert.match(offline.observationError, /Offline/);
  connected = true;
  const complete = await coordinator.refresh(record.id);
  assert.equal(complete.observationError, null);
  assert.equal(complete.snapshot.result, 'ok');
});

test('late observations cannot regress a terminal result', t => {
  const store = new TaskStore(database(t));
  t.after(() => store.close());
  const record = store.create('demo', {});
  store.accept(record.id, 'remote', { status: 'completed', result: 'retained' });
  assert.equal(store.observe(record.id, { status: 'working' }).snapshot.result, 'retained');
});

test('CLI rejects invalid arguments without creating task records', t => {
  const db = database(t);
  const child = spawnSync(process.execPath, [resolve('dist/cli.js'), 'submit', '--db', db, '--text', 'x', '--delay-ms', '-1'], { encoding: 'utf8' });
  assert.equal(child.status, 1);
  assert.deepEqual(cli(db, 'list'), []);
});


test('CLI recovers an initially working demo task in a new process', async t => {
  const db = database(t);
  const submitted = cli(db, 'submit', '--text', 'finished later', '--delay-ms', '300');
  assert.equal(submitted.snapshot.status, 'working');
  await new Promise(resolve => setTimeout(resolve, 350));
  const [result] = cli(db, 'recover');
  assert.equal(result.id, submitted.id);
  assert.equal(result.remoteId, submitted.remoteId);
  assert.deepEqual(result.snapshot, { status: 'completed', result: { text: 'finished later' } });
  assert.deepEqual(cli(db, 'recover'), []);
});


test('non-JSON input is rejected before remote submission or persistence', async t => {
  const store = new TaskStore(database(t));
  t.after(() => store.close());
  let calls = 0;
  const coordinator = new TaskCoordinator(store, {
    name: 'validation',
    submit: async () => { calls++; return { remoteId: 'x', snapshot: { status: 'working' } }; },
    query: async () => ({ status: 'working' }),
  });
  const cycle = {}; cycle.self = cycle;
  for (const input of [1n, cycle, { x: undefined }, NaN, -0, new Date(), [, 1], Object.assign([1], { extra: 2 })]) {
    await assert.rejects(coordinator.submit(input), /JSON|circular/);
  }
  assert.equal(calls, 0);
  assert.deepEqual(store.list(), []);
});

test('invalid result rolls back observation and preserves handle for later recovery', async t => {
  const store = new TaskStore(database(t));
  t.after(() => store.close());
  let result = 1n;
  const coordinator = new TaskCoordinator(store, {
    name: 'validation',
    submit: async () => ({ remoteId: 'retained', snapshot: { status: 'working' } }),
    query: async () => ({ status: 'completed', result }),
  });
  const submitted = await coordinator.submit({});
  const failed = await coordinator.refresh(submitted.id);
  assert.equal(failed.remoteId, 'retained');
  assert.equal(failed.snapshot.status, 'working');
  assert.match(failed.observationError, /JSON/);
  result = { value: 1 };
  assert.deepEqual((await coordinator.refresh(submitted.id)).snapshot.result, result);
});


test('late terminal observations do not write to SQLite or change timestamps', async t => {
  const { DatabaseSync } = await import('node:sqlite');
  const path = database(t);
  const store = new TaskStore(path);
  const observer = new DatabaseSync(path);
  t.after(() => { observer.close(); store.close(); });
  const record = store.create('demo', {});
  const terminal = store.accept(record.id, 'remote', { status: 'completed', result: 'stable' });
  const before = observer.prepare('PRAGMA data_version').get().data_version;
  const after = store.observe(record.id, { status: 'working' });
  assert.deepEqual(after, terminal);
  assert.equal(observer.prepare('PRAGMA data_version').get().data_version, before);
});

test('demo query normalizes malformed and invalid handles', async () => {
  const { DemoAdapter } = await import('../../dist/adapters/demo.js');
  const adapter = new DemoAdapter();
  for (const handle of ['{', 'null', '[]', '1', '{}', '{"readyAt":"bad","text":"x"}']) {
    await assert.rejects(adapter.query(handle), { name: 'Error', message: 'Invalid demo handle' });
  }
});


test('failed submission retains its original cause for diagnostics', async t => {
  const store = new TaskStore(database(t));
  t.after(() => store.close());
  const cause = new Error('Connection closed after write');
  const coordinator = new TaskCoordinator(store, {
    name: 'failure',
    submit: async () => { throw cause; },
    query: async () => ({ status: 'working' }),
  });
  await assert.rejects(coordinator.submit({}), error => {
    assert.equal(error.cause, cause);
    return true;
  });
  assert.equal(store.list()[0].observationError, cause.message);
});
