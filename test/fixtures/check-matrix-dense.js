// v0.47.0 review r1 #2 — a note-dense matrix whose `data` attribute JSON is EXACTLY `target` UTF-8 bytes, shared by the
// PHP test (td_check_matrix) and the browser test (the `data` attribute): both sides measure the same string — the JSON
// php/td.php prints (HEX flags + unescaped unicode / slashes) equals JSON.stringify of the canonical data here, because the
// texts hold no `<>&'"` and no U+2028 / U+2029.
import { validateMatrix, canonicalMatrix, matrixJsonBytes } from '../../src/utils/check-matrix-model.js';

export const jsonOf = (data) => JSON.stringify({ v: 1, ...canonicalMatrix(validateMatrix(data).model) });

/** @param {number} target bytes @returns {{ data: object, json: string }} */
export function denseMatrixData(target) {
  const columns = Array.from({ length: 12 }, (_, i) => ({ key: `c${i}`, label: `Vai trò ${i}` }));
  const rows = Array.from({ length: 200 }, (_, i) => ({ key: `r${i}`, label: `Quyền ${i}` }));
  const full = 'đ'.repeat(150); // 300 bytes, 150 UTF-16 code units
  const build = (n, pad) => {
    const cells = {};
    for (let k = 0; k <= n; k++) {
      const r = `r${Math.floor(k / 12)}`;
      (cells[r] ||= {})[`c${k % 12}`] = { note: k < n ? full : padNote(pad) };
    }
    return { columns, rows, cells, value: { c0: ['r0', 'r1'] } };
  };
  // a note of exactly `b` UTF-8 bytes (≤ 600) in ≤ 300 code points: x × 'đ' (2 bytes) + y × 'a'
  const padNote = (b) => { const x = Math.max(0, b - 300); return 'đ'.repeat(x) + 'a'.repeat(b - 2 * x); };
  const size = (n, pad) => matrixJsonBytes(jsonOf(build(n, pad)));
  let lo = 0;
  let hi = 12 * 200 - 1; // largest n of full notes (+ a 1-char pad note) still ≤ target − 1
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (size(mid, 1) <= target - 1) lo = mid; else hi = mid - 1;
  }
  const m = 1 + target - size(lo, 1);
  if (m < 1 || m > 600) throw new Error(`dense: cannot pad ${m}`);
  const data = build(lo, m);
  const json = jsonOf(data);
  if (matrixJsonBytes(json) !== target) throw new Error('dense: missed the target');
  return { data, json };
}
