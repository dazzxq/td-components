/**
 * v0.88.0 (Codex security r1-r2, CWE-59): read / write a GENERATED file inside the repository without ever following a
 * symbolic link — the generator scripts (build-rich-text-engine, build-rich-text-policy) use these.
 */
import { lstatSync, mkdirSync, readFileSync, realpathSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, relative, isAbsolute } from 'node:path';

const isLink = (p) => { try { return lstatSync(p).isSymbolicLink(); } catch { return false; } };

/**
 * Throw unless `file` and every directory between `root` and it are real (no symbolic link) and its directory resolves
 * inside `root`.
 * @param {string} root repository root
 * @param {string} file absolute path of the generated file
 */
export function assertSafeTarget(root, file) {
  const rel = relative(root, file);
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) throw new Error(`${file} is outside ${root}`);
  for (let p = file; p !== root && p !== dirname(p); p = dirname(p)) {
    if (isLink(p)) throw new Error(`${p} is a symbolic link — refusing to read / write through it`);
  }
}

/**
 * The current content of a generated file ('' when it does not exist), refusing links and non-regular files.
 * @param {string} root @param {string} file @returns {string}
 */
export function readGenerated(root, file) {
  assertSafeTarget(root, file);
  let st;
  try { st = lstatSync(file); } catch { return ''; }
  if (!st.isFile()) throw new Error(`${file} is not a regular file`);
  return readFileSync(file, 'utf8');
}

/**
 * Write a generated file: exclusive-create a random temp file next to it, then rename over the target (a planted link
 * at the target is replaced, never followed; a planted temp path fails closed).
 * @param {string} root @param {string} file @param {string} content
 */
export function writeGenerated(root, file, content) {
  assertSafeTarget(root, file);
  mkdirSync(dirname(file), { recursive: true });
  assertSafeTarget(root, file);
  const realRoot = realpathSync(root);
  const rel = relative(realRoot, realpathSync(dirname(file)));
  if (rel.startsWith('..') || isAbsolute(rel)) throw new Error(`${file}: directory escapes ${root}`);
  const tmp = `${file}.${randomUUID()}.tmp`;
  writeFileSync(tmp, content, { flag: 'wx', mode: 0o644 });
  try {
    renameSync(tmp, file);
  } catch (e) {
    try { unlinkSync(tmp); } catch {}
    throw e;
  }
}
