/* Beacon Hub 1.0 — poster cards, landscape cards, rows and grids. */
'use strict';
import { h, art, icon, btn, roundBtn, clear } from './dom.js';
import { actions } from './actions.js';
import { decorate } from './data.js';
import { trakt } from '../lib/trakt.js';
import { prefs, setPref } from '../lib/store.js';
import { epCode } from '../lib/meta.js';

const metaLine = item => [item.year, item.type === 'show' ? 'Series' : 'Movie', item.rating ? `★ ${item.rating.toFixed(1)}` : ''].filter(Boolean).join(' · ');

function progressBar(p) {
  if (!(p > 0)) return null;
  return h('div.progress', h('i', { style: { width: Math.max(3, Math.min(100, p * 100)) + '%' } }));
}

export function posterCard(entry, { rank } = {}) {
  decorate(entry);
  const { item } = entry;
  const open = () => entry.item._unmatched ? actions.openCloudGroup(entry.group) : actions.openDetails(item);
  const card = h('article.card.poster' + (rank ? '.ranked' : ''), { tabIndex: 0, role: 'button', 'aria-label': `${item.title}${item.year ? ' (' + item.year + ')' : ''}`,
    on: { click: open, keydown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } } } });
  if (rank) card.append(h('div.rank', { 'aria-hidden': 'true' }, String(rank)));
  const frame = h('div.card-frame');
  frame.append(art(item.poster, { fallback: item.title, cls: 'poster-art' }));
  const badges = h('div.card-badges');
  if (entry.watched) badges.append(h('span.badge-dot.watched', { title: 'Watched' }, icon('check')));
  if (entry.cloud) badges.append(h('span.badge-dot.cloud', { title: 'In your Premiumize cloud' }, icon('cloud')));
  frame.append(badges);
  if (entry.progress) frame.append(progressBar(entry.progress));
  else if (entry.showProgress) frame.append(progressBar(entry.showProgress));
  // hover / focus overlay
  const quick = h('div.card-quick');
  if (!item._unmatched) {
    quick.append(roundBtn('play', item.type === 'movie' ? 'Find sources' : 'Episodes', () => item.type === 'movie' ? actions.openSources(item, null) : actions.openDetails(item), 'sm light'));
    if (trakt.connected()) {
      const inWl = trakt.isWatchlisted(item);
      quick.append(roundBtn(inWl ? 'check' : 'plus', inWl ? 'Remove from watchlist' : 'Add to watchlist', async e => { await actions.toggleWatchlist(item); const b = e.target.closest('.btn'); const now = trakt.isWatchlisted(item); b.replaceChildren(icon(now ? 'check' : 'plus')); b.title = now ? 'Remove from watchlist' : 'Add to watchlist'; }, 'sm'));
    }
    quick.append(roundBtn('info', 'More info', open, 'sm'));
  }
  frame.append(h('div.card-hover', h('div.card-hover-title', item.title), h('div.card-hover-meta', entry.sub || metaLine(item)), quick));
  card.append(frame);
  card.append(h('div.card-caption', h('div.card-title', item.title), h('div.card-sub', entry.sub || [item.year, item._unmatched ? 'Cloud file' : ''].filter(Boolean).join(' · '))));
  return card;
}

export function wideCard(entry) {
  decorate(entry);
  const { item, episode } = entry;
  const play = () => entry.upcoming ? actions.openDetails(item, { episode }) : actions.playEntry(entry);
  const card = h('article.card.wide', { tabIndex: 0, role: 'button', 'aria-label': `${item.title}${episode ? ' ' + epCode(episode.season, episode.number) : ''}`,
    on: { click: play, keydown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); play(); } } } });
  const frame = h('div.card-frame');
  frame.append(art(item.backdrop || item.poster, { fallback: item.title, cls: 'wide-art' }));
  if (item.logo) {
    const lg = h('img.wide-logo', { alt: '', loading: 'lazy', referrerPolicy: 'no-referrer' });
    lg.addEventListener('error', () => { lg.remove(); frame.classList.add('no-logo'); });
    lg.src = item.logo; frame.append(lg);
  } else frame.classList.add('no-logo');
  frame.append(h('div.wide-title-fallback', item.title));
  if (!entry.upcoming) frame.append(h('div.wide-play', icon('play')));
  if (entry.watched) frame.append(h('div.card-badges', h('span.badge-dot.watched', { title: 'Watched' }, icon('check'))));
  if (entry.upcoming) frame.append(h('div.wide-date', new Date(entry.upcoming).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })));
  frame.append(progressBar(entry.progress));
  const tools = h('div.wide-tools');
  tools.append(roundBtn('info', 'Details & episodes', () => actions.openDetails(item, { episode }), 'xs'));
  if (entry.onRemove) tools.append(roundBtn('x', 'Remove from row', () => entry.onRemove(card), 'xs'));
  frame.append(tools);
  card.append(frame);
  const sub = entry.sub || (episode ? `${epCode(episode.season, episode.number)}${episode.title ? ' · ' + episode.title : ''}` : (entry.progress ? `${Math.round(entry.progress * 100)}% watched` : item.year || ''));
  card.append(h('div.card-caption', h('div.card-title', item.title), h('div.card-sub', sub)));
  return card;
}

