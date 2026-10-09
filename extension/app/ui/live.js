/* Beacon Hub 1.1 — Live TV in the same style as Movies & TV Shows. */
'use strict';
import { h, btn, icon, clear, toast, art, confirmDialog } from './dom.js';
import { actions } from './actions.js';
import { emptyState, grid } from './cards.js';
import { defRow } from './pages.js';
import { iptv, fmtClock, progressOf } from '../lib/iptv.js';
import { playLive } from './live-player.js';
import { prefs, setPref } from '../lib/store.js';
import { connectionDialog } from './netcheck-ui.js';

/* ---------- lazy now/next for whatever is on screen ---------- */
const io = new IntersectionObserver(entries => {
  for (const e of entries) {
    if (!e.isIntersecting) continue;
    io.unobserve(e.target);
    const fill = e.target._fillGuide;
    if (fill) iptv.guide(e.target._ch).then(fill);
  }
}, { rootMargin: '200px' });

function watchGuide(el, ch, fill) {
  el._ch = ch; el._fillGuide = fill;
  const cached = iptv.epg.get(ch.id);
  if (cached?.list && cached.at) fill(cached.list);
  if (!cached?.at || Date.now() - cached.at > 10 * 60e3) io.observe(el);
}

/* ---------- channel card (landscape, like Continue Watching) ---------- */
export function channelCard(ch, list, listName) {
  const play = () => playLive(ch, list, listName);
  const card = h('article.card.wide.channel', { tabIndex: 0, role: 'button', 'aria-label': `Watch ${ch.name} live`,
    on: { click: play, keydown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); play(); } } } });
  const frame = h('div.card-frame');
  const stage = h('div.ch-stage', h('div.ch-glow'));
  if (ch.logo) {
    const img = h('img.ch-logo', { alt: '', loading: 'lazy', referrerPolicy: 'no-referrer' });
    img.addEventListener('error', () => { img.remove(); stage.append(h('div.ch-initials', initials(ch.name))); });
    img.src = ch.logo; stage.append(img);
  } else stage.append(h('div.ch-initials', initials(ch.name)));
  frame.append(stage, h('span.live-badge', h('i'), 'LIVE'), h('div.wide-play', icon('play')));
  const fav = btn('', { icon: 'star', kind: 'round xs' + (iptv.isFav(ch) ? ' on-fav' : ''), title: iptv.isFav(ch) ? 'Remove from favorites' : 'Add to favorites',
    onClick: () => { const on = iptv.toggleFav(ch); fav.classList.toggle('on-fav', on); fav.title = on ? 'Remove from favorites' : 'Add to favorites'; toast(on ? `${ch.name} added to favorites` : `${ch.name} removed from favorites`); } });
  frame.append(h('div.wide-tools', fav));
  const bar = h('div.progress.ch-progress', h('i', { style: { width: '0%' } }));
  frame.append(bar);
  card.append(frame);
  const sub = h('div.card-sub', ' ');
  card.append(h('div.card-caption', h('div.card-title', ch.name), sub));
  watchGuide(card, ch, guide => {
    const n = guide?.[0];
    sub.textContent = n ? `${n.title} · until ${fmtClock(n.end)}` : 'No guide info';
    bar.firstChild.style.width = (n ? progressOf(n) * 100 : 0) + '%';
    bar.classList.toggle('empty', !n);
  });
  return card;
}
const initials = name => String(name).replace(/\b(HD|FHD|UHD|4K|SD|US|UK|CA)\b/gi, '').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase() || 'TV';

/* ---------- sign in ---------- */
function signInView(onDone) {
  const server = h('input', { type: 'url', placeholder: 'http://provider.example:8080', autocomplete: 'url', required: true });
  const user = h('input', { placeholder: 'Username', autocomplete: 'username' });
  const pass = h('input', { type: 'password', placeholder: 'Password', autocomplete: 'current-password' });
  const remember = h('input', { type: 'checkbox', checked: iptv.remember() });
  const err = h('p.error.small');
  const submit = btn('Sign in', { kind: 'primary lg', icon: 'tv' });
  const form = h('form.live-login', { on: { submit: async e => {
    e.preventDefault(); err.textContent = ''; submit.disabled = true; submit.querySelector('span:last-child').textContent = 'Signing in…';
    try { await iptv.signIn({ server: server.value, username: user.value, password: pass.value }, remember.checked); onDone(); }
    catch (x) { err.textContent = x.message; submit.disabled = false; submit.querySelector('span:last-child').textContent = 'Sign in'; }
  } } },
    h('div.live-login-icon', icon('tv')), h('h2', 'Sign in to Live TV'),
    h('p.muted', 'Enter your IPTV provider’s Xtream Codes details. Requests go straight from this browser to your provider, so your browser VPN extension can cover them.'),
    h('label.field', h('span.field-label', 'Server URL'), server), h('label.field', h('span.field-label', 'Username'), user), h('label.field', h('span.field-label', 'Password'), pass),
    h('label.check', remember, h('span', 'Remember this login on this browser')), err, submit,
    h('p.muted.small', 'Use only services you’re authorized to access. On a shared computer, leave “Remember” off.'));
  form.querySelector('button').type = 'submit';
  return h('div.live-login-wrap', form);
}

