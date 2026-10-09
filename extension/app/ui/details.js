/* Beacon Hub 1.0 — title details modal: movie info, or a full season & episode browser for series. */
'use strict';
import { h, btn, roundBtn, icon, art, clear, toast, popover, menuItem, closePopovers } from './dom.js';
import { actions } from './actions.js';
import { trakt } from '../lib/trakt.js';
import { pm } from '../lib/premiumize.js';
import { history, contentId } from '../lib/history.js';
import { enrich, seasonsFor, fmtRuntime, fmtDate, epCode, keyOf, fmtBytes } from '../lib/meta.js';
import { playTarget } from './data.js';

let current = null;

export function closeDetails(fromPop = false) {
  if (!current) return;
  const { back, onKey } = current;
  current = null;
  document.removeEventListener('keydown', onKey, true);
  back.classList.remove('in');
  document.body.classList.remove('modal-open');
  setTimeout(() => back.remove(), 250);
  closePopovers();
  if (!fromPop && history_state()) window.history.back();
}
const history_state = () => window.history.state?.beaconModal;
window.addEventListener('popstate', () => { if (current && !history_state()) closeDetails(true); });

export async function openDetails(item, { episode = null } = {}) {
  if (current) closeDetails(true);
  item = { ...item };
  const back = h('div.modal-back', { on: { click: e => { if (e.target === back) closeDetails(); } } });
  const modal = h('div.modal', { role: 'dialog', 'aria-modal': 'true', 'aria-label': item.title });
  back.append(modal);
  document.body.append(back);
  document.body.classList.add('modal-open');
  const onKey = e => { if (e.key === 'Escape' && !document.querySelector('.sheet-back, .dialog-back, .popover, .player.open')) { e.preventDefault(); closeDetails(); } };
  document.addEventListener('keydown', onKey, true);
  current = { back, modal, onKey, item };
  if (!history_state()) window.history.pushState({ beaconModal: true }, '');
  requestAnimationFrame(() => back.classList.add('in'));

  render(modal, item, null, episode);
  enrich(item).then(() => { if (current?.modal === modal) render(modal, item, null, episode, true); }).catch(() => {});
}

