/**
 * v0.122.0: site callbacks that run BEFORE the component dispatches its CustomEvent (plan v0.122.0-callback-props).
 * Kit events bubble + are composed, so a capture listener on `document` sees them before a listener on the host and can
 * stop them; a callback property is called directly and cannot be stopped that way.
 */

/**
 * Run a site callback; a throw is logged and never breaks the component flow.
 * @param {Function} fn
 * @param {unknown} arg
 * @param {string} what label for the log, e.g. `td-slider: onChange`
 */
export function safeCall(fn, arg, what) {
  try {
    fn(arg);
  } catch (err) {
    console.error(`${what} threw`, err);
  }
}

/**
 * Define callback properties (`onChange`, `onInput`…) on a class prototype: default `null`, a non-function is stored
 * as `null`. Prototype accessors, so a value assigned before the upgrade is replayed (utils/upgrade-props.js).
 * @param {Function} Klass
 * @param {string[]} names
 */
export function defineCallbackProps(Klass, names) {
  for (const name of names) {
    Object.defineProperty(Klass.prototype, name, {
      get() { return this._callbacks?.[name] ?? null; },
      set(fn) { (this._callbacks ||= {})[name] = typeof fn === 'function' ? fn : null; },
      configurable: true,
    });
  }
}

/**
 * Call the element's callback property `name` (if set) with `value`, guarded.
 * @param {HTMLElement} el
 * @param {string} name
 * @param {unknown} value
 */
export function fireCallback(el, name, value) {
  const fn = el._callbacks?.[name];
  if (fn) safeCall(fn, value, `${el.localName}: ${name}`);
}
