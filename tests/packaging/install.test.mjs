import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const root = fileURLToPath(new URL('../../', import.meta.url));
const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));

test('built tarball installs and runs independently with production dependencies only', { timeout: 120000 }, async t => {
  const dir = await mkdtemp(join(tmpdir(), 'durable-package-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  assert.ok(!dir.startsWith(root), 'Installation must be outside the repository');
  // A stale generated module must not leak through a build-on-pack operation.
  await mkdir(join(root, 'dist'), { recursive: true });
  await writeFile(join(root, 'dist', 'pack-stale.js'), 'throw new Error("stale artifact");\n');
  const packed = JSON.parse((await exec('npm', ['pack', '--json', '--silent', '--ignore-scripts=false', '--pack-destination', dir],
    { cwd: root, timeout: 60000 })).stdout)[0];
  const paths = packed.files.map(file => file.path);
  for (const required of ['bin/durable-mcp-client.js', 'dist/cli.js', 'dist/version.js', 'package.json', 'README.md', 'LICENSE', 'CHANGELOG.md', 'THIRD_PARTY_NOTICES.md']) {
    assert.ok(paths.includes(required), `Missing ${required}`);
  }
  assert.ok(!paths.includes('dist/pack-stale.js'));
  assert.ok(paths.every(path => /^(bin\/durable-mcp-client\.js|dist\/.+\.js|package\.json|README\.md|LICENSE|CHANGELOG\.md|THIRD_PARTY_NOTICES\.md)$/.test(path)),
    `Unexpected package contents: ${paths.join(', ')}`);
  assert.equal(packed.version, manifest.version);

  const install = join(dir, 'install');
  const work = join(dir, 'work');
  await mkdir(install); await mkdir(work);
  const env = { ...process.env, NODE_PATH: '', NODE_OPTIONS: '' };
  await exec('npm', ['install', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund', join(dir, packed.filename)],
    { cwd: install, env, timeout: 60000 });
  const packageRoot = join(install, 'node_modules', 'durable-mcp-client');
  const installed = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'));
  assert.equal(installed.version, manifest.version);
  assert.deepEqual(installed.bin, { 'durable-mcp-client': 'bin/durable-mcp-client.js' });
  assert.equal(installed.dependencies['@modelcontextprotocol/client'], undefined);
  for (const omitted of ['typescript', '@types/node', '@modelcontextprotocol/client', '@modelcontextprotocol/server', '@modelcontextprotocol/node', 'mcp-durable-tasks', 'zod']) {
    await assert.rejects(access(join(install, 'node_modules', omitted)), { code: 'ENOENT' });
  }
  const bin = join(install, 'node_modules', '.bin', 'durable-mcp-client');
  const run = (...args) => exec(bin, args, { cwd: work, env, timeout: 15000 });
  assert.match((await run('--help')).stdout, /Usage: durable-mcp-client/);
  assert.equal((await run('--version')).stdout.trim(), manifest.version);
  await assert.rejects(access(join(work, '.runtime')), { code: 'ENOENT' });

  const submitted = JSON.parse((await run('submit', '--text', 'installed artifact', '--delay-ms', '2000')).stdout);
  assert.equal(submitted.submission, 'accepted');
  assert.equal(submitted.snapshot.status, 'working');
  const [listed] = JSON.parse((await run('list')).stdout);
  assert.equal(listed.id, submitted.id);
  assert.equal(listed.remoteId, submitted.remoteId);
  const completed = JSON.parse((await run('wait', submitted.id, '--interval-ms', '10', '--timeout-ms', '10000')).stdout);
  assert.equal(completed.reason, 'terminal');
  assert.equal(completed.task.remoteId, submitted.remoteId);
  assert.deepEqual(completed.task.snapshot, { status: 'completed', result: { text: 'installed artifact' } });
  assert.deepEqual(JSON.parse((await run('status', submitted.id)).stdout), completed.task);
  assert.deepEqual(JSON.parse((await run('recover')).stdout), []);

  const slow = JSON.parse((await run('submit', '--text', 'timeout', '--delay-ms', '86400000')).stdout);
  await assert.rejects(run('wait', slow.id, '--timeout-ms', '5'), error => {
    assert.equal(error.code, 2);
    assert.equal(JSON.parse(error.stdout).reason, 'timeout');
    return true;
  });
  await assert.rejects(run('unknown-command'), error => error.code === 1 && error.stdout === '' && /Usage:/.test(error.stderr));
  // Simulate the reported version before importing the launcher; no SQLite import may occur.
  await assert.rejects(exec(process.execPath, ['--input-type=module', '-e',
    `Object.defineProperty(process.versions, 'node', { value: '22.12.0' }); await import(${JSON.stringify(pathToFileURL(join(packageRoot, 'bin/durable-mcp-client.js')).href)});`],
    { cwd: work, env, timeout: 10000 }), error => error.code === 1 && /requires Node.js 22.13/.test(error.stderr));
});
