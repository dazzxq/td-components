// Loaded by tokens.spec.mjs: token-native components under emulated media (reduced motion / forced colours).
import '/src/form/td-slider.js';
import '/src/display/td-tabs.js';
import '/src/display/td-pagination.js';
import { TdLoadingSpinner } from '/src/feedback/td-loading.js';

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
  return {
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
