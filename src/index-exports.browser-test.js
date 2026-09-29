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

  it('registers <td-password-meter> and <td-scroll-top> from the root entry (v0.17.0 E7)', () => {
    expect(typeof kit.TdPasswordMeter).to.equal('function');
    expect(typeof kit.TdScrollTop).to.equal('function');
    expect(customElements.get('td-password-meter')).to.equal(kit.TdPasswordMeter);
    expect(customElements.get('td-scroll-top')).to.equal(kit.TdScrollTop);
  });

  it('registers <td-alert> from the root entry (v0.18.0 F5)', () => {
    expect(typeof kit.TdAlert).to.equal('function');
    expect(customElements.get('td-alert')).to.equal(kit.TdAlert);
  });

  it('re-exports the icon API and the dom-utils functions (v0.17.0 E8)', async () => {
    const icons = await import('./icons/td-icon.js');
    const utils = await import('./utils/dom-utils.js');
    for (const name of ['tdIcon', 'registerIcons', 'hasIcon', 'listIcons', 'fillIconSlots']) {
      expect(kit[name], name).to.equal(icons[name]);
    }
    for (const name of ['slugify', 'formatFileSize', 'formatNumber', 'debounce', 'throttle', 'parseColorToRgb',
      'relativeLuminance', 'contrastRatio', 'getAccessibleTextColor']) {
      expect(kit[name], name).to.equal(utils[name]);
    }
    expect(kit.hasIcon('trash')).to.equal(true);
    expect(kit.slugify('Chuyên mục')).to.equal('chuyen-muc');
  });
});