function render(modal, item, _x, focusEpisode, enriched = false) {
  const scrollTop = modal.scrollTop;
  clear(modal);
  // ---- hero ----
  const top = h('div.modal-hero');
  top.append(art(item.backdrop || item.poster, { cls: 'modal-backdrop', eager: true, fallback: '' }));
  top.append(h('div.modal-hero-shade'));
  top.append(roundBtn('x', 'Close', () => closeDetails(), 'close'));
  const heading = h('div.modal-heading');
  if (item.logo) {
    const lg = h('img.modal-logo', { alt: item.title, referrerPolicy: 'no-referrer' });
    lg.addEventListener('error', () => lg.replaceWith(h('h2.modal-title', item.title)));
    lg.src = item.logo; heading.append(lg);
  } else heading.append(h('h2.modal-title', item.title));
  const acts = h('div.modal-actions');
  const play = btn(item.type === 'movie' ? 'Play' : 'Play', { icon: 'play', kind: 'primary lg', onClick: async () => {
    const t = await playTarget(item);
    if (item.type === 'movie' || t.episode) actions.openSources(item, t.episode, { resumeAt: t.resumeAt, resumePct: t.resumePct });
  } });
  acts.append(play);
  playTarget(item).then(t => { if (play.isConnected) { play.querySelector('span:last-child').textContent = t.label; if (item.type === 'show' && !t.episode) play.disabled = true; } });
  if (item.type === 'movie') acts.append(btn('Search for Sources', { icon: 'search', kind: 'glass lg', onClick: () => actions.openSources(item, null) }));
  if (trakt.connected()) {
    const inWl = trakt.isWatchlisted(item);
    const wl = roundBtn(inWl ? 'check' : 'plus', inWl ? 'Remove from watchlist' : 'Add to watchlist', async () => { await actions.toggleWatchlist(item); render(modal, item, null, focusEpisode, enriched); }, 'glass lg');
    acts.append(wl);
    acts.append(roundBtn('list', 'Add to a Trakt list', e => listMenu(e.currentTarget, item), 'glass lg'));
  }
  if (item.type === 'movie') {
    const watched = trakt.movieWatched(item) || history.watched(item, null);
    acts.append(roundBtn('check', watched ? 'Watched — click to mark unwatched' : 'Mark as watched', async () => {
      await setWatched(item, null, !watched); render(modal, item, null, focusEpisode, enriched);
    }, 'glass lg' + (watched ? ' on' : '')));
  }
  heading.append(acts);
  top.append(heading);
  modal.append(top);

  // ---- info ----
  const info = h('div.modal-info');
  const left = h('div.modal-col-main');
  const meta = h('div.modal-meta');
  if (item.rating) meta.append(h('span.meta-rating', icon('star'), item.rating.toFixed(1)));
  if (item.year) meta.append(h('span', item.year));
  if (item.type === 'movie' && item.runtime) meta.append(h('span', fmtRuntime(item.runtime)));
  if (item.type === 'show' && item.airedEpisodes) meta.append(h('span', `${item.airedEpisodes} episodes`));
  if (item.certification) meta.append(h('span.cert', item.certification));
  const wCount = item.type === 'movie' ? (trakt.data.watchedMovies[keyOf(item)]?.plays || 0) : trakt.watchedEpisodeCount(item);
  if (item.type === 'movie' && (wCount || history.watched(item, null))) meta.append(h('span.meta-watched', icon('check'), wCount > 1 ? `Watched ${wCount}×` : 'Watched'));
  if (item.type === 'show' && wCount) meta.append(h('span.meta-watched', icon('check'), `${wCount} watched`));
  left.append(meta);
  if (item.tagline) left.append(h('p.modal-tagline', item.tagline));
  left.append(h('p.modal-overview', item.overview || (enriched ? 'No synopsis available.' : '')));
  const resume = item.type === 'movie' ? history.resumeAt(item, null) : 0;
  if (resume) left.append(h('div.modal-resume', icon('play'), `You stopped at ${Math.floor(resume / 60)} min`, btn('Start over', { kind: 'link', onClick: () => actions.openSources(item, null, { resumeAt: 0, startOver: true }) })));
  const right = h('div.modal-col-side');
  const fact = (k, v) => v ? right.append(h('div.fact', h('span.fact-k', k + ':'), ' ', h('span.fact-v', v))) : null;
  fact('Genres', (item.genres || []).map(g => g[0].toUpperCase() + g.slice(1)).join(', '));
  fact(item.type === 'show' ? 'First aired' : 'Released', fmtDate(item.released));
  fact('Network', item.network);
  fact('Status', item.status ? item.status[0].toUpperCase() + item.status.slice(1) : '');
  if (trakt.connected()) {
    const inLists = trakt.listsContaining(item);
    fact('In your lists', trakt.data.lists.filter(l => inLists.has(l.ids.trakt)).map(l => l.name).join(', '));
    right.append(ratingControl(item, () => render(modal, item, null, focusEpisode, enriched)));
  }
  info.append(left, right);
  modal.append(info);

  if (item.type === 'movie') {
    const cloud = pm.connected() ? pm.filesFor(item) : [];
    if (cloud.length) {
      const sec = h('section.modal-section', h('h3', icon('cloud'), ' In your Premiumize cloud'));
      for (const { file, parsed } of cloud) sec.append(h('div.cloud-file', h('div', h('b', file.name), h('small', [parsed.quality, fmtBytes(file.size)].filter(Boolean).join(' · '))),
        btn('Play', { icon: 'play', kind: 'primary small', onClick: () => actions.openSources(item, null, { autoCloudFile: file }) })));
      modal.append(sec);
    }
  } else {
    modal.append(episodesSection(item, focusEpisode, modal));
  }
  modal.scrollTop = scrollTop;
}

