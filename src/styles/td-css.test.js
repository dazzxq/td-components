import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('td.css contains every token-native block', async () => {
  const css = await readFile(new URL('../../td.css', import.meta.url), 'utf8');
  for (const block of ['.td-glass-surface', '.td-icon', '.td-field-error', '.td-spinner', '.td-btn', '.td-checkbox', '.td-switch', '.td-loading', '.td-lightbox']) {
    assert.ok(css.includes(`${block} {`) || css.includes(`${block}{`) || css.includes(`${block},`), block);
  }
  assert.ok(css.startsWith('/*! td.css'));
  assert.ok(/@layer td\.tokens, td\.component, td\.utilities;/.test(css));
});
