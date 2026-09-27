import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('td.css contains every token-native block', async () => {
  const css = await readFile(new URL('../../td.css', import.meta.url), 'utf8');
  for (const block of ['.td-glass-surface', '.td-icon', '.td-field-error', '.td-spinner', '.td-btn', '.td-checkbox', '.td-switch', '.td-loading', '.td-lightbox', '.td-field__control', '.td-slider', '.td-pagination', '.td-tabs', '.td-empty-state', '.td-modal', '.td-toast', '.td-tooltip', '.td-dropdown', '.td-table', '.td-dtp__trigger', '.td-dtp-panel', '.td-dtp-wheel__option', '.td-sample']) {
    assert.ok(css.includes(`${block} {`) || css.includes(`${block}{`) || css.includes(`${block},`), block);
  }
  assert.ok(css.startsWith('/*! td.css'));
  assert.ok(/@layer td\.tokens, td\.component, td\.utilities;/.test(css));
});
