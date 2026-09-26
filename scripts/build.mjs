import { rmSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { createRequire } from 'node:module';

// Remove only this project's generated output so removed modules cannot enter a tarball.
rmSync(new URL('../dist/', import.meta.url), { recursive: true, force: true });
const require = createRequire(import.meta.url);
const compilerManifest = require.resolve('typescript/package.json');
const compiler = JSON.parse(readFileSync(compilerManifest, 'utf8'));
execFileSync(process.execPath, [resolve(dirname(compilerManifest), compiler.bin.tsc)], {
  cwd: new URL('../', import.meta.url), stdio: 'inherit',
});
