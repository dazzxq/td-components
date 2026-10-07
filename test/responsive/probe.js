/**
 * In-page measurement functions for the responsive gate (test/responsive/responsive.spec.mjs). Each export is passed
 * to `page.evaluate`, so it must be self-contained (no closure over module scope). Derived from the v0.34.0 audit
 * scripts (plan v0.34.0, "Kết quả audit").
 */

/** Resolve once the page is quiet: fonts loaded, no running finite animation, no DOM mutation for 3 frames. */
export async function settle() {
  if (document.fonts && document.fonts.ready) await document.fonts.ready;
  const finite = () => document.getAnimations().filter((a) => {
    const t = a.effect && a.effect.getComputedTiming ? a.effect.getComputedTiming() : null;
    return a.playState === 'running' && t && t.iterations !== Infinity;
  });
  const deadline = performance.now() + 4000;
  let quiet = 0;
  let mutated = false;
  const mo = new MutationObserver(() => { mutated = true; });
  mo.observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
  try {
    while (performance.now() < deadline) {
      await Promise.all(finite().map((a) => a.finished.catch(() => {})));
      await new Promise((r) => requestAnimationFrame(() => r()));
      if (mutated || finite().length) { quiet = 0; mutated = false; continue; }
      quiet += 1;
      if (quiet >= 3) return true;
    }
    return false;
  } finally {
    mo.disconnect();
  }
}

/**
 * Static geometry checks inside `rootSel` (default body).
 * @param {{ root?: string, targets?: boolean, coarse?: boolean, allow?: string[], overlaps?: boolean }} opts
 */