const skeletons = (wide, n = 8) => Array.from({ length: n }, () => h('div.card.skeleton' + (wide ? '.wide' : '.poster'), h('div.card-frame'), h('div.card-caption', h('div.sk-line'), h('div.sk-line.short'))));

/**
 * A horizontally scrolling row.
 * opts: {id, title, subtitle, load: () => entries|Promise, wide, ranked, more: route|fn, empty: node|false, collapsible}
 */
export function row(opts) {
  const p = prefs();
  const sec = h('section.row' + (p.collapsed[opts.id] ? '.collapsed' : ''), { 'data-row': opts.id });
  const track = h('div.row-track', { role: 'list' }, skeletons(opts.wide));
  const left = h('button.row-arrow.left', { type: 'button', 'aria-label': 'Scroll left' }, icon('chevronLeft'));
  const right = h('button.row-arrow.right', { type: 'button', 'aria-label': 'Scroll right' }, icon('chevronRight'));
  const page = dir => track.scrollBy({ left: dir * track.clientWidth * 0.88, behavior: 'smooth' });
  left.onclick = () => page(-1); right.onclick = () => page(1);
  const updateArrows = () => {
    left.classList.toggle('show', track.scrollLeft > 8);
    right.classList.toggle('show', track.scrollLeft + track.clientWidth < track.scrollWidth - 8);
  };
  track.addEventListener('scroll', updateArrows, { passive: true });
  const count = h('span.row-count');
  const toggle = h('button.row-title', { type: 'button', 'aria-expanded': String(!p.collapsed[opts.id]), on: { click: () => {
    const collapsed = !sec.classList.contains('collapsed');
    sec.classList.toggle('collapsed', collapsed);
    toggle.setAttribute('aria-expanded', String(!collapsed));
    const c = prefs().collapsed; if (collapsed) c[opts.id] = true; else delete c[opts.id]; setPref('collapsed', c);
  } } }, h('h2', opts.title), icon('chevronDown', 'row-chev'));
  const head = h('div.row-head', toggle, opts.subtitle ? h('span.row-subtitle', opts.subtitle) : null, count);
  if (opts.more) head.append(h('button.row-more', { type: 'button', on: { click: () => typeof opts.more === 'function' ? opts.more() : actions.navigate(opts.more) } }, 'See all', icon('chevronRight')));
  sec.append(head, h('div.row-body', left, track, right));

  Promise.resolve().then(opts.load).then(entries => {
    entries = (entries || []).filter(Boolean);
    sec._entries = entries;
    if (!entries.length) {
      if (opts.empty) { clear(track).append(opts.empty); sec.classList.add('is-empty'); }
      else sec.remove();
      return;
    }
    count.textContent = entries.length > 1 ? String(Math.min(entries.length, opts.max || 40)) : '';
    clear(track);
    entries.slice(0, opts.max || 40).forEach((e, i) => track.append(opts.render ? opts.render(e, i, entries) : opts.wide || e.wide ? wideCard(e) : posterCard(e, { rank: opts.ranked && i < 10 ? i + 1 : 0 })));
    requestAnimationFrame(updateArrows);
  }).catch(err => {
    console.warn('row failed', opts.id, err);
    clear(track).append(h('div.row-error', icon('alert'), h('span', `Couldn’t load ${opts.title.toLowerCase()} — ${err.message || err}`), btn('Retry', { kind: 'ghost small', onClick: () => sec.replaceWith(row(opts)) })));
  });
  return sec;
}

export function grid(entries, { wide = false, render = null } = {}) {
  const g = h('div.grid' + (wide ? '.wide' : ''));
  entries.forEach((e, i) => g.append(render ? render(e, i, entries) : wide || e.wide ? wideCard(e) : posterCard(e)));
  return g;
}

export function emptyState(title, body, action) {
  return h('div.empty-state', h('div.empty-glow'), h('h3', title), body ? h('p', body) : null, action || null);
}
