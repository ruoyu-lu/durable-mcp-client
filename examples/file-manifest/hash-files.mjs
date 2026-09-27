import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { open, realpath } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';

/** Read only explicitly named regular files in a trusted, stable local directory. */
export async function hashFiles(root, paths, signal, progress = async () => {}) {
  if (!Array.isArray(paths) || paths.length < 1 || paths.length > 100
    || paths.some(path => typeof path !== 'string' || !path || path.length > 1024 || path.includes('\0') || isAbsolute(path))) {
    throw new Error('Provide 1 to 100 relative file paths (at most 1024 characters each)');
  }
  const base = await realpath(root);
  const files = [];
  for (const path of paths) {
    signal.throwIfAborted();
    const target = resolve(base, path);
    const inside = relative(base, target);
    if (!inside || inside === '..' || inside.startsWith(`..${sep}`) || isAbsolute(inside)
      || await realpath(target) !== target) throw new Error(`Path must stay inside the root without symlinks: ${path}`);
    await progress(`Hashing ${files.length + 1}/${paths.length}: ${path}`);
    const file = await open(target, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
      const before = await file.stat();
      if (!before.isFile()) throw new Error(`Not a regular file: ${path}`);
      const hash = createHash('sha256');
      let bytes = 0;
      const buffer = Buffer.alloc(64 * 1024);
      while (bytes < before.size) {
        signal.throwIfAborted();
        const { bytesRead } = await file.read(buffer, 0, Math.min(buffer.length, before.size - bytes), bytes);
        if (!bytesRead) break;
        hash.update(buffer.subarray(0, bytesRead)); bytes += bytesRead;
      }
      signal.throwIfAborted();
      const after = await file.stat();
      if (before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs || bytes !== after.size) {
        throw new Error(`File changed while hashing: ${path}`);
      }
      files.push({ path, bytes, sha256: hash.digest('hex') });
    } finally { await file.close(); }
  }
  signal.throwIfAborted();
  await progress(`Hashed ${files.length} files`);
  return { algorithm: 'sha256', files };
}
