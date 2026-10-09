/* Beacon Hub 1.0 — billboard hero with gentle rotation. */
'use strict';
import { h, btn, icon, clear } from './dom.js';
import { actions } from './actions.js';
import { enrich, fmtRuntime } from '../lib/meta.js';
import { playTarget } from './data.js';
import { prefs } from '../lib/store.js';
import { trakt } from '../lib/trakt.js';

export function hero(load, { eyebrow = '' } = {}) {
  const sec = h('section.hero.loading');
  const bgs = h('div.hero-bgs');
  const body = h('div.hero-body');
  const dots = h('div.hero-dots');
  sec.append(bgs, h('div.hero-shade'), body, dots);
  let items = [], idx = 0, timer = null, paused = false;

  const show = async i => {
    idx = (i + items.length) % items.length;
    const item = items[idx];
    for (const [j, d] of [...dots.children].entries()) d.classList.toggle('on', j === idx);
    for (const [j, b] of [...bgs.children].entries()) b.classList.toggle('on', j === idx);
    const content = h('div.hero-content');
    content.append(eyebrow ? h('div.hero-eyebrow', icon('star'), eyebrow) : null);
    if (item.logo) {
      const lg = h('img.hero-logo', { alt: item.title, referrerPolicy: 'no-referrer' });
      const fallbackTitle = h('h1.hero-title', item.title);
      lg.addEventListener('error', () => lg.replaceWith(fallbackTitle));
      lg.src = item.logo; content.append(lg);
    } else content.append(h('h1.hero-title', item.title));
    const meta = [item.year, item.type === 'show' ? 'Series' : fmtRuntime(item.runtime), item.certification, ...(item.genres || []).slice(0, 3).map(g => g[0].toUpperCase() + g.slice(1))].filter(Boolean);
    content.append(h('div.hero-meta', item.rating ? h('span.hero-rating', icon('star'), item.rating.toFixed(1)) : null, ...meta.map(m => h('span', m))));
    if (item.overview) content.append(h('p.hero-overview', item.overview));
    const playBtn = btn(item.type === 'movie' ? 'Play' : 'Play', { icon: 'play', kind: 'primary lg', onClick: async () => {
      const t = await playTarget(item);
      if (item.type === 'movie' || t.episode) actions.openSources(item, t.episode, { resumeAt: t.resumeAt, resumePct: t.resumePct });
      else actions.openDetails(item);
    } });
    const actionsRow = h('div.hero-actions', playBtn, btn('More Info', { icon: 'info', kind: 'glass lg', onClick: () => actions.openDetails(item) }));
    if (trakt.connected()) {
      const inWl = trakt.isWatchlisted(item);
      const wl = btn('', { icon: inWl ? 'check' : 'plus', kind: 'round glass lg', title: inWl ? 'In your watchlist' : 'Add to watchlist', onClick: async () => { await actions.toggleWatchlist(item); const now = trakt.isWatchlisted(item); wl.replaceChildren(icon(now ? 'check' : 'plus')); wl.title = now ? 'In your watchlist' : 'Add to watchlist'; } });
      actionsRow.append(wl);
    }
    content.append(actionsRow);
    const old = body.firstChild;
    body.append(content);
    requestAnimationFrame(() => content.classList.add('in'));
    if (old) { old.classList.remove('in'); old.classList.add('out'); setTimeout(() => old.remove(), 500); }
    playTarget(item).then(t => { if (playBtn.isConnected) playBtn.querySelector('span:last-child').textContent = t.label; }).catch(() => {});
  };
  const schedule = () => {
    clearInterval(timer);
    if (items.length > 1 && prefs().heroRotate) timer = setInterval(() => { if (!paused && !document.hidden && !document.body.classList.contains('modal-open') && sec.isConnected) show(idx + 1); else if (!sec.isConnected) clearInterval(timer); }, 11000);
  };
  sec.addEventListener('mouseenter', () => { paused = true; });
  sec.addEventListener('mouseleave', () => { paused = false; });
  sec.addEventListener('focusin', () => { paused = true; });
  sec.addEventListener('focusout', () => { paused = false; });

  Promise.resolve().then(load).then(async list => {
    list = (list || []).map(e => e.item || e).filter(i => i && i.ids?.imdb).slice(0, 6);
    if (!list.length) { sec.classList.add('empty'); sec.classList.remove('loading'); body.append(h('div.hero-content.in', h('h1.hero-title', 'Beacon Hub'), h('p.hero-overview', 'Connect Trakt in Settings to fill Beacon Hub with your watchlist, lists and recommendations.'), h('div.hero-actions', btn('Open Settings', { icon: 'gear', kind: 'primary lg', onClick: () => actions.navigate('#/settings') })))); return; }
    await Promise.all(list.map(i => enrich(i).catch(() => i)));
    items = list.filter(i => i.backdrop);
    if (!items.length) items = list;
    clear(bgs); clear(dots);
    items.forEach((it, j) => {
      const b = h('div.hero-bg');
      if (it.backdrop) { const img = h('img', { alt: '', referrerPolicy: 'no-referrer', loading: j === 0 ? 'eager' : 'lazy' }); img.addEventListener('load', () => b.classList.add('ready')); img.src = it.backdrop; b.append(img); }
      bgs.append(b);
      dots.append(h('button.hero-dot', { type: 'button', 'aria-label': `Show ${it.title}`, on: { click: () => { show(j); schedule(); } } }));
    });
    sec.classList.remove('loading');
    show(0); schedule();
  }).catch(e => { console.warn('hero failed', e); sec.classList.add('empty'); sec.classList.remove('loading'); });
  return sec;
}
