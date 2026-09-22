import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { TaskStore } from '../../dist/store.js';
import { TaskCoordinator } from '../../dist/coordinator.js';

function database(t) {
  const dir = mkdtempSync(join(tmpdir(), 'durable-snapshots-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return join(dir, 'tasks.sqlite');
}

const invalidSnapshots = [
  null, [], 'working', {}, { status: 'not-a-real-status' },
  { status: 'completed' }, { status: 'completed', result: undefined },
  { status: 'failed' }, { status: 'failed', error: { message: 'wrong shape' } },
  { status: 'input_required' }, { status: 'input_required', inputRequests: [] },
  { status: 'input_required', inputRequests: { key: null } },
  { status: 'input_required', inputRequests: { key: { method: '' } } },
  { status: 'input_required', inputRequests: { key: { method: 'elicitation/create', params: [] } } },
  { status: 'working', pollIntervalMs: -1 }, { status: 'working', pollIntervalMs: 1.5 },
  { status: 'working', pollIntervalMs: Number.MAX_SAFE_INTEGER + 1 },
  { status: 'working', pollIntervalMs: '100' }, { status: 'working', error: 123 },
];

test('invalid observations leave the prior record and SQLite data version unchanged across reopen', t => {
  const path = database(t);
  let store = new TaskStore(path);
  const observer = new DatabaseSync(path);
  try {
    const task = store.create('validation', {});
    store.accept(task.id, 'kept-handle', { status: 'working', pollIntervalMs: 100 });
    const before = store.recordError(task.id, 'earlier reachability failure');
    const version = observer.prepare('PRAGMA data_version').get().data_version;
    let getterCalls = 0;
    const accessor = { get status() { getterCalls++; return 'completed'; } };
    for (const snapshot of [...invalidSnapshots, accessor]) {
      assert.throws(() => store.observe(task.id, snapshot), /snapshot|JSON/i);
      assert.deepEqual(store.get(task.id), before);
      assert.equal(observer.prepare('PRAGMA data_version').get().data_version, version);
    }
    assert.equal(getterCalls, 0, 'Validation must not execute payload getters');
    store.close(); store = new TaskStore(path);
    assert.deepEqual(store.get(task.id), before);
    const recovered = store.observe(task.id, { status: 'completed', result: null });
    assert.equal(recovered.remoteId, 'kept-handle');
    assert.equal(recovered.observationError, null);
    assert.deepEqual(recovered.snapshot, { status: 'completed', result: null });
  } finally { observer.close(); store.close(); }
});

test('invalid initial state preserves accepted handles for recovery after reopen without resubmission', async t => {
  const path = database(t);
  let store = new TaskStore(path), submissions = 0;
  const seeds = [{ status: 'bad' }, { status: 'completed' }, { status: 'failed' }, { status: 'input_required' }];
  const submitted = [];
  try {
    const coordinator = new TaskCoordinator(store, {
      name: 'validation',
      submit: async () => ({ remoteId: `remote-${++submissions}`, snapshot: seeds[submissions - 1] }),
      query: async () => { throw new Error('Not queried before restart'); },
    });
    for (const _ of seeds) {
      const task = await coordinator.submit({});
      assert.equal(task.submission, 'accepted');
      assert.equal(task.remoteId, `remote-${submissions}`);
      assert.equal(task.snapshot, null);
      assert.match(task.observationError, /snapshot/i);
      submitted.push(task);
    }
    store.close(); store = new TaskStore(path);
    assert.deepEqual(store.list(), submitted);
    const queried = [];
    const recovered = await new TaskCoordinator(store, {
      name: 'validation',
      submit: async () => { throw new Error('Must not resubmit'); },
      query: async remoteId => { queried.push(remoteId); return { status: 'completed', result: remoteId }; },
    }).recover();
    assert.deepEqual(queried, submitted.map(task => task.remoteId));
    assert.deepEqual(recovered.map(task => task.id), submitted.map(task => task.id));
    assert.ok(recovered.every(task => task.snapshot.result === task.remoteId && task.observationError === null));
    assert.equal(submissions, seeds.length);
  } finally { store.close(); }
});

test('store acceptance retains a handle even when an optional initial snapshot is invalid', t => {
  const path = database(t);
  let store = new TaskStore(path);
  try {
    for (const snapshot of [{ status: 'invalid' }, { status: 'completed' }, { status: 'completed', result: 1n }]) {
      const task = store.create('validation', {});
      const accepted = store.accept(task.id, 'kept-handle', snapshot);
      assert.equal(accepted.submission, 'accepted');
      assert.equal(accepted.remoteId, 'kept-handle');
      assert.equal(accepted.snapshot, null);
      assert.match(accepted.observationError, /snapshot|JSON/i);
      store.close(); store = new TaskStore(path);
      assert.deepEqual(store.get(task.id), accepted);
      assert.equal(store.observe(task.id, { status: 'completed', result: 'recovered' }).observationError, null);
    }
  } finally { store.close(); }
});

for (const snapshot of [
  { status: 'completed', result: { value: 42 } },
  { status: 'failed', error: 'remote execution failed' },
  { status: 'cancelled' },
]) {
  test(`a late failing poll cannot write after another connection commits ${snapshot.status}`, async t => {
    const path = database(t);
    const slowStore = new TaskStore(path), fastStore = new TaskStore(path);
    const observer = new DatabaseSync(path);
    let rejectQuery, queryStarted, terminal;
    const started = new Promise(resolve => { queryStarted = resolve; });
    const query = new Promise((_, reject) => { rejectQuery = reject; });
    try {
      const task = slowStore.create('race', {});
      slowStore.accept(task.id, 'remote', { status: 'working' });
      const slow = new TaskCoordinator(slowStore, { name: 'race', query: async () => { queryStarted(); return query; } });
      const fast = new TaskCoordinator(fastStore, { name: 'race', query: async () => snapshot });
      const pending = slow.refresh(task.id);
      await started;
      terminal = await fast.refresh(task.id);
      const version = observer.prepare('PRAGMA data_version').get().data_version;
      rejectQuery(new Error('late network failure'));
      assert.deepEqual(await pending, terminal);
      assert.deepEqual(slowStore.get(task.id), terminal);
      assert.equal(observer.prepare('PRAGMA data_version').get().data_version, version);
      assert.deepEqual(slowStore.observe(task.id, { status: 'invalid' }), terminal);
      assert.equal(observer.prepare('PRAGMA data_version').get().data_version, version);
    } finally { observer.close(); fastStore.close(); slowStore.close(); }
    const reopened = new TaskStore(path);
    try { assert.deepEqual(reopened.get(terminal.id), terminal); }
    finally { reopened.close(); }
  });
}

test('older valid records remain readable and recoverable without new optional fields', async t => {
  const path = database(t);
  new TaskStore(path).close();
  const raw = new DatabaseSync(path);
  const snapshots = [
    { status: 'working' }, { status: 'input_required', inputRequests: {} },
    { status: 'completed', result: null }, { status: 'failed', error: 'failed' }, { status: 'cancelled' },
  ];
  const records = snapshots.map((snapshot, i) => ({
    id: `old-${i}`, adapter: 'legacy', input: {}, remoteId: `remote-${i}`, submission: 'accepted',
    snapshot, observationError: null, createdAt: '2026-09-08T00:00:00.000Z', updatedAt: '2026-09-08T00:00:00.000Z',
  }));
  try {
    const insert = raw.prepare('INSERT INTO tasks (id, record) VALUES (?, ?)');
    for (const record of records) insert.run(record.id, JSON.stringify(record));
  } finally { raw.close(); }
  const store = new TaskStore(path);
  try {
    assert.deepEqual(store.list(), records);
    const recovered = await new TaskCoordinator(store, {
      name: 'legacy', query: async remoteId => ({ status: 'completed', result: remoteId }),
    }).recover();
    assert.deepEqual(recovered.map(task => task.id), ['old-0', 'old-1']);
    assert.ok(recovered.every(task => task.observationError === null));
    for (const record of records.slice(2)) assert.deepEqual(store.get(record.id), record);
  } finally { store.close(); }
});