function ratingControl(item, rerender) {
  const r = trakt.rating(item);
  const b = btn(r ? `Your rating: ${r}/10` : 'Rate on Trakt', { icon: 'star', kind: 'ghost small', onClick: e => {
    popover(e.currentTarget, (pop, close) => {
      const grid = h('div.rate-grid');
      for (let i = 1; i <= 10; i++) grid.append(h('button.rate' + (i === r ? '.on' : ''), { type: 'button', on: { click: async () => { close(); try { await trakt.rate(item, i); toast(`Rated ${i}/10 on Trakt`); rerender(); } catch (err) { toast('Rating failed: ' + err.message, { error: true }); } } } }, String(i)));
      pop.append(h('div.pop-title', 'Your rating'), grid);
      if (r) pop.append(menuItem('Remove rating', { icon: 'x', onClick: async () => { close(); await trakt.rate(item, 0); rerender(); } }));
    });
  } });
  return h('div.fact', b);
}

export function listMenu(anchor, item) {
  popover(anchor, (pop, close) => {
    pop.append(h('div.pop-title', 'Save to list'));
    const inLists = trakt.listsContaining(item);
    if (!trakt.data.lists.length) pop.append(h('p.pop-note', 'You have no custom lists yet.'));
    for (const l of trakt.data.lists) {
      const has = inLists.has(l.ids.trakt);
      pop.append(menuItem(l.name, { checked: has, onClick: async () => {
        close();
        try { await trakt.setListMembership(l.ids.trakt, item, !has); toast(`${has ? 'Removed from' : 'Added to'} “${l.name}”`); actions.rerender(); }
        catch (e) { toast('Trakt list update failed: ' + e.message, { error: true }); }
      } }));
    }
    const input = h('input.pop-input', { placeholder: 'New list name…', maxlength: '80' });
    const create = async () => {
      const name = input.value.trim(); if (!name) return;
      close();
      try { const l = await trakt.createList(name); await trakt.setListMembership(l.ids.trakt, item, true); toast(`Created “${name}” and added ${item.title}`); actions.rerender(); }
      catch (e) { toast('Could not create list: ' + e.message, { error: true }); }
    };
    input.addEventListener('keydown', e => { if (e.key === 'Enter') create(); });
    pop.append(h('div.pop-new', input, btn('Create', { kind: 'primary small', onClick: create })));
  });
}

export async function setWatched(item, ep, watched) {
  try {
    if (trakt.connected()) await trakt.setWatched(item, ep, watched);
    const id = contentId(item, ep);
    const rec = history.get(id);
    if (watched) history.update(item, ep, { completed: true, position: rec?.duration || rec?.position || 0 });
    else if (rec) history.update(item, ep, { completed: false, position: 0 });
    toast(watched ? 'Marked as watched' : 'Marked as unwatched');
  } catch (e) { toast('Could not update watched status: ' + e.message, { error: true }); }
}

