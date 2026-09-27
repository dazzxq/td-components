import { expect } from '@esm-bundle/chai';
import * as kit from '../index.js';

// Package entry smoke test: every public export resolves (v0.12.0 adds TdMenu, TdChipInput, TdFormValidation).
describe('index.js exports', () => {
  it('exposes the v0.12.0 additions and the existing kit', () => {
    for (const name of ['TdMenu', 'TdHovercard', 'TdChipInput', 'TdFormValidation', 'TdModal', 'TdDropdown', 'TdTable', 'TdDatetimePicker']) {
      expect(typeof kit[name], name).to.equal('function');
    }
    expect(customElements.get('td-chip-input')).to.equal(kit.TdChipInput);
  });

  it('exports TdIconElement and registers <td-icon> (v0.16.0 D4)', () => {
    expect(typeof kit.TdIconElement).to.equal('function');
    expect(customElements.get('td-icon')).to.equal(kit.TdIconElement);
  });
});
