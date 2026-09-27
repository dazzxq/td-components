import { expect } from '@esm-bundle/chai';
import { TdSample } from './sample/td-sample.js';
import { TdDropdown } from '../form/td-dropdown.js';

// v0.16.0 A1: properties assigned before connect / before customElements.define are kept (not shadowed by an own
// data property), reflected to the attribute, and the element renders exactly ONCE on connect — also for a
// subclass that re-renders straight from its own attributeChangedCallback (td-dropdown).

let seq = 0;
/** A counting subclass of `Base` under a fresh tag name (define now or later). */
function counting(Base) {
  const tag = `td-v016-${Base.name.toLowerCase()}-${++seq}`;
  const Cls = class extends Base {
    render() { this.renders = (this.renders || 0) + 1; return super.render(); }
  };
  return { tag, Cls, define: () => customElements.define(tag, Cls) };
}

afterEach(() => { document.querySelectorAll('[data-v016]').forEach((n) => n.remove()); });

const mountHost = (el) => { el.setAttribute('data-v016', ''); document.body.appendChild(el); return el; };

describe('v0.16.0 A1 — a dashed attribute never replaces a subclass camelCase accessor (review ISSUE-1)', () => {
  it('fooBar accessor on the subclass is kept for observed "foo-bar"', () => {
    const tag = `td-v016-dash-${++seq}`;
    class Dash extends TdSample {
      static get observedAttributes() { return [...super.observedAttributes, 'foo-bar']; }
      get fooBar() { return `custom:${this.getAttribute('foo-bar') ?? ''}`; }
      set fooBar(v) { this.setAttribute('foo-bar', `set-${v}`); }
    }
    customElements.define(tag, Dash);
    const el = document.createElement(tag);
    mountHost(el);
    el.fooBar = 'x';
    expect(el.getAttribute('foo-bar')).to.equal('set-x');
    expect(el.fooBar).to.equal('custom:set-x');
    expect(Object.prototype.hasOwnProperty.call(el, 'fooBar')).to.equal(false);
  });
});

describe('v0.16.0 A1 — early properties (td-sample)', () => {
  it('before append: 3 properties land, reflect, one render', () => {
    const { tag, define } = counting(TdSample);
    define();
    const el = document.createElement(tag);
    el.label = 'Sớm';
    el.count = 5;
    el.disabled = true;
    mountHost(el);
    expect(el.renders).to.equal(1);
    expect(el.getAttribute('label')).to.equal('Sớm');
    expect(el.getAttribute('count')).to.equal('5');
    expect(el.hasAttribute('disabled')).to.equal(true);
    expect(el.label).to.equal('Sớm');
    expect(el.disabled).to.equal(true);
    expect(Object.prototype.hasOwnProperty.call(el, 'label')
      && typeof Object.getOwnPropertyDescriptor(el, 'label').get).to.equal('function'); // accessor, not data
    expect(el.querySelector('.td-sample__title').textContent).to.equal('Sớm');
    expect(el.querySelector('.td-sample__count').textContent).to.equal('Count: 5');
    expect(el.querySelector('button').disabled).to.equal(true);
    // Later assignments go through the accessor.
    el.label = 'Sau';
    expect(el.querySelector('.td-sample__title').textContent).to.equal('Sau');
  });

  it('before customElements.define (element already in the DOM): 3 properties land, one render', () => {
    const { tag, define } = counting(TdSample);
    const el = mountHost(document.createElement(tag)); // not upgraded yet
    el.label = 'Trước define';
    el.count = 2;
    el.disabled = true;
    define(); // upgrade → connectedCallback
    expect(el.renders).to.equal(1);
    expect(el.getAttribute('label')).to.equal('Trước define');
    expect(el.getAttribute('count')).to.equal('2');
    expect(el.hasAttribute('disabled')).to.equal(true);
    expect(el.querySelector('.td-sample__title').textContent).to.equal('Trước define');
  });

  it('false/null early values are replayed too (boolean off, attribute removed)', () => {
    const { tag, define } = counting(TdSample);
    define();
    const el = document.createElement(tag);
    el.setAttribute('disabled', '');
    el.setAttribute('label', 'x');
    el.disabled = false;
    el.label = null;
    mountHost(el);
    expect(el.hasAttribute('disabled')).to.equal(false);
    expect(el.hasAttribute('label')).to.equal(false);
    expect(el.renders).to.equal(1);
  });
});

describe('v0.16.0 A1 — early properties (td-dropdown, renders from its own attributeChangedCallback)', () => {
  it('before append: label/placeholder/disabled land, reflect, one render', () => {
    const { tag, define } = counting(TdDropdown);
    define();
    const el = document.createElement(tag);
    el.label = 'Thành phố';
    el.placeholder = 'Chọn…';
    el.disabled = true;
    mountHost(el);
    expect(el.renders).to.equal(1);
    expect(el.getAttribute('label')).to.equal('Thành phố');
    expect(el.getAttribute('placeholder')).to.equal('Chọn…');
    expect(el.hasAttribute('disabled')).to.equal(true);
    expect(el.textContent).to.include('Thành phố');
  });

  it('before customElements.define: label/placeholder/value-key land, one render', () => {
    const { tag, define } = counting(TdDropdown);
    const el = mountHost(document.createElement(tag));
    el.label = 'Quận';
    el.placeholder = 'Chọn quận';
    el.valueKey = 'id';
    define();
    expect(el.renders).to.equal(1);
    expect(el.getAttribute('label')).to.equal('Quận');
    expect(el.getAttribute('placeholder')).to.equal('Chọn quận');
    expect(el.getAttribute('value-key')).to.equal('id');
    expect(el.textContent).to.include('Quận');
  });

  it('_doRender() is a no-op while renders are suppressed (shared choke point)', () => {
    const { tag, define } = counting(TdDropdown);
    define();
    const el = mountHost(document.createElement(tag));
    const before = el.renders;
    el._suppressRender = true;
    el._doRender();
    el._suppressRender = false;
    expect(el.renders).to.equal(before);
  });
});
