// Loaded by tokens.spec.mjs: token-native components under emulated media (reduced motion / forced colours).
import '/src/form/td-slider.js';
import '/src/display/td-tabs.js';
import '/src/display/td-pagination.js';
import { TdLoadingSpinner } from '/src/feedback/td-loading.js';
import { TdModal } from '/src/feedback/td-modal.js';
import { TdToast } from '/src/feedback/td-toast.js';

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
  TdToast._showSingle('Đã lưu', 'success', 0);
  await wait(400);
  const toastEl = document.querySelector('#td-toast-container .td-toast');
  const toastAlone = glass(toastEl);
  TdModal.show({ title: 'M', body: '<div>x</div>' });
  await wait(500);
  const dialog = document.querySelector('.td-modal__dialog');
  const modalGlass = glass(dialog);
  const toastOverModal = glass(toastEl);
  document.documentElement.setAttribute('data-td-glass', 'off');
  await wait(400);
  const modalOff = glass(dialog);
  TdModal.closeAll();
  await wait(600); // modal gone → the toast is no longer "over a modal"; glass still off
  const toastOff = glass(toastEl);
  document.documentElement.removeAttribute('data-td-glass');
  return {
    toastAlone, modalGlass, toastOverModal, modalOff, toastOff,
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
