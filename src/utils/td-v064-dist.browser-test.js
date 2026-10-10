import { expect } from '@esm-bundle/chai';
import * as kit from '../../index.js';
import { trackFormDirty } from './form-dirty.js';
import '../form/td-scan-input.js';

// v0.64.0 (ADR 0034, plan v0.64.0-dist M3) — runs on the source (npm run test:browser) AND on the committed minified
// dist/ bytes (npm run test:browser:dist, TD_DIST=1): the barrel's export table (keepNames: every class / function keeps
// its export name), the two lazy import() of td-modal.js still load and open a dialog, each element defined once.
/** The barrel exports, captured from the source at 0.64.0 (Codex impl r1 #2) — dist must export exactly these. */
const EXPORTS = [
  'BREAKPOINTS', 'SHORT_MAX', 'TdActionButton', 'TdAlert', 'TdBaseElement', 'TdButton', 'TdCarousel', 'TdCheckMatrix',
  'TdCheckbox', 'TdChipInput', 'TdChoiceGroup', 'TdColorPicker', 'TdCopy', 'TdCropper', 'TdDateTime',
  'TdDatetimePicker', 'TdDatetimeRange', 'TdDiff', 'TdDrawer', 'TdDropdown', 'TdDropzone', 'TdEmptyState',
  'TdFilterChips', 'TdFormElement', 'TdFormValidation', 'TdHint', 'TdHovercard', 'TdIconElement', 'TdInputField',
  'TdLightbox', 'TdLoading', 'TdLoadingSpinner', 'TdMaskedValue', 'TdMediaField', 'TdMediaGallery', 'TdMediaGrid',
  'TdMediaPicker', 'TdMenu', 'TdModal', 'TdModalStackManager', 'TdNumberInput', 'TdOtpInput', 'TdPagination',
  'TdPasswordMeter', 'TdProgress', 'TdRating', 'TdRepeater', 'TdScanInput', 'TdScrollTop', 'TdSlider', 'TdSortable',
  'TdSteps', 'TdTable', 'TdTabs', 'TdTimeline', 'TdToast', 'TdToggle', 'TdTooltip', 'TdTree', 'TdTreeSelect',
  'contrastRatio', 'debounce', 'fillIconSlots', 'formatFileSize', 'formatNumber', 'getAccessibleTextColor', 'hasIcon',
  'isCoarsePointer', 'isShort', 'listIcons', 'matchesBelow', 'mqBelow', 'parseColorToRgb', 'registerIcons',
  'relativeLuminance', 'slugify', 'tdIcon', 'tdTooltip', 'throttle', 'trackFormDirty',
];
const NOT_FUNCTIONS = { BREAKPOINTS: 'object', SHORT_MAX: 'number', tdTooltip: 'object' };

const raf = () => new Promise((r) => requestAnimationFrame(r));
const until = async (cond, n = 240) => { for (let i = 0; i < n && !cond(); i++) await raf(); return !!cond(); };
const dialog = () => document.querySelector('.td-modal [role="alertdialog"]');
/** The first footer button of a confirm is its cancel ("Ở lại" / "Hủy"). */
async function cancelDialog() {
  const cancel = [...document.querySelectorAll('.td-modal')].pop().querySelector('.td-modal__footer button');
  expect(!!cancel).to.equal(true);
  cancel.click();
  expect(await until(() => !document.querySelector('.td-modal'))).to.equal(true);
}

describe('v0.64.0 dist parity — index.js', () => {
  it('the 80 captured exports; every function export keeps its name (keepNames); the 3 others keep their type', () => {
    const keys = Object.keys(kit).sort();
    expect(keys).to.deep.equal(EXPORTS);
    for (const k of keys) {
      if (k in NOT_FUNCTIONS) expect(typeof kit[k], k).to.equal(NOT_FUNCTIONS[k]);
      else {
        expect(typeof kit[k], k).to.equal('function');
        expect(kit[k].name, k).to.equal(k);
      }
    }
  });

  it('each custom element of the kit is defined once, by the class the barrel exports', () => {
    let n = 0;
    for (const [k, v] of Object.entries(kit)) {
      if (typeof v !== 'function' || !(v.prototype instanceof HTMLElement)) continue;
      const tag = customElements.getName(v);
      if (tag === null) continue; // a base class (TdBaseElement, TdFormElement) is never defined itself
      expect(customElements.get(tag), k).to.equal(v);
      n += 1;
    }
    expect(n > 40).to.equal(true);
    expect(customElements.get('td-button')).to.equal(kit.TdButton);
  });
});

describe('v0.64.0 dist parity — lazy import() of td-modal.js', () => {
  afterEach(() => { document.body.replaceChildren(); });

  it('form-dirty confirmDiscard opens the modal through import()', async () => {
    const form = document.createElement('form');
    form.innerHTML = '<input name="a" value="1">';
    document.body.appendChild(form);
    const t = trackFormDirty(form);
    t.markDirty();
    const answer = t.confirmDiscard();
    expect(await until(() => !!dialog())).to.equal(true);
    await cancelDialog();
    expect(await answer).to.equal(false);
    t.destroy();
  });

  it('td-scan-input "Xoá tất cả" from 5 codes confirms through import()', async () => {
    const el = document.createElement('td-scan-input');
    el.setAttribute('multiple', '');
    el.setAttribute('name', 'codes[]');
    document.body.appendChild(el);
    el.values = ['A001', 'A002', 'A003', 'A004', 'A005'];
    await raf();
    el.querySelector('button.td-scan__clear').click();
    expect(await until(() => !!dialog())).to.equal(true);
    await cancelDialog();
    expect(el.values.length).to.equal(5);
  });
});
