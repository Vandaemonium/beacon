/* Beacon Hub 1.0 — tiny DOM helpers (no innerHTML for remote data). */
'use strict';

export function h(tag, props, ...kids) {
  const [name, ...cls] = String(tag).split('.');
  const el = document.createElement(name || 'div');
  if (cls.length) el.className = cls.join(' ');
  if (props && (typeof props !== 'object' || props instanceof Node || Array.isArray(props))) { kids.unshift(props); props = null; }
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'on') for (const [ev, fn] of Object.entries(v)) el.addEventListener(ev, fn);
    else if (k === 'class') el.className += (el.className ? ' ' : '') + v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'html') el.innerHTML = v; // trusted, static markup only (icons)
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k in el && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  append(el, kids);
  return el;
}
function append(el, kids) {
  for (const k of kids.flat(Infinity)) {
    if (k == null || k === false) continue;
    el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
}
export const $ = (s, root = document) => root.querySelector(s);
export const $$ = (s, root = document) => [...root.querySelectorAll(s)];
export const clear = el => { el.replaceChildren(); return el; };

const P = 'xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
export const ICONS = {
  play: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M7 4.6v14.8c0 .8.9 1.3 1.6.9l12-7.4c.6-.4.6-1.4 0-1.8l-12-7.4C7.9 3.3 7 3.8 7 4.6Z"/></svg>',
  pause: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="4" width="4" height="16" rx="1.2" fill="currentColor"/><rect x="14" y="4" width="4" height="16" rx="1.2" fill="currentColor"/></svg>',
  plus: `<svg ${P}><path d="M12 5v14M5 12h14"/></svg>`,
  check: `<svg ${P}><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>`,
  info: `<svg ${P}><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.5v.01"/></svg>`,
  search: `<svg ${P}><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>`,
  gear: `<svg ${P}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/></svg>`,
  chevronDown: `<svg ${P}><path d="m6 9 6 6 6-6"/></svg>`,
  chevronLeft: `<svg ${P}><path d="m15 18-6-6 6-6"/></svg>`,
  chevronRight: `<svg ${P}><path d="m9 18 6-6-6-6"/></svg>`,
  x: `<svg ${P}><path d="M18 6 6 18M6 6l12 12"/></svg>`,
  back: `<svg ${P}><path d="M19 12H5M12 19l-7-7 7-7"/></svg>`,
  cloud: `<svg ${P}><path d="M17.5 19a4.5 4.5 0 1 0-1.4-8.8A6 6 0 0 0 4.3 12.6 3.5 3.5 0 0 0 6.5 19Z"/></svg>`,
  list: `<svg ${P}><path d="M4 6h11M4 12h11M4 18h7M18 15v6M15 18h6"/></svg>`,
  star: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="m12 2.8 2.8 5.8 6.3.9-4.6 4.4 1.1 6.3L12 17.2l-5.6 3 1.1-6.3L2.9 9.5l6.3-.9Z"/></svg>',
  eye: `<svg ${P}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>`,
  volume: `<svg ${P}><path d="M11 5 6 9H2v6h4l5 4Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/></svg>`,
  mute: `<svg ${P}><path d="M11 5 6 9H2v6h4l5 4Z"/><path d="m23 9-6 6M17 9l6 6"/></svg>`,
  fullscreen: `<svg ${P}><path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3"/></svg>`,
  rewind: `<svg ${P}><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><text x="12" y="15.5" font-size="7" text-anchor="middle" fill="currentColor" stroke="none" font-weight="700">10</text></svg>`,
  forward: `<svg ${P}><path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/><text x="12" y="15.5" font-size="7" text-anchor="middle" fill="currentColor" stroke="none" font-weight="700">10</text></svg>`,
  next: `<svg ${P}><path d="m5 4 10 8-10 8Z" fill="currentColor"/><path d="M19 5v14"/></svg>`,
  link: `<svg ${P}><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/></svg>`,
  more: `<svg ${P}><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></svg>`,
  sync: `<svg ${P}><path d="M21 12a9 9 0 0 1-15.4 6.4L3 16M3 12a9 9 0 0 1 15.4-6.4L21 8"/><path d="M21 3v5h-5M3 21v-5h5"/></svg>`,
  tv: `<svg ${P}><rect x="2" y="6" width="20" height="14" rx="2"/><path d="m8 2 4 4 4-4"/></svg>`,
  download: `<svg ${P}><path d="M12 3v12M7 10l5 5 5-5M5 21h14"/></svg>`,
  trash: `<svg ${P}><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>`,
  alert: `<svg ${P}><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17v.01"/></svg>`,
  film: `<svg ${P}><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 3v18M17 3v18M3 8h4M3 16h4M17 8h4M17 16h4M3 12h18"/></svg>`,
  copy: `<svg ${P}><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/></svg>`,
};
export const icon = (name, cls = '') => h('span.ico' + (cls ? '.' + cls : ''), { html: ICONS[name] || '' });

export function btn(label, opts = {}) {
  const { icon: ic, kind = '', onClick, title, disabled, cls } = opts;
  const b = h('button.btn' + (kind ? '.' + kind.split(' ').join('.') : '') + (cls ? '.' + cls : ''), { type: 'button', title: title || null, 'aria-label': title || (typeof label === 'string' ? label : null), disabled: !!disabled, on: onClick ? { click: e => { e.stopPropagation(); onClick(e); } } : null },
    ic ? icon(ic) : null, label ? h('span', label) : null);
  return b;
}
export const roundBtn = (ic, title, onClick, extra = '') => btn('', { icon: ic, kind: 'round' + (extra ? ' ' + extra : ''), title, onClick });

/** Image with graceful fallback to a typographic placeholder. */
export function art(src, { alt = '', fallback = '', cls = '', eager = false } = {}) {
  const wrap = h('div.art' + (cls ? '.' + cls : ''));
  const fb = h('div.art-fallback', h('span', fallback || ''));
  wrap.append(fb);
  if (src) {
    const img = h('img', { alt, loading: eager ? 'eager' : 'lazy', decoding: 'async', referrerPolicy: 'no-referrer' });
    img.addEventListener('load', () => { wrap.classList.add('loaded'); });
    img.addEventListener('error', () => { img.remove(); wrap.classList.add('failed'); });
    img.src = src;
    wrap.append(img);
  } else wrap.classList.add('failed');
  return wrap;
}

let toastHost;
export function toast(msg, { error = false, action, actionLabel, ms = 3800 } = {}) {
  toastHost ||= document.getElementById('toasts');
  const t = h('div.toast' + (error ? '.error' : ''), { role: 'status' }, h('span', msg),
    action ? btn(actionLabel || 'Undo', { kind: 'link', onClick: () => { action(); t.remove(); } }) : null);
  toastHost.append(t);
  requestAnimationFrame(() => t.classList.add('in'));
  setTimeout(() => { t.classList.remove('in'); setTimeout(() => t.remove(), 300); }, ms);
}

/** Promise-based confirm dialog styled like the app. */
export function confirmDialog({ title, body, ok = 'Confirm', cancel = 'Cancel', danger = false, extra }) {
  return new Promise(resolve => {
    const done = v => { back.classList.remove('in'); setTimeout(() => back.remove(), 200); document.removeEventListener('keydown', key, true); resolve(v); };
    const key = e => { if (e.key === 'Escape') { e.stopPropagation(); done(false); } };
    const back = h('div.dialog-back', { on: { click: e => { if (e.target === back) done(false); } } },
      h('div.dialog', { role: 'dialog', 'aria-modal': 'true' },
        h('h3', title), body ? h('p.muted', body) : null,
        h('div.dialog-actions',
          extra ? btn(extra.label, { kind: 'ghost', onClick: () => done(extra.value) }) : null,
          btn(cancel, { kind: 'ghost', onClick: () => done(false) }),
          btn(ok, { kind: danger ? 'danger' : 'primary', onClick: () => done(true) }))));
    document.body.append(back);
    document.addEventListener('keydown', key, true);
    requestAnimationFrame(() => back.classList.add('in'));
    back.querySelector('.dialog-actions .btn:last-child').focus();
  });
}

/** Anchored popover menu. items: [{label, icon, checked, onClick, sep}] or nodes */
export function popover(anchor, build) {
  closePopovers();
  const pop = h('div.popover', { role: 'menu' });
  build(pop, () => closePopovers());
  document.body.append(pop);
  const r = anchor.getBoundingClientRect();
  const w = pop.offsetWidth, hgt = pop.offsetHeight;
  let left = Math.min(window.innerWidth - w - 12, Math.max(12, r.left + r.width / 2 - w / 2));
  let top = r.bottom + 8;
  if (top + hgt > window.innerHeight - 12) top = Math.max(12, r.top - hgt - 8);
  Object.assign(pop.style, { left: left + 'px', top: top + 'px' });
  requestAnimationFrame(() => pop.classList.add('in'));
  setTimeout(() => document.addEventListener('pointerdown', outside, true));
  function outside(e) { if (!pop.contains(e.target)) closePopovers(); }
  pop._cleanup = () => document.removeEventListener('pointerdown', outside, true);
  return pop;
}
export function closePopovers() { for (const p of $$('.popover')) { p._cleanup?.(); p.remove(); } }
export function menuItem(label, { icon: ic, checked, onClick, danger } = {}) {
  return h('button.menu-item' + (danger ? '.danger' : ''), { type: 'button', role: 'menuitemcheckbox', 'aria-checked': checked == null ? null : String(!!checked), on: { click: onClick } },
    h('span.menu-check', checked ? icon('check') : ic ? icon(ic) : ''), h('span', label));
}

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch { const ta = h('textarea', { style: { position: 'fixed', opacity: '0' } }); ta.value = text; document.body.append(ta); ta.select(); const ok = document.execCommand('copy'); ta.remove(); return ok; }
}

/** Styled text prompt. Resolves to the entered string or null. */
export function promptDialog({ title, body, placeholder = '', ok = 'Save', value = '' }) {
  return new Promise(resolve => {
    const input = h('input.pop-input', { placeholder, value, maxlength: '100' });
    const done = v => { back.classList.remove('in'); setTimeout(() => back.remove(), 200); document.removeEventListener('keydown', key, true); resolve(v); };
    const key = e => { if (e.key === 'Escape') { e.stopPropagation(); done(null); } if (e.key === 'Enter' && document.activeElement === input) done(input.value.trim() || null); };
    const back = h('div.dialog-back', { on: { click: e => { if (e.target === back) done(null); } } },
      h('div.dialog', { role: 'dialog', 'aria-modal': 'true' }, h('h3', title), body ? h('p.muted', body) : null, input,
        h('div.dialog-actions', btn('Cancel', { kind: 'ghost', onClick: () => done(null) }), btn(ok, { kind: 'primary', onClick: () => done(input.value.trim() || null) }))));
    document.body.append(back);
    document.addEventListener('keydown', key, true);
    requestAnimationFrame(() => { back.classList.add('in'); input.focus(); });
  });
}
