// v0.46.0 (plan v0.46.0-diff QĐ 10, 21) — generated limit cases of the td-diff parity test (too big for the hand-written
// test/ssr/diff.fixtures.json): every budget at its boundary ± 1. Same case shape as the fixtures; no raw number
// literals (they travel through JSON.stringify to PHP). Not part of the browser fixture (node parity only).
const obj = (n, f = (i) => i) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`k${i}`, f(i)]));
/** root with `groups` objects of `size` keys: 1 + groups + groups × size visited nodes */
const nodes = (sizes) => Object.fromEntries(sizes.map((s, g) => [`g${g}`, obj(s)]));

export function generatedCases() {
  return [
    { id: 'g-rows-501', mode: 'items', opts: {}, items: [...Array.from({ length: 501 }, (_, i) => ({ key: `c${i}`, before: i, after: i + 1 })),
      { key: 'u', before: 1, after: 1 }] },
    { id: 'g-rows-mixed', mode: 'items', opts: { unchanged: 'show' }, items: [...Array.from({ length: 600 }, (_, i) => ({ key: `u${i}`, before: 1, after: 1 })),
      ...Array.from({ length: 10 }, (_, i) => ({ key: `c${i}`, after: 2 }))] },
    { id: 'g-keys-1000', mode: 'snapshot', opts: {}, before: '{}', after: JSON.stringify({ o: obj(1000) }) },
    { id: 'g-keys-1001', mode: 'snapshot', opts: { json: true }, before: '{}', after: JSON.stringify({ o: obj(1001), l: Array.from({ length: 1001 }, (_, i) => ({ i })) }) },
    { id: 'g-nodes-10000', mode: 'snapshot', opts: {}, before: '{}', after: JSON.stringify(nodes(Array(11).fill(908))) },
    { id: 'g-nodes-10001', mode: 'snapshot', opts: {}, before: '{}', after: JSON.stringify(nodes([...Array(10).fill(908), 909])) },
    { id: 'g-items-1001', mode: 'items', opts: {}, items: Array.from({ length: 1001 }, (_, i) => ({ key: `k${i}`, after: i })) },
    { id: 'g-text-30', mode: 'items', opts: {}, items: Array.from({ length: 30 }, (_, i) => ({ key: `k${i}`, after: 'y'.repeat(10000) })) },
    { id: 'g-text-31', mode: 'items', opts: {}, items: Array.from({ length: 31 }, (_, i) => ({ key: `k${i}`, after: `${'z'.repeat(9999)}${i}` })) },
    { id: 'g-json-budget', mode: 'snapshot', opts: { json: true }, before: JSON.stringify({ s: Array.from({ length: 900 }, (_, i) => `${i}${'é'.repeat(200)}`) }),
      after: JSON.stringify({ s: Array.from({ length: 300 }, () => '😀'.repeat(150)) }) },
    { id: 'g-depth-wide', mode: 'snapshot', opts: { json: true }, before: '{}',
      after: JSON.stringify({ a: { b: { c: { d: { e: { f: obj(50, (i) => ({ deep: [i, { x: i }] })) } } } } } }) },
    { id: 'g-equal-budget', mode: 'items', opts: {}, items: [{ key: 'big', before: Array.from({ length: 900 }, (_, i) => ({ i, v: [i, i] })), after: Array.from({ length: 900 }, (_, i) => ({ i, v: [i, i] })) }] },
    // Codex round 1 S2 + I2: shared work budget (300 items × two 1000-element lists), list text in the total budget
    { id: 'g-work-lists', mode: 'items', opts: {}, items: Array.from({ length: 300 }, (_, i) => ({ key: `k${i}`,
      before: Array.from({ length: 1000 }, (_, j) => `b${j}`), after: Array.from({ length: 1000 }, (_, j) => `a${j}`) })) },
    { id: 'g-list-text', mode: 'items', opts: {}, items: Array.from({ length: 10 }, (_, i) => ({ key: `l${i}`,
      after: Array.from({ length: 200 }, (_, j) => `${j}${'é'.repeat(198)}`) })) },
    // I4: strings longer than 4 × 10 000 code points compare by their bounded prefix (equal prefix → cannot tell)
    { id: 'g-long-strings', mode: 'items', opts: { json: true }, items: [{ key: 'a', before: `${'x'.repeat(41000)}a`, after: `${'x'.repeat(41000)}b` },
      { key: 'b', before: 'x'.repeat(40000), after: 'x'.repeat(40001) }, { key: 'c', before: ['😀'.repeat(900)], after: ['😀'.repeat(901)] },
      { key: 'd', type: 'enum', options: { x: 'X' }, before: 'é'.repeat(50000), after: 'x' }] },
    { id: 'g-long-keys', mode: 'snapshot', opts: { json: true }, warns: 1, before: JSON.stringify({ ['é'.repeat(1001)]: 1, ['😀'.repeat(999)]: 1 }),
      after: JSON.stringify({ ['é'.repeat(1001)]: 1, ['😀'.repeat(999)]: 2 }), fields: [{ path: ['é'.repeat(201)] }] },
  ];
}
