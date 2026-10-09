// Loaded by tokens.spec.mjs: token-native components under emulated media (reduced motion / forced colours).
import '/src/form/td-slider.js';
import '/src/display/td-tabs.js';
import '/src/display/td-pagination.js';
import { TdLoadingSpinner } from '/src/feedback/td-loading.js';
import { TdModal } from '/src/feedback/td-modal.js';
import { TdToast } from '/src/feedback/td-toast.js';
import '/src/display/td-table.js';
import '/src/form/td-datetime-picker.js';
import { TdMenu } from '/src/feedback/td-menu.js';
import '/src/form/td-chip-input.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
window.__componentsRun = (async () => {
  const root = document.getElementById('root');
  root.innerHTML = '<td-slider id="sl" value="50" aria-label="x"></td-slider>'
    + '<td-tabs id="tb"></td-tabs>'
    + '<td-pagination id="pg" total-items="50" items-per-page="10" current-page="2"></td-pagination>';
  const tabs = document.getElementById('tb');
  tabs.tabs = [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }];
  tabs.setActiveTab('b');
  document.querySelector('#sl .td-slider').setAttribute('data-dragging', '');
  const spin = TdLoadingSpinner.create({ size: 'md' });
  root.appendChild(spin);
  const ref = document.createElement('span');
  ref.style.backgroundColor = 'Highlight'; // CSSOM (CSP-safe) reference for the system colour
  root.appendChild(ref);
  await wait(500);
  const cs = (el) => getComputedStyle(el);
  const arc = spin.querySelector('.td-spinner__arc');
  const d0 = cs(arc).strokeDashoffset;
  await wait(250);
  const d1 = cs(arc).strokeDashoffset;
  const thumb = document.querySelector('#sl .td-slider__thumb');
  const selected = document.querySelector('#tb .td-tabs__tab[aria-selected="true"]');
  // Floating layer glass (v0.9.0): toast alone, then a modal (toast turns solid over it, D20), then glass off.
  const glass = (el) => {
    const c = cs(el);
    return { bf: c.backdropFilter || c.webkitBackdropFilter || 'none', bg: c.backgroundColor };
  };
  // Table sticky header (v0.10.0 D14): opaque fill, light + dark (rows must never show through).
  const table = document.createElement('td-table');
  table.setAttribute('max-height', '120px');
  table.setAttribute('aria-label', 'Bảng');
  root.appendChild(table);
  table.columns = [{ key: 'a', label: 'A' }];
  table.data = Array.from({ length: 12 }, (_, i) => ({ a: `r${i}` }));
  await wait(50);
  const th = table.querySelector('thead th');
  const sticky = { position: cs(th).position, bg: cs(th).backgroundColor };
  document.documentElement.setAttribute('data-td-theme', 'dark');
  await wait(50);
  const stickyDark = { position: cs(th).position, bg: cs(th).backgroundColor };
  document.documentElement.removeAttribute('data-td-theme');
  // Picker wheel (v0.10.0): keyboard selection jumps instantly under reduced motion, animates otherwise.
  const dtp = document.createElement('td-datetime-picker');
  dtp.id = 'dtp';
  dtp.setAttribute('aria-label', 'Thời gian');
  dtp.setAttribute('value', '15/06/2026 - 10:30');
  root.appendChild(dtp);
  dtp.querySelector('.td-dtp__trigger').click();
  await wait(500);
  document.querySelector('.td-dtp-pop .td-cal__day[tabindex="0"]').click(); // v0.61.0: a day opens the TIME screen (the wheels)
  await wait(300);
  const hourList = document.querySelector('.td-dtp-wheel__list[data-part="hour"]');
  const s0 = hourList.scrollTop;
  hourList.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
  const wheelJumped = hourList.scrollTop !== s0; // read synchronously: an instant scroll has already moved
  const wheelSelected = hourList.querySelector('[aria-selected="true"]').getAttribute('data-value');
  TdModal.closeAll();
  dtp.remove(); // v0.60.0: the picker dialog is a popover (not a modal): removing the host closes it
  await wait(400);
  TdToast._showSingle('Đã lưu', 'success', 0);
  await wait(400);
  const toastEl = document.querySelector('#td-toast-container .td-toast');
  const toastAlone = glass(toastEl);
  const toastIcon = !!toastEl.querySelector('.td-toast__icon');
  TdModal.show({ title: 'M', body: '<div>x</div>' });
  // wait for the modal to be really OPEN (two rAFs — slow on headless CI) instead of a fixed delay
  for (let t = 0; t < 3000 && !document.querySelector('.td-modal[data-state="open"]'); t += 50) await wait(50);
  await wait(100);
  const dialog = document.querySelector('.td-modal__dialog');
  const modalGlass = glass(dialog);
  // modalState is diagnostic only (printed if the D20 check fails): "open" = the :has() rule should match
  const toastOverModal = { ...glass(toastEl), modalState: document.querySelector('.td-modal')?.getAttribute('data-state') };
  document.documentElement.setAttribute('data-td-glass', 'off');
  await wait(400);
  const modalOff = glass(dialog);
  TdModal.closeAll();
  await wait(600); // modal gone → the toast is no longer "over a modal"; glass still off
  const toastOff = glass(toastEl);
  document.documentElement.removeAttribute('data-td-glass');
  // v0.12.0 popovers: TdMenu panel + td-chip-input suggestions — glass by default, opaque with glass off.
  const trig = document.createElement('button');
  trig.textContent = 'Thao tác';
  root.appendChild(trig);
  TdMenu.open(trig, [{ label: 'Sửa', onSelect() {} }, { label: 'Xoá', danger: true, onSelect() {} }]);
  const chip = document.createElement('td-chip-input');
  chip.setAttribute('aria-label', 'Tác giả');
  chip.setAttribute('show-on-focus', '');
  root.appendChild(chip);
  chip.options = [{ value: 'a', label: 'An' }, { value: 'b', label: 'Bình' }];
  await wait(400);
  const menuEl = document.querySelector('.td-menu');
  const menuGlass = glass(menuEl);
  document.documentElement.setAttribute('data-td-glass', 'off');
  await wait(300);
  const menuOff = glass(menuEl);
  document.documentElement.removeAttribute('data-td-glass');
  TdMenu.close();
  chip.querySelector('.td-chip-input__input').focus();
  await wait(500);
  const sugEl = document.querySelector('.td-chip-input__menu');
  const sugGlass = glass(sugEl);
  document.documentElement.setAttribute('data-td-glass', 'off');
  await wait(300);
  const sugOff = glass(sugEl);
  document.documentElement.removeAttribute('data-td-glass');
  return {
    menuGlass, menuOff, sugGlass, sugOff,
    sticky, stickyDark, wheelJumped, wheelSelected,
    toastAlone, toastIcon, modalGlass, toastOverModal, modalOff, toastOff,
    highlight: cs(ref).backgroundColor,
    thumbTransform: cs(thumb).transform,
    thumbWidth: thumb.getBoundingClientRect().width,
    thumbOffsetWidth: thumb.offsetWidth,
    indicatorTransition: cs(document.querySelector('#tb .td-tabs__indicator')).transitionDuration,
    selectedBorder: cs(selected).borderTopColor,
    currentPageBg: cs(document.querySelector('#pg .td-pagination__page[aria-current="page"]')).backgroundColor,
    sliderFillBg: cs(document.querySelector('#sl .td-slider__fill')).backgroundColor,
    spinnerFrozen: d0 === d1,
  };
})();
