import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { hashFiles } from '../../examples/file-manifest/hash-files.mjs';

async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), 'file-manifest-unit-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const root = join(dir, 'root'); await mkdir(root);
  await writeFile(join(root, 'ok.txt'), 'hello');
  await writeFile(join(dir, 'outside.txt'), 'private');
  return { dir, root };
}

test('file hashing refuses escaping, symlink, directory and missing paths', async t => {
  const { dir, root } = await fixture(t);
  await mkdir(join(root, 'directory'));
  await symlink(join(dir, 'outside.txt'), join(root, 'outside-link'));
  await symlink(join(root, 'ok.txt'), join(root, 'inside-link'));
  const signal = new AbortController().signal;
  for (const paths of [[], ['../outside.txt'], [join(root, 'ok.txt')], ['outside-link'], ['inside-link'], ['directory'], ['.'], ['missing'], ['bad\0name'], Array(101).fill('ok.txt')]) {
    await assert.rejects(hashFiles(root, paths, signal));
  }
});

test('file hashing observes cancellation before and during work', async t => {
  const { root } = await fixture(t);
  const controller = new AbortController(); controller.abort(new Error('cancelled'));
  await assert.rejects(hashFiles(root, ['ok.txt'], controller.signal), /cancelled/);
  const active = new AbortController();
  await assert.rejects(hashFiles(root, ['ok.txt'], active.signal, async () => active.abort()), { name: 'AbortError' });
});