/* ---------------- Episodes ---------------- */
function episodesSection(item, focusEpisode, modal) {
  const sec = h('section.modal-section.episodes');
  const head = h('div.episodes-head', h('h3', 'Episodes'));
  const body = h('div.episode-list', Array.from({ length: 4 }, () => h('div.episode.skeleton', h('div.ep-num'), h('div.ep-thumb'), h('div.ep-text', h('div.sk-line'), h('div.sk-line.short')))));
  sec.append(head, body);
  seasonsFor(item, trakt).then(async seasons => {
    if (!seasons.length) { clear(body).append(h('p.muted', 'No season or episode information is available for this series yet.')); return; }
    let target = focusEpisode?.season;
    if (target == null) { const t = await playTarget(item); target = t.episode?.season; }
    if (target == null || !seasons.some(s => s.number === target)) target = (seasons.find(s => s.number > 0) || seasons[0]).number;
    const select = h('select.season-select', { 'aria-label': 'Season' }, seasons.map(s => h('option', { value: String(s.number) }, `${s.title}  (${s.episodes.length})`)));
    select.value = String(target);
    const tabs = h('div.season-tabs', { role: 'tablist' });
    for (const s of seasons) tabs.append(h('button.season-tab' + (s.number === target ? '.on' : ''), { type: 'button', role: 'tab', 'aria-selected': String(s.number === target), dataset: { season: s.number }, on: { click: () => choose(s.number) } }, s.number === 0 ? 'Specials' : String(s.number)));
    const choose = n => {
      select.value = String(n);
      for (const t of tabs.children) { const on = Number(t.dataset.season) === n; t.classList.toggle('on', on); t.setAttribute('aria-selected', String(on)); }
      drawSeason(item, seasons.find(s => s.number === n), body, focusEpisode);
    };
    select.addEventListener('change', () => choose(Number(select.value)));
    head.append(seasons.length > 12 ? select : tabs);
    if (seasons.length > 12) head.classList.add('many');
    choose(target);
    if (focusEpisode) requestAnimationFrame(() => body.querySelector(`[data-ep="${focusEpisode.season}:${focusEpisode.number}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }));
  }).catch(e => { clear(body).append(h('p.error', 'Could not load episodes: ' + e.message)); });
  return sec;
}

function drawSeason(item, season, body, focusEpisode) {
  clear(body);
  if (!season) return;
  const cloudFiles = pm.connected() ? pm.filesFor(item, season.number) : [];
  const seasonPacks = cloudFiles.filter(f => f.parsed.isPack);
  if (seasonPacks.length) body.append(h('div.pack-note', icon('cloud'), `Full-season pack in your cloud: ${seasonPacks[0].file.name}`));
  const now = Date.now();
  for (const ep of season.episodes) {
    const aired = !ep.aired || Date.parse(ep.aired) <= now;
    const watched = trakt.episodeWatched(item, ep.season, ep.number) || history.watched(item, ep);
    const rec = history.get(contentId(item, ep));
    const prog = rec && !rec.completed && rec.duration ? rec.position / rec.duration : 0;
    const inCloud = cloudFiles.some(f => f.parsed.episode === ep.number || (f.parsed.episodeEnd && ep.number >= f.parsed.episode && ep.number <= f.parsed.episodeEnd));
    const search = () => actions.openSources(item, ep, { resumeAt: history.resumeAt(item, ep) });
    const row = h('div.episode' + (aired ? '' : '.unaired') + (watched ? '.is-watched' : '') + (focusEpisode && focusEpisode.season === ep.season && focusEpisode.number === ep.number ? '.focus' : ''),
      { dataset: { ep: `${ep.season}:${ep.number}` }, tabIndex: aired ? 0 : -1, role: 'button', 'aria-label': `${epCode(ep.season, ep.number)} ${ep.title || ''}`,
        on: { click: () => aired && search(), keydown: e => { if (aired && (e.key === 'Enter' || e.key === ' ') && e.target === row) { e.preventDefault(); search(); } } } });
    row.append(h('div.ep-num', String(ep.number)));
    const thumb = h('div.ep-thumb', art(ep.thumbnail || '', { fallback: epCode(ep.season, ep.number) }), aired ? h('div.ep-play', icon('play')) : null);
    if (prog) thumb.append(h('div.progress', h('i', { style: { width: prog * 100 + '%' } })));
    row.append(thumb);
    const text = h('div.ep-text');
    text.append(h('div.ep-title-row', h('span.ep-title', ep.title || `Episode ${ep.number}`), h('span.ep-runtime', [ep.runtime ? fmtRuntime(ep.runtime) : '', fmtDate(ep.aired)].filter(Boolean).join(' · '))));
    text.append(h('p.ep-overview', aired ? (ep.overview || 'No synopsis available.') : `Airs ${fmtDate(ep.aired, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}`));
    const tags = h('div.ep-tags', h('span.code', epCode(ep.season, ep.number)));
    if (inCloud) tags.append(h('span.tag.cloud', icon('cloud'), 'In your cloud'));
    if (prog) tags.append(h('span.tag', `${Math.round(prog * 100)}% watched`));
    text.append(tags);
    row.append(text);
    const side = h('div.ep-actions');
    if (aired) side.append(btn('Search', { icon: 'search', kind: 'ghost small', title: `Search for ${epCode(ep.season, ep.number)}`, onClick: search }));
    side.append(roundBtn('check', watched ? 'Watched — click to mark unwatched' : 'Mark watched', async e => {
      await setWatched(item, ep, !watched);
      drawSeason(item, season, body, focusEpisode);
    }, 'sm' + (watched ? ' on' : '')));
    row.append(side);
    body.append(row);
  }
}

export const detailsOpen = () => !!current;
export function refreshDetails() { if (current) render(current.modal, current.item, null, null, true); }
