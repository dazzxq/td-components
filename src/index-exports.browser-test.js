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

  it('registers <td-progress> and <td-dropzone> from the root entry (v0.18.0 F4)', () => {
    expect(typeof kit.TdProgress).to.equal('function');
    expect(typeof kit.TdDropzone).to.equal('function');
    expect(customElements.get('td-progress')).to.equal(kit.TdProgress);
    expect(customElements.get('td-dropzone')).to.equal(kit.TdDropzone);
  });

  it('registers <td-alert> from the root entry (v0.18.0 F5)', () => {
    expect(typeof kit.TdAlert).to.equal('function');
    expect(customElements.get('td-alert')).to.equal(kit.TdAlert);
  });

  it('registers <td-media-grid> from the root entry (v0.23.0)', () => {
    expect(typeof kit.TdMediaGrid).to.equal('function');
    expect(customElements.get('td-media-grid')).to.equal(kit.TdMediaGrid);
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

  it('registers <td-otp-input>, <td-drawer>, <td-copy> from the root entry (v0.27.0)', () => {
    for (const name of ['TdOtpInput', 'TdDrawer', 'TdCopy']) expect(typeof kit[name], name).to.equal('function');
    expect(customElements.get('td-otp-input') === kit.TdOtpInput).to.equal(true);
    expect(customElements.get('td-drawer') === kit.TdDrawer).to.equal(true);
    expect(customElements.get('td-copy') === kit.TdCopy).to.equal(true);
    expect(typeof kit.TdDrawer.open).to.equal('function');
  });

  it('registers <td-tree> and <td-tree-select> from the root entry (v0.29.0)', () => {
    expect(typeof kit.TdTree).to.equal('function');
    expect(typeof kit.TdTreeSelect).to.equal('function');
    expect(customElements.get('td-tree')).to.equal(kit.TdTree);
    expect(customElements.get('td-tree-select')).to.equal(kit.TdTreeSelect);
  });

  it('registers <td-repeater> from the root entry (v0.30.0)', () => {
    expect(typeof kit.TdRepeater).to.equal('function');
    expect(customElements.get('td-repeater')).to.equal(kit.TdRepeater);
  });

  it('registers <td-number-input> from the root entry (v0.30.0)', () => {
    expect(typeof kit.TdNumberInput).to.equal('function');
    expect(customElements.get('td-number-input')).to.equal(kit.TdNumberInput);
  });

  it('registers <td-sortable> from the root entry (v0.31.0)', () => {
    expect(typeof kit.TdSortable).to.equal('function');
    expect(customElements.get('td-sortable')).to.equal(kit.TdSortable);
  });

  it('registers <td-masked-value> from the root entry (v0.31.0)', () => {
    expect(typeof kit.TdMaskedValue).to.equal('function');
    expect(customElements.get('td-masked-value')).to.equal(kit.TdMaskedValue);
  });
  it('registers <td-scan-input> from the root entry (v0.38.0)', () => {
    expect(typeof kit.TdScanInput).to.equal('function');
    expect(customElements.get('td-scan-input')).to.equal(kit.TdScanInput);
  });
  it('registers <td-datetime-range> from the root entry (v0.40.0)', () => {
    expect(typeof kit.TdDatetimeRange).to.equal('function');
    expect(customElements.get('td-datetime-range')).to.equal(kit.TdDatetimeRange);
  });
});

describe('index.js exports (v0.44.0)', () => {
  it('exports trackFormDirty (same function as the ./form-validation subpath)', async () => {
    const fv = await import('./utils/form-validation.js');
    expect(typeof kit.trackFormDirty).to.equal('function');
    expect(kit.trackFormDirty === fv.trackFormDirty).to.equal(true);
  });
});
