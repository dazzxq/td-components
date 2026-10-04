/**
 * td-table card roles (v0.34.0 QĐ 16, v0.36.1 QĐ 1–2) — pure, unit-tested by table-card-role.test.js.
 * `lead` = a short identifier (ID, code, number) shown before the primary on the card's first line, without a label.
 */
export const CARD_ROLES = ['lead', 'primary', 'secondary', 'meta', 'actions'];

/**
 * Card role of every column: an explicit whitelisted `card` wins (`false` → 'false'); else an `actions` column →
 * 'actions'; else the FIRST column → 'primary', or 'lead' when another column declares `card: 'primary'`; else
 * 'secondary'. Unknown `card` values fall back to the default.
 * @param {Array<Object>} columns
 * @returns {string[]}
 */
export function cardRoles(columns) {
  if (!Array.isArray(columns)) return [];
  const explicitPrimary = columns.some((c) => c && c.card === 'primary');
  return columns.map((col, ci) => {
    const c = col || {};
    if (c.card === false) return 'false';
    if (CARD_ROLES.includes(c.card)) return c.card;
    if (Array.isArray(c.actions)) return 'actions';
    if (ci === 0) return explicitPrimary ? 'lead' : 'primary';
    return 'secondary';
  });
}
