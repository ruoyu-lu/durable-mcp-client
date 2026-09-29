import assert from 'node:assert/strict';
import test from 'node:test';
import { chmodSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { TaskStore } from '../../dist/store.js';

const posix = { skip: process.platform === 'win32' };
function database(t) {
  const root = mkdtempSync(join(tmpdir(), 'durable-permissions-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  // An existing directory need not already provide an owner-only boundary.
  chmodSync(root, 0o755);
  return join(root, 'tasks.sqlite');
}

test('new SQLite database and active sidecars stay private under a permissive umask', posix, t => {
  const db = database(t);
  const moduleUrl = pathToFileURL(resolve('dist/store.js')).href;
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', `
    import { statSync } from 'node:fs';
    import { TaskStore } from ${JSON.stringify(moduleUrl)};
    process.umask(0);
    const path = process.argv[1];
    const store = new TaskStore(path);
    try {
      const record = store.create('permissions-probe', { text: 'retained input' });
      console.log(JSON.stringify({ id: record.id, modes: ['', '-wal', '-shm'].map(suffix => statSync(path + suffix).mode & 0o777) }));
    } finally { store.close(); }
  `, db], { encoding: 'utf8', timeout: 10000 });
  assert.equal(child.status, 0, child.stderr || String(child.error));
  const result = JSON.parse(child.stdout);
  assert.deepEqual(result.modes, [0o600, 0o600, 0o600]);
  const reopened = new TaskStore(db);
  try { assert.deepEqual(reopened.get(result.id).input, { text: 'retained input' }); }
  finally { reopened.close(); }
  assert.equal(statSync(db).mode & 0o777, 0o600);
});

test('opening an existing database preserves its records and chosen permissions', posix, t => {
  const db = database(t);
  const original = new TaskStore(db);
  let record;
  try { record = original.create('permissions-probe', { text: 'existing input' }); }
  finally { original.close(); }
  chmodSync(db, 0o640);
  const reopened = new TaskStore(db);
  try {
    assert.deepEqual(reopened.get(record.id), record);
    assert.equal(statSync(db).mode & 0o777, 0o640);
  } finally { reopened.close(); }
});
