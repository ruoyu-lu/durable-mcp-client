import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { createServer } from 'node:http';
import { TaskStore } from '../../dist/store.js';
import { TaskCoordinator } from '../../dist/coordinator.js';
import { AdapterError, InputRejectedError } from '../../dist/errors.js';
import { HttpTaskAdapter } from '../../dist/adapters/http.js';

const request = { method: 'elicitation/create', params: { mode: 'form', requestedSchema: {
  type: 'object', properties: { label: { type: 'string', minLength: 1 } }, required: ['label'], additionalProperties: false,
} } };
const waiting = { status: 'input_required', inputRequests: { key: request } };
const answer = { action: 'accept', content: { label: 'corrected' } };
const rejection = () => new InputRejectedError({ kind: 'protocol', code: -32602, message: 'Label rejected', data: { field: 'label' } }, 'Fixture rejects before saving the response');
function database(t) {
  const dir = mkdtempSync(join(tmpdir(), 'durable-input-recovery-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return join(dir, 'tasks.sqlite');
}
function seed(store) {
  const task = store.create('input', {});
  return store.accept(task.id, 'remote', waiting);
}
function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

test('form validation permits correction without reserving a key or sending invalid data', async t => {
  const store = new TaskStore(database(t)); t.after(() => store.close());
  const task = seed(store); let sends = 0;
  const coordinator = new TaskCoordinator(store, { name: 'input', query: async () => waiting, respond: async () => { sends++; } });
  for (const response of [{}, { action: 'invalid' }, { action: 'accept' },
    { action: 'accept', content: { label: 42 } }, { action: 'accept', content: {} },
    { action: 'accept', content: { label: '' } }, { action: 'accept', content: { label: 'ok', extra: true } },
    { action: 'accept', content: { label: { nested: 'no' } } }]) {
    await assert.rejects(coordinator.respond(task.id, 'key', response), /[Ff]orm/);
    assert.equal(store.get(task.id).inputResponses, undefined);
    assert.equal(sends, 0);
  }
  const result = await coordinator.respond(task.id, 'key', answer);
  assert.equal(result.inputResponses[0].outcome, 'acknowledged');
  assert.equal(sends, 1);
  assert.deepEqual(answer, { action: 'accept', content: { label: 'corrected' } });
});

test('known rejection survives reopen and permits only an explicit reconciled correction', async t => {
  const path = database(t); let store = new TaskStore(path), sends = 0;
  const original = { action: 'accept', content: { label: 'rejected' } };
  const adapter = { name: 'input', query: async () => waiting, respond: async (_id, _key, response) => {
    sends++;
    if (response.content.label === 'rejected') throw rejection();
  } };
  try {
    const task = seed(store);
    const rejected = await new TaskCoordinator(store, adapter).respond(task.id, 'key', original);
    assert.equal(rejected.inputResponses[0].outcome, 'rejected');
    assert.deepEqual(rejected.inputResponses[0].errorDetails, rejection().details);
    assert.ok(rejected.inputResponses[0].rejectionEvidence);
    store.close(); store = new TaskStore(path);
    const coordinator = new TaskCoordinator(store, adapter);
    await coordinator.recover();
    assert.equal(sends, 1, 'Observation never replays an input response');
    const fixed = await coordinator.respond(task.id, 'key', answer);
    assert.deepEqual(fixed.inputResponses.map(a => a.outcome), ['rejected', 'acknowledged']);
    assert.deepEqual(fixed.inputResponses.map(a => a.response), [original, answer]);
    assert.notEqual(fixed.inputResponses[0].attemptId, fixed.inputResponses[1].attemptId);
    await assert.rejects(coordinator.respond(task.id, 'key', answer), /already attempted/);
    assert.equal(sends, 2);
  } finally { store.close(); }
});

for (const error of [new Error('Reply lost'), new AdapterError({ kind: 'protocol', code: -32602, message: 'Invalid params' })]) {
  test(`unproven delivery remains blocked after reopening and polling: ${error.message}`, async t => {
    const path = database(t); let store = new TaskStore(path), sends = 0;
    const adapter = { name: 'input', query: async () => waiting, respond: async () => { sends++; throw error; } };
    try {
      const task = seed(store);
      const result = await new TaskCoordinator(store, adapter).respond(task.id, 'key', answer);
      assert.equal(result.inputResponses[0].outcome, 'unknown');
      store.close(); store = new TaskStore(path);
      const coordinator = new TaskCoordinator(store, adapter);
      await coordinator.recover();
      await assert.rejects(coordinator.respond(task.id, 'key', answer), /already attempted/);
      assert.equal(sends, 1);
    } finally { store.close(); }
  });
}

test('stale input and failed refresh block corrections without reserving or sending', async t => {
  const store = new TaskStore(database(t)); t.after(() => store.close());
  const task = seed(store); let state = waiting, sends = 0, offline = false;
  const coordinator = new TaskCoordinator(store, { name: 'input', query: async () => {
    if (offline) throw new AdapterError({ kind: 'http', status: 503, method: 'tasks/get', message: 'Unavailable' });
    return state;
  }, respond: async () => { sends++; throw rejection(); } });
  await coordinator.respond(task.id, 'key', answer);
  state = { status: 'input_required', inputRequests: { newer: request } };
  await assert.rejects(coordinator.respond(task.id, 'key', answer), /not outstanding/);
  assert.equal(sends, 1); assert.equal(store.get(task.id).inputResponses.length, 1);
  state = waiting; offline = true;
  await assert.rejects(coordinator.respond(task.id, 'key', answer), /observation failure/);
  assert.equal(store.get(task.id).observationErrorDetails.status, 503);
  assert.equal(store.get(task.id).inputResponses.length, 1);
  offline = false; await coordinator.refresh(task.id);
  assert.equal(store.get(task.id).observationErrorDetails, undefined);
});

test('concurrent corrections reserve one attempt and late completion cannot overwrite it', async t => {
  const path = database(t); const first = new TaskStore(path), second = new TaskStore(path);
  t.after(() => { second.close(); first.close(); });
  const task = seed(first);
  await new TaskCoordinator(first, { name: 'input', query: async () => waiting, respond: async () => { throw rejection(); } }).respond(task.id, 'key', answer);
  const rejectedId = first.get(task.id).inputResponses[0].attemptId;
  const pollA = deferred(), pollB = deferred(), delivered = deferred(), finish = deferred(); let sends = 0;
  const send = async () => { sends++; delivered.resolve(); await finish.promise; };
  const a = new TaskCoordinator(first, { name: 'input', query: () => pollA.promise, respond: send });
  const b = new TaskCoordinator(second, { name: 'input', query: () => pollB.promise, respond: send });
  const pendingA = a.respond(task.id, 'key', answer);
  const pendingB = b.respond(task.id, 'key', answer);
  const loser = assert.rejects(pendingB, /already attempted/);
  pollA.resolve(waiting); await delivered.promise;
  pollB.resolve(waiting); await loser;
  const reserved = first.get(task.id);
  assert.deepEqual(first.finishInput(task.id, 'key', rejectedId, null), reserved);
  finish.resolve();
  assert.equal((await pendingA).inputResponses[1].outcome, 'acknowledged');
  assert.equal(sends, 1);
});

test('a competing rejected correction cannot authorize another already-started attempt', async t => {
  const path = database(t); const first = new TaskStore(path), second = new TaskStore(path);
  t.after(() => { second.close(); first.close(); });
  const task = seed(first); let sends = 0;
  const reject = async () => { sends++; throw rejection(); };
  await new TaskCoordinator(first, { name: 'input', query: async () => waiting, respond: reject }).respond(task.id, 'key', answer);
  const pollA = deferred(), pollB = deferred();
  const a = new TaskCoordinator(first, { name: 'input', query: () => pollA.promise, respond: reject });
  const b = new TaskCoordinator(second, { name: 'input', query: () => pollB.promise, respond: reject });
  const pendingA = a.respond(task.id, 'key', answer), pendingB = b.respond(task.id, 'key', answer);
  const loser = assert.rejects(pendingB, /Rejected response changed/);
  pollA.resolve(waiting); await pendingA;
  pollB.resolve(waiting); await loser;
  assert.equal(sends, 2);
});

test('legacy pending, unknown and acknowledged attempts never become retryable', async t => {
  const path = database(t); const store = new TaskStore(path), raw = new DatabaseSync(path);
  t.after(() => { raw.close(); store.close(); });
  for (const outcome of ['pending', 'unknown', 'acknowledged']) {
    const task = seed(store);
    task.inputResponses = [{ key: 'key', response: answer, outcome, error: outcome === 'unknown' ? 'lost' : null }];
    raw.prepare('UPDATE tasks SET record = ? WHERE id = ?').run(JSON.stringify(task), task.id);
    assert.equal(store.get(task.id).inputResponses[0].attemptId, undefined);
    const coordinator = new TaskCoordinator(store, { name: 'input', query: async () => { throw Error('Must not poll'); }, respond: async () => { throw Error('Must not send'); } });
    await assert.rejects(coordinator.respond(task.id, 'key', answer), /already attempted/);
    assert.deepEqual(store.get(task.id), task);
  }
});

test('unsupported schemas and invalid formats fail locally; explicit decline remains possible', async t => {
  const store = new TaskStore(database(t)); t.after(() => store.close());
  const task = seed(store);
  for (const schema of [
    { type: 'object', properties: { label: { type: 'string', format: 'email' } } },
    { $async: true, type: 'object' }, { $ref: 'https://invalid.example/schema' },
  ]) {
    store.observe(task.id, { status: 'input_required', inputRequests: { key: { method: 'elicitation/create', params: { mode: 'form', requestedSchema: schema } } } });
    assert.throws(() => store.reserveInput(task.id, 'key', answer), /form schema|form content/i);
    assert.equal(store.get(task.id).inputResponses, undefined);
  }
  assert.equal(store.reserveInput(task.id, 'key', { action: 'decline' }).inputResponses[0].outcome, 'pending');
});

async function errorServer(t, reply) {
  const server = createServer(async (req, res) => {
    let raw = ''; for await (const chunk of req) raw += chunk;
    reply(JSON.parse(raw), res);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  return new HttpTaskAdapter(`http://127.0.0.1:${server.address().port}/mcp`, 1000);
}

test('HTTP errors preserve status and JSON-RPC errors preserve code/data without implying rejection', async t => {
  let mode = 'protocol';
  const adapter = await errorServer(t, (body, res) => {
    if (mode === 'http') { res.writeHead(503).end(); return; }
    if (mode === 'lost') { res.destroy(); return; }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ jsonrpc: '2.0', id: body.id,
      ...(mode === 'protocol' ? { error: { code: -32602, message: 'Rejected params', data: { field: 'label' } } } : { result: { resultType: 'task' } }) }));
  });
  for (mode of ['protocol', 'http', 'lost', 'malformed']) {
    await assert.rejects(adapter.respond('remote', 'key', answer), error => {
      assert.ok(error instanceof AdapterError);
      assert.ok(!(error instanceof InputRejectedError));
      const details = error.details;
      assert.equal(details.method, 'tasks/update');
      assert.equal(details.kind, { protocol: 'protocol', http: 'http', lost: 'transport', malformed: 'invalid_response' }[mode]);
      if (mode === 'protocol') { assert.equal(details.code, -32602); assert.deepEqual(details.data, { field: 'label' }); }
      if (mode === 'http') assert.equal(details.status, 503);
      return true;
    });
  }
});

for (const mode of ['lost', 'protocol']) {
  test(`HTTP ${mode} input outcome stays unknown across reopen despite a stale outstanding key`, async t => {
    let sends = 0;
    const adapter = await errorServer(t, (body, res) => {
      if (body.method === 'tasks/update') {
        sends++;
        if (mode === 'lost') { res.destroy(); return; }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ jsonrpc: '2.0', id: body.id,
          error: { code: -32602, message: 'Invalid params', data: { field: 'label' } } }));
        return;
      }
      assert.equal(body.method, 'tasks/get');
      assert.equal(body.params.taskId, 'remote');
      // An eventually consistent server may still advertise the key after receipt.
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ jsonrpc: '2.0', id: body.id,
        result: { resultType: 'complete', taskId: 'remote', ...waiting } }));
    });
    const path = database(t); let store = new TaskStore(path);
    try {
      const task = store.create(adapter.name, {});
      store.accept(task.id, 'remote', waiting);
      const attempted = await new TaskCoordinator(store, adapter).respond(task.id, 'key', answer);
      const failure = attempted.inputResponses[0];
      assert.equal(failure.outcome, 'unknown');
      assert.equal(failure.errorDetails.kind, mode === 'lost' ? 'transport' : 'protocol');
      if (mode === 'protocol') {
        assert.equal(failure.errorDetails.code, -32602);
        assert.deepEqual(failure.errorDetails.data, { field: 'label' });
      }
      store.close(); store = new TaskStore(path);
      const coordinator = new TaskCoordinator(store, adapter);
      await coordinator.recover();
      assert.deepEqual(store.get(task.id).inputResponses[0], failure);
      assert.equal(store.get(task.id).snapshot.status, 'input_required');
      await assert.rejects(coordinator.respond(task.id, 'key', answer), /already attempted/);
      assert.equal(sends, 1);
    } finally { store.close(); }
  });
}