export function analyze(opts) {
  const de = document.documentElement;
  const vw = de.clientWidth;
  const vh = window.innerHeight;
  const vis = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false;
    }
    return true;
  };
  const path = (el) => {
    const parts = [];
    for (let n = el; n && n.nodeType === 1 && parts.length < 4; n = n.parentElement) {
      let s = n.tagName.toLowerCase();
      if (n.id) s += `#${n.id}`;
      const cls = [...n.classList].slice(0, 2).join('.');
      if (cls) s += `.${cls}`;
      parts.unshift(s);
      if (n.id) break;
    }
    const sec = el.closest && el.closest('[data-section]');
    return `${sec ? `[${sec.dataset.section}] ` : ''}${parts.join(' > ')}`;
  };
  /** Clipped by an ancestor scroller that is itself inside the viewport (kit scroll regions: table, tabs). */
  const clipped = (el) => {
    for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.overflowX !== 'visible') {
        const r = n.getBoundingClientRect();
        if (r.right <= vw + 1 && r.left >= -1) return true;
      }
      if (cs.position === 'fixed') return false;
    }
    return false;
  };
  const roots = opts.root ? [...document.querySelectorAll(opts.root)] : [document.body];
  const all = roots.flatMap((r) => [r, ...r.querySelectorAll('*')]).filter((el) => !(el.closest('svg') && el.tagName !== 'svg'));
  const out = { vw, vh, scrollWidth: de.scrollWidth, pageOverflow: de.scrollWidth > vw + 1, outside: [], targets: [], overlaps: [], truncatedTabs: [] };

  // 1. outside the viewport horizontally (outermost offender only)
  const off = new Set();
  for (const el of all) {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    if ((r.right > vw + 1 || r.left < -1) && !clipped(el) && vis(el)) off.add(el);
  }
  for (const el of off) {
    if (el.parentElement && off.has(el.parentElement)) continue;
    const r = el.getBoundingClientRect();
    out.outside.push(`${path(el)} ${Math.round(r.left)}..${Math.round(r.right)} (vw ${vw})`);
  }

  // 2. touch / pointer targets — effective hit area by elementFromPoint probes
  if (opts.targets) {
    const min = opts.coarse ? 44 : 24;
    const SEL = 'button, a[href], input:not([type=hidden]), select, textarea, summary, [role=button], [role=tab], [role=option], [role=menuitem], [role=menuitemcheckbox], [role=menuitemradio], [role=checkbox], [role=switch], [role=radio], [role=slider], [role=treeitem], [role=combobox], [tabindex="0"]';
    for (const el of all) {
      if (!el.matches || !el.matches(SEL) || el.closest('[inert]')) continue;
      if (!(el.closest('[class*="td-"]') || el.tagName.startsWith('TD-'))) continue;
      if ((opts.allow || []).some((s) => el.matches(s))) continue;
      const r0 = el.getBoundingClientRect();
      const cs0 = getComputedStyle(el);
      let target = el;
      if (el.tagName === 'INPUT' && (r0.width <= 2 || r0.height <= 2 || Number(cs0.opacity) === 0)) target = el.closest('label') || el.parentElement;
      else if (!vis(el)) continue;
      // a field box that forwards a press to its input (td-number-input, td-chip-input, v0.55.0 td-input-field with an affix)
      // is the real target
      const fwd = el.tagName === 'INPUT' && el.closest('.td-number__box, .td-chip-input__box, .td-field__box');
      if (fwd) target = fwd;
      if (!vis(target)) continue;
      let rr = target.getBoundingClientRect();
      if (rr.width >= min && rr.height >= min) continue;
      // bring it into view when it is off-screen OR clipped / covered (e.g. below a scroller's visible part, under a
      // dialog footer): never smooth — measure where it lands
      const cHit = (() => {
        const x = rr.left + rr.width / 2; const y = rr.top + rr.height / 2;
        if (x < 0 || y < 0 || x >= vw || y >= vh) return false;
        const h = document.elementFromPoint(x, y);
        return !!h && (h === target || target.contains(h));
      })();
      if (!cHit) target.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
      rr = target.getBoundingClientRect();
      if (rr.right < 0 || rr.left > vw) continue; // inside a horizontal scroller, scrolled away
      const half = min / 2 - 0.5;
      const hits = (x, y, axis) => {
        if (x < 0 || y < 0 || x >= vw || y >= vh) return false;
        const h = document.elementFromPoint(x, y);
        if (!h) return false;
        if (target === h || target.contains(h)) return true;
        const lab = h.closest('label');
        if (lab && (lab.contains(target) || (target.id && lab.htmlFor === target.id))) return true;
        // a thin wrapper along the probed axis (the field box around an input, its border): ≤ 4px larger
        if (h.contains(target)) {
          const hr = h.getBoundingClientRect();
          return axis === 'x' ? hr.left >= rr.left - 4 && hr.right <= rr.right + 4 : hr.top >= rr.top - 4 && hr.bottom <= rr.bottom + 4;
        }
        return false;
      };
      const measure = () => {
        const b = target.getBoundingClientRect();
        const x = b.left + b.width / 2; const y = b.top + b.height / 2;
        rr = b;
        return (b.width >= min || (hits(x - half, y, 'x') && hits(x + half, y, 'x')))
          && (b.height >= min || (hits(x, y - half, 'y') && hits(x, y + half, 'y')));
      };
      if (measure()) continue;
      // a probe may have left a partly clipped target (edge of a scroller): centre it once and measure again
      if (cHit) {
        target.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
        if (measure()) continue;
      }
      const label = (target.getAttribute('aria-label') || target.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 30);
      out.targets.push(`${path(target)} "${label}" ${Math.round(rr.width)}×${Math.round(rr.height)} < ${min}`);
    }
  }

  // 3. overlapping text leaves (table / tabs / pagination / cards)
  if (opts.overlaps) {
    const scopes = [...document.querySelectorAll('td-table, td-tabs, td-pagination')];
    for (const scope of scopes) {
      const leaves = [...scope.querySelectorAll('*')].filter((el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && vis(el) && !el.closest('.td-sr-only'));
      if (leaves.length > 400) continue;
      for (let i = 0; i < leaves.length; i++) {
        for (let j = i + 1; j < leaves.length; j++) {
          const a = leaves[i]; const b = leaves[j];
          if (a.contains(b) || b.contains(a)) continue;
          const ra = a.getBoundingClientRect(); const rb = b.getBoundingClientRect();
          const ix = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
          const iy = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
          if (ix <= 2 || iy <= 2) continue;
          if ((ix * iy) / Math.min(ra.width * ra.height, rb.width * rb.height) < 0.25) continue;
          out.overlaps.push(`${path(a)} "${a.textContent.trim().slice(0, 20)}" × "${b.textContent.trim().slice(0, 20)}"`);
        }
      }
    }
    // 4. tab labels never truncated
    for (const lab of document.querySelectorAll('.td-tabs__label')) {
      if (vis(lab) && lab.scrollWidth > lab.clientWidth + 1) out.truncatedTabs.push(`${path(lab)} "${lab.textContent.trim()}" ${lab.clientWidth}/${lab.scrollWidth}`);
    }
  }
  return out;
}

/** Geometry of the last visible element matching `sel` (an open overlay). */
export function panel(sel) {
  const vw = document.documentElement.clientWidth;
  const vh = window.innerHeight;
  const els = [...document.querySelectorAll(sel)].filter((e) => {
    const r = e.getBoundingClientRect();
    const cs = getComputedStyle(e);
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none';
  });
  if (!els.length) return { found: false };
  const r = els[els.length - 1].getBoundingClientRect();
  return { found: true, vw, vh, left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
}

/** Each element of `sels` (first visible match) fully inside the viewport. */
export function inViewport(sels) {
  const vw = document.documentElement.clientWidth;
  const vh = window.innerHeight;
  const bad = [];
  for (const sel of sels) {
    const el = [...document.querySelectorAll(sel)].reverse().find((e) => e.getBoundingClientRect().width > 0);
    if (!el) { bad.push(`${sel}: missing`); continue; }
    const r = el.getBoundingClientRect();
    if (r.left < -1 || r.top < -1 || r.right > vw + 1 || r.bottom > vh + 1) bad.push(`${sel} ${Math.round(r.left)},${Math.round(r.top)}–${Math.round(r.right)},${Math.round(r.bottom)} (vp ${vw}×${vh})`);
  }
  return bad;
}