/* ---------- page ---------- */
export function livePage() {
  const page = h('div.page.flat.live-page');
  const body = h('div.live-body');
  page.append(body);
  let view = prefs().liveView || 'channels', cat = 'all', query = '', guideLimit = 60;

  let drawnAt = -1;
  const draw = () => {
    drawnAt = iptv.loadedAt;
    clear(body);
    if (!iptv.signedIn()) { body.append(signInView(() => { toast('Signed in to Live TV'); load(true); })); return; }
    if (!iptv.channels.length) {
      body.append(h('header.page-head', h('div', h('div.page-kicker', 'Live TV'), h('h1', 'Loading channels…'))), h('div.loading-inline', h('div.ring'), 'Getting your channel list from your provider…'));
      return;
    }
    body.append(liveHero(), toolbar(), content());
  };
  const load = async force => {
    draw();
    try { await iptv.refresh(force); } catch (e) {
      clear(body).append(emptyState('Couldn’t load your channels', e.message, h('div.btn-row.center', btn('Try again', { kind: 'primary', onClick: () => load(true) }), btn('Sign out', { kind: 'ghost', onClick: signOut }))));
      return;
    }
    draw();
  };
  const signOut = async () => {
    if (!(await confirmDialog({ title: 'Sign out of Live TV?', body: 'Removes the saved IPTV login from this browser. Favorites stay saved for when you sign in again.', ok: 'Sign out', danger: true }))) return;
    iptv.signOut(); draw();
  };

  function liveHero() {
    const last = iptv.recent()[0];
    const hero = h('section.live-hero');
    const head = h('div.live-hero-text', h('div.page-kicker', 'Live TV'));
    if (!last) {
      head.append(h('h1', 'Live TV'), h('p.muted', `${iptv.visibleChannels().length.toLocaleString()} channels from your provider. Pick a channel to start watching.`));
      hero.append(head);
      return hero;
    }
    const nowEl = h('p.lh-now', ' ');
    const bar = h('div.progress.inline.lh-bar', h('i', { style: { width: '0%' } }));
    head.append(h('div.lh-label', 'Continue watching'), h('h1', last.name), nowEl, bar,
      h('div.hero-actions', btn('Watch live', { icon: 'play', kind: 'primary lg', onClick: () => playLive(last, iptv.recent(), 'Recently watched') }),
        btn(iptv.isFav(last) ? 'In favorites' : 'Add to favorites', { icon: 'star', kind: 'glass lg', onClick: e => { const on = iptv.toggleFav(last); e.currentTarget.querySelector('span:last-child').textContent = on ? 'In favorites' : 'Add to favorites'; } })));
    const logo = h('div.lh-logo', last.logo ? art(last.logo, { fallback: initials(last.name), eager: true }) : h('div.ch-initials', initials(last.name)));
    hero.append(h('div.lh-glow'), head, logo);
    iptv.guide(last).then(list => {
      const n = list?.[0], nx = list?.[1];
      nowEl.textContent = n ? `Now: ${n.title} · ${fmtClock(n.start)}–${fmtClock(n.end)}${nx ? `   ·   Next: ${nx.title} at ${fmtClock(nx.start)}` : ''}` : (iptv.categories.find(c => c.id === last.cat)?.name || '');
      bar.firstChild.style.width = (n ? progressOf(n) * 100 : 0) + '%';
      bar.classList.toggle('hidden', !n);
    });
    return hero;
  }

  function toolbar() {
    const bar = h('div.live-toolbar');
    const tabs = h('div.pill-tabs.inline', { role: 'tablist' });
    for (const [k, label] of [['channels', 'Channels'], ['guide', 'TV Guide']])
      tabs.append(h('button.pill' + (view === k ? '.on' : ''), { type: 'button', role: 'tab', on: { click: () => { view = k; setPref('liveView', k); draw(); } } }, label));
    const search = h('input.live-search', { type: 'search', placeholder: 'Search channels', value: query, 'aria-label': 'Search channels' });
    let t; search.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { query = search.value.trim().toLowerCase(); redrawContent(); }, 250); });
    const tools = h('div.page-tools',
      btn('VPN check', { icon: 'link', kind: 'ghost small', title: 'Check which internet address Live TV is using', onClick: connectionDialog }),
      btn('Categories', { icon: 'list', kind: 'ghost small', onClick: manageCategories }),
      btn('Refresh', { icon: 'sync', kind: 'ghost small', onClick: async e => { e.currentTarget.classList.add('spinning'); iptv.epg.clear(); await load(true); } }),
      btn('Sign out', { kind: 'ghost small', onClick: signOut }));
    bar.append(tabs, h('div.live-search-wrap', icon('search'), search), tools);
    const chips = h('div.cat-chips', { role: 'toolbar', 'aria-label': 'Categories' });
    const chip = (id, label, count) => h('button.chip' + (cat === id ? '.on' : ''), { type: 'button', on: { click: () => { cat = id; guideLimit = 60; draw(); } } }, label, count != null ? h('span.chip-count', String(count)) : null);
    const vis = iptv.visibleChannels();
    chips.append(chip('all', 'All channels', vis.length));
    if (iptv.favorites().length) chips.append(chip('fav', '★ Favorites', iptv.favorites().length));
    if (iptv.recent().length) chips.append(chip('recent', 'Recent', iptv.recent().length));
    const counts = new Map(); for (const c of vis) counts.set(c.cat, (counts.get(c.cat) || 0) + 1);
    for (const c of iptv.visibleCategories()) if (counts.get(c.id)) chips.append(chip(c.id, c.name, counts.get(c.id)));
    return h('div.live-controls', bar, chips);
  }

  let contentEl = null;
  function redrawContent() { const old = contentEl; const n = content(); old?.replaceWith(n); }
  function listFor() {
    let list, name;
    if (cat === 'fav') { list = iptv.favorites(); name = 'Favorites'; }
    else if (cat === 'recent') { list = iptv.recent(); name = 'Recently watched'; }
    else if (cat === 'all') { list = iptv.visibleChannels(); name = 'All channels'; }
    else { list = iptv.visibleChannels().filter(c => c.cat === cat); name = iptv.categories.find(c => c.id === cat)?.name || 'Channels'; }
    if (query) { list = list.filter(c => c.name.toLowerCase().includes(query)); name = `“${query}”`; }
    return { list, name };
  }

  function content() {
    contentEl = view === 'guide' ? guideView() : (cat === 'all' && !query ? rowsView() : gridView());
    return contentEl;
  }

  function rowsView() {
    const wrap = h('div.rows.flat-rows');
    const mk = (id, title, list, subtitle) => defRow({ id, title, subtitle, wide: true, max: 30, load: () => list, render: e => channelCard(e, list, title), more: list.length > 30 ? () => { cat = id.startsWith('live-cat-') ? id.slice(9) : id === 'live-fav' ? 'fav' : 'recent'; draw(); } : null });
    const recent = iptv.recent(), favs = iptv.favorites();
    if (recent.length) wrap.append(mk('live-recent', 'Recently Watched', recent));
    if (favs.length) wrap.append(mk('live-fav', 'Favorites', favs));
    const groups = iptv.visibleCategories().map(c => ({ c, list: iptv.visibleChannels().filter(x => x.cat === c.id) })).filter(g => g.list.length);
    let i = 0;
    const sentinel = h('div.live-more', h('div.ring.small'));
    const more = () => {
      const batch = groups.slice(i, i + 8); i += batch.length;
      for (const g of batch) sentinel.before(mk('live-cat-' + g.c.id, g.c.name, g.list, `${g.list.length} channel${g.list.length === 1 ? '' : 's'}`));
      if (i >= groups.length) sentinel.remove();
    };
    wrap.append(sentinel);
    more();
    new IntersectionObserver((es, obs) => { if (es[0].isIntersecting) { more(); if (!sentinel.isConnected) obs.disconnect(); } }, { rootMargin: '800px' }).observe(sentinel);
    if (!groups.length && !recent.length && !favs.length) wrap.append(emptyState('No channels to show', 'All categories are hidden. Use “Categories” to show some again.'));
    return wrap;
  }

  function gridView() {
    const { list, name } = listFor();
    const wrap = h('div.live-grid-wrap', h('h2.live-section-title', name, h('span.row-count', String(list.length))));
    if (!list.length) { wrap.append(emptyState(query ? 'No channels match' : 'Nothing here yet', query ? 'Try a different name.' : '')); return wrap; }
    let shown = 0;
    const g = grid([], {});
    g.classList.add('wide');
    const moreBtn = btn('Show more channels', { kind: 'ghost', onClick: () => add() });
    const add = () => { for (const ch of list.slice(shown, shown + 60)) g.append(channelCard(ch, list, name)); shown += 60; moreBtn.classList.toggle('hidden', shown >= list.length); };
    wrap.append(g, h('div.center-row', moreBtn));
    add();
    return wrap;
  }

  function guideView() {
    const { list, name } = listFor();
    const wrap = h('div.guide-wrap');
    wrap.append(h('div.guide-head', h('h2.live-section-title', name, h('span.row-count', String(list.length))), h('span.muted.small', `Now ${fmtClock(Date.now())}`)));
    if (!list.length) { wrap.append(emptyState('No channels match', '')); return wrap; }
    const table = h('div.guide-table', { role: 'list' });
    for (const ch of list.slice(0, guideLimit)) table.append(guideRow(ch, list, name));
    wrap.append(table);
    if (list.length > guideLimit) wrap.append(h('div.center-row', btn(`Show more (${list.length - guideLimit} left)`, { kind: 'ghost', onClick: () => { guideLimit += 60; redrawContent(); } })));
    return wrap;
  }
  function guideRow(ch, list, name) {
    const nowT = h('b', ' '), nowTime = h('span.g-time', ''), bar = h('div.progress.inline', h('i', { style: { width: '0%' } }));
    const nextT = h('span', ''), nextTime = h('span.g-time', '');
    const fav = btn('', { icon: 'star', kind: 'round xs' + (iptv.isFav(ch) ? ' on-fav' : ''), title: 'Favorite', onClick: () => { const on = iptv.toggleFav(ch); fav.classList.toggle('on-fav', on); } });
    const row = h('div.guide-row', { role: 'listitem', tabIndex: 0, on: { click: () => playLive(ch, list, name), keydown: e => { if (e.key === 'Enter') playLive(ch, list, name); } } },
      h('div.g-logo', ch.logo ? art(ch.logo, { fallback: initials(ch.name) }) : h('div.ch-initials.small', initials(ch.name))),
      h('div.g-name', h('b', ch.name), h('small', iptv.categories.find(c => c.id === ch.cat)?.name || '')),
      h('div.g-now', h('span.lg-tag', 'NOW'), h('div', nowT, nowTime), bar),
      h('div.g-next', h('span.lg-tag.dim', 'NEXT'), h('div', nextT, nextTime)),
      h('div.g-actions', fav, btn('', { icon: 'play', kind: 'round light sm', title: `Watch ${ch.name}`, onClick: () => playLive(ch, list, name) })));
    watchGuide(row, ch, g => {
      const [n, nx] = g || [];
      nowT.textContent = n ? n.title : 'No guide information';
      nowTime.textContent = n ? `${fmtClock(n.start)} – ${fmtClock(n.end)}` : '';
      bar.firstChild.style.width = (n ? progressOf(n) * 100 : 0) + '%'; bar.classList.toggle('hidden', !n);
      nextT.textContent = nx ? nx.title : '—'; nextTime.textContent = nx ? fmtClock(nx.start) : '';
    });
    return row;
  }

  function manageCategories() {
    const hidden = new Set((iptv.prefs.hiddenLiveCategories || []).map(String));
    const list = h('div.cat-manage');
    for (const c of iptv.categories) list.append(h('label.check', h('input', { type: 'checkbox', checked: !hidden.has(c.id), on: { change: e => iptv.setCategoryHidden(c.id, !e.target.checked) } }), h('span', c.name)));
    const back = h('div.dialog-back', { on: { click: e => { if (e.target === back) done(); } } });
    const done = () => { back.classList.remove('in'); setTimeout(() => back.remove(), 200); draw(); };
    back.append(h('div.dialog.wide-dialog', h('h3', 'Show categories'), h('p.muted', 'Untick categories you never watch to hide them everywhere in Live TV (also in the classic Live TV page).'),
      h('div.btn-row', btn('Show all', { kind: 'ghost small', onClick: () => { for (const c of iptv.categories) iptv.setCategoryHidden(c.id, false); list.querySelectorAll('input').forEach(i => { i.checked = true; }); } }),
        btn('Hide all', { kind: 'ghost small', onClick: () => { for (const c of iptv.categories) iptv.setCategoryHidden(c.id, true); list.querySelectorAll('input').forEach(i => { i.checked = false; }); } })),
      list, h('div.dialog-actions', btn('Done', { kind: 'primary', onClick: done }))));
    document.body.append(back);
    requestAnimationFrame(() => back.classList.add('in'));
  }

  load(false);
  return { el: page, refresh: () => { if (iptv.loadedAt !== drawnAt && !document.querySelector('.live-player.open')) draw(); } };
}

/* ---------- Home row ---------- */
export function liveHomeRow() {
  if (!iptv.signedIn() || !iptv.recent().length && !iptv.favorites().length) return null;
  const list = iptv.recent().length ? iptv.recent() : iptv.favorites();
  return defRow({ id: 'home-live', title: 'Live TV', subtitle: iptv.recent().length ? 'Jump back in' : 'Your favorite channels', wide: true, max: 20, load: () => list, render: e => channelCard(e, list, 'Recently watched'), more: () => actions.navigate('#/live') });
}
