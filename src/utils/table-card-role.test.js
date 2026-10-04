import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CARD_ROLES, cardRoles } from './table-card-role.js';

// v0.36.1 (plan docs/internal/plans/v0.36.1-table-card-density.md QĐ 1–2): card role of every td-table column.
describe('cardRoles — td-table column card roles (v0.34 QĐ 16 + v0.36.1 lead)', () => {
  const act = { key: 'x', actions: [] };

  it('whitelist includes lead', () => {
    assert.deepEqual(CARD_ROLES, ['lead', 'primary', 'secondary', 'meta', 'actions']);
  });

  it('nothing declared → first primary, others secondary, actions column actions (v0.34 unchanged)', () => {
    assert.deepEqual(cardRoles([{ key: 'id' }, { key: 'title' }, { key: 'b' }, act]), ['primary', 'secondary', 'secondary', 'actions']);
  });

  it('explicit primary on column 2 → the undeclared first column becomes lead (was secondary)', () => {
    assert.deepEqual(cardRoles([{ key: 'id' }, { key: 'title', card: 'primary' }, { key: 'b' }]), ['lead', 'primary', 'secondary']);
  });

  it('first column declared → kept as declared, never lead', () => {
    assert.deepEqual(cardRoles([{ key: 'id', card: 'secondary' }, { key: 'title', card: 'primary' }]), ['secondary', 'primary']);
    assert.deepEqual(cardRoles([{ key: 'id', card: 'meta' }, { key: 't' }]), ['meta', 'secondary']);
    assert.deepEqual(cardRoles([{ key: 'id', card: 'primary' }, { key: 't' }]), ['primary', 'secondary']);
  });

  it('explicit lead on any column; first column still primary when no explicit primary', () => {
    assert.deepEqual(cardRoles([{ key: 'title' }, { key: 'a' }, { key: 'code', card: 'lead' }]), ['primary', 'secondary', 'lead']);
    assert.deepEqual(cardRoles([{ key: 'a', card: 'lead' }, { key: 'b', card: 'lead' }, { key: 't', card: 'primary' }]), ['lead', 'lead', 'primary']);
  });

  it('actions column first + explicit primary → actions (not lead)', () => {
    assert.deepEqual(cardRoles([act, { key: 't', card: 'primary' }]), ['actions', 'primary']);
  });

  it('false → "false"; unknown values / holes fall back to the default', () => {
    assert.deepEqual(cardRoles([{ key: 'a', card: false }, { key: 'b', card: 'nope' }, null]), ['false', 'secondary', 'secondary']);
    assert.deepEqual(cardRoles([{ key: 'a', card: 'LEAD' }, { key: 'b', card: 'primary' }]), ['lead', 'primary']);
    assert.deepEqual(cardRoles([undefined, { key: 'b', card: 'primary' }]), ['lead', 'primary']);
  });

  it('non-array → []', () => {
    assert.deepEqual(cardRoles(null), []);
  });
});
