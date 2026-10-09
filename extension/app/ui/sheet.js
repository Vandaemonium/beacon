/* Beacon Hub 1.0 — "Choose a source" side sheet. Searches automatically for the exact title / episode. */
'use strict';
import { h, btn, icon, art, clear, toast, popover, menuItem, copyText, confirmDialog } from './dom.js';
import { actions } from './actions.js';
import { searchSources, resolveSource, similarSource, describe } from '../lib/sources.js';
import { pm } from '../lib/premiumize.js';
import { torbox } from '../lib/torbox.js';
import { epCode, fmtTime } from '../lib/meta.js';
import { sourceCompat, filterMode } from '../lib/compat.js';
import { prefs, setPref } from '../lib/store.js';

let open = null;

export function closeSheet() {
  if (!open) return;
  const { back, onKey } = open;
  open = null;
  document.removeEventListener('keydown', onKey, true);
  back.classList.remove('in');
  setTimeout(() => back.remove(), 260);
}

export function openSources(item, ep, opts = {}) {
  closeSheet();
  const back = h('div.sheet-back', { on: { click: e => { if (e.target === back) closeSheet(); } } });
  const sheet = h('aside.sheet', { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Choose a source' });
  back.append(sheet);
  document.body.append(back);
  const onKey = e => { if (e.key === 'Escape' && !document.querySelector('.dialog-back, .popover, .player.open')) { e.preventDefault(); e.stopPropagation(); closeSheet(); } };
  document.addEventListener('keydown', onKey, true);
  open = { back, onKey };
  requestAnimationFrame(() => back.classList.add('in'));

  let resumeAt = opts.startOver ? 0 : (opts.resumeAt || 0);
  const resumePct = opts.startOver ? 0 : (opts.resumePct || 0);

  // ---- header ----
  const head = h('div.sheet-head');
  head.append(art(item.poster, { cls: 'sheet-poster', fallback: item.title }));
  const titles = h('div.sheet-titles', h('div.sheet-kicker', ep ? 'Episode sources' : 'Movie sources'), h('h2', item.title),
    h('div.sheet-sub', ep ? `${epCode(ep.season, ep.number)}${ep.title ? ' · ' + ep.title : ''}` : [item.year, item.runtime ? `${item.runtime} min` : ''].filter(Boolean).join(' · ')));
  head.append(titles, btn('', { icon: 'x', kind: 'round ghost', title: 'Close', onClick: closeSheet }));
  sheet.append(head);

  if (resumeAt || resumePct) {
    const label = resumeAt ? `Resumes at ${fmtTime(resumeAt)}` : `Resumes at ${Math.round(resumePct)}% (from Trakt)`;
    const bar = h('div.sheet-resume', icon('play'), h('span', label));
    bar.append(btn('Start from beginning', { kind: 'link', onClick: () => { resumeAt = 0; opts.resumePct = 0; bar.replaceChildren(icon('play'), h('span', 'Will start from the beginning')); } }));
    sheet.append(bar);
  }
  const query = h('div.sheet-query');
  sheet.append(query);
  const filters = h('div.sheet-filters', { role: 'toolbar' });
  const strip = h('div.provider-strip');
  const list = h('div.source-list', { role: 'list' });
  sheet.append(filters, strip, list);

  let state = { sources: [], providers: [] }, filter = 'all', autoTried = false, showIncompatible = false;
  const recommended = { s: null };

  const playSource = async (src, rowEl) => {
    const status = rowEl?.querySelector('.source-status');
    rowEl?.classList.add('busy');
    if (status) { status.className = 'source-status'; status.textContent = 'Getting playable link…'; }
    try {
      const r = await resolveSource(src, item, ep);
      if (!r.url) throw new Error('No playable link returned');
      closeSheet();
      actions.play({ item, ep, url: r.url, alt: r.alt, label: r.label || src.provider, resumeAt, resumePct: opts.resumePct || 0,
        sourceInfo: { provider: src.provider, quality: src.quality, kind: src.kind }, title: src.title });
    } catch (e) {
      rowEl?.classList.remove('busy');
      if (status) {
        status.className = 'source-status error';
        status.replaceChildren(h('span', e.message));
        if (e.canSave && src.magnet) status.append(btn('Save to Premiumize', { kind: 'link', onClick: () => saveToPremiumize(src) }));
      } else toast(e.message, { error: true });
    }
  };

  const saveToPremiumize = async src => {
    if (!pm.connected()) return toast('Connect Premiumize in Settings first', { error: true });
    const ok = await confirmDialog({ title: 'Save to Premiumize?', body: `“${src.title}” will be added to your Premiumize cloud. Only save media you’re authorized to access. This may use your account’s fair-use quota.`, ok: 'Save to cloud' });
    if (!ok) return;
    try { await pm.createTransfer(src.magnet || src.url); toast('Transfer started — track it on the Premiumize page', { action: () => { closeSheet(); actions.navigate('#/premiumize/transfers'); }, actionLabel: 'View' }); pm.transfersList().catch(() => {}); }
    catch (e) { toast('Premiumize: ' + e.message, { error: true }); }
  };
  const sendToTorbox = async src => {
    const ok = await confirmDialog({ title: 'Send to TorBox?', body: `Add “${src.title}” to your TorBox cloud? Only add media you’re authorized to access.`, ok: 'Send' });
    if (!ok) return;
    try { await torbox.add(src.magnet); toast('Sent to TorBox'); } catch (e) { toast('TorBox: ' + e.message, { error: true }); }
  };

  const sourceRow = src => {
    const r = h('div.source' + (src === recommended.s ? '.recommended' : ''), { role: 'listitem' });
    const q = h('div.q-badge.q-' + String(src.quality).toLowerCase().replace(/[^a-z0-9]/g, ''), src.quality === 'Unknown' ? '—' : src.quality);
    const main = h('div.source-main');
    main.append(h('div.source-title', { title: src.title }, src.title));
    const flags = h('div.source-flags');
    if (src === recommended.s) flags.append(h('span.flag.rec', 'Matches your last source'));
    if (src.cloud) flags.append(h('span.flag.cloud', icon('cloud'), `In your ${src.provider}`));
    else if (src.cached) flags.append(h('span.flag.cached', '⚡ Instant on Premiumize'));
    if (src.kind === 'direct') flags.append(h('span.flag.direct', 'Direct stream'));
    if (src.isPack) flags.append(h('span.flag.pack', 'Full-season pack'));
    const c = sourceCompat(src);
    if (c.verdict === 'ok') flags.append(h('span.flag.plays', { title: c.viaFriendly ? 'Premiumize already has a version Chrome can play' : `File name lists ${c.known.join(' and ')}, which this browser supports` }, icon('check'), c.viaFriendly ? 'Plays in Chrome (browser-friendly)' : 'Plays in Chrome'));
    else if (c.verdict === 'unknown') flags.append(h('span.flag.unknown', { title: `The file name doesn’t list the ${c.missing.join(' or ')}, so Beacon Hub can’t promise it will play.` }, `Format unknown${c.known.length ? ' · ' + c.known.join(', ') : ''}`));
    else if (c.verdict === 'maybe') flags.append(h('span.flag.risk', c.viaFriendly ? `May need browser-friendly stream · ${c.problems.join(', ')}` : c.risks.join(', ')));
    else flags.append(h('span.flag.bad', icon('alert'), `Won’t play here: ${c.problems.join(', ')}`));
    for (const t of src.tags || []) flags.append(h('span.flag', t));
    main.append(flags);
    main.append(h('div.source-meta', [describe(src), src.cloud ? '' : `${src.provider}${src.providerKind && src.providerKind !== 'Cloud' ? ' · ' + src.providerKind : ''}`].filter(Boolean).join(' · ')));
    main.append(h('div.source-status'));
    const side = h('div.source-actions');
    const canPlay = src.kind === 'direct' || src.kind === 'pmfile' || src.kind === 'torboxfile' || (src.kind === 'magnet' && (pm.connected() || torbox.connected()));
    side.append(btn(canPlay ? 'Play' : 'Unavailable', { icon: canPlay ? 'play' : null, kind: canPlay ? 'primary small' : 'ghost small', disabled: !canPlay, title: canPlay ? null : 'Connect Premiumize or TorBox to play torrent sources', onClick: () => playSource(src, r) }));
    side.append(btn('', { icon: 'more', kind: 'round ghost sm', title: 'More options', onClick: e => popover(e.currentTarget, (pop, close) => {
      if (src.magnet && pm.connected()) pop.append(menuItem('Save to Premiumize cloud', { icon: 'cloud', onClick: () => { close(); saveToPremiumize(src); } }));
      if (src.magnet && torbox.connected()) pop.append(menuItem('Send to TorBox', { icon: 'download', onClick: () => { close(); sendToTorbox(src); } }));
      if (src.url) pop.append(menuItem('Copy stream link (for VLC)', { icon: 'copy', onClick: async () => { close(); toast(await copyText(src.url) ? 'Link copied — paste into VLC › Open Network Stream' : 'Copy failed'); } }));
      if (src.magnet) pop.append(menuItem('Copy magnet link', { icon: 'link', onClick: async () => { close(); toast(await copyText(src.magnet) ? 'Magnet copied' : 'Copy failed'); } }));
      if (src.kind === 'pmfile' || src.kind === 'magnet') pop.append(menuItem('Get link for VLC', { icon: 'copy', onClick: async () => {
        close();
        try { const res = await resolveSource(src, item, ep); toast(await copyText(res.url) ? 'Playable link copied — paste into VLC › Open Network Stream' : 'Copy failed'); }
        catch (err) { toast(err.message, { error: true }); }
      } }));
      if (!pop.children.length) pop.append(h('p.pop-note', 'No other actions for this source.'));
    }) }));
    r.append(q, main, side);
    r.addEventListener('dblclick', () => canPlay && playSource(src, r));
    return r;
  };

  const draw = () => {
    // filters
    const hideBad = filterMode() === 'hide' && !showIncompatible;
    const incompatible = state.sources.filter(s => sourceCompat(s).verdict === 'no');
    const pool = hideBad ? state.sources.filter(s => sourceCompat(s).verdict !== 'no') : state.sources;
    const counts = { all: pool.length, '4k': 0, '1080p': 0, '720p': 0, instant: 0, pack: 0 };
    for (const s of pool) {
      if (s.quality === '4K') counts['4k']++; if (s.quality === '1080p') counts['1080p']++; if (s.quality === '720p') counts['720p']++;
      if (s.cloud || s.cached || s.kind === 'direct') counts.instant++; if (s.isPack) counts.pack++;
    }
    clear(filters);
    for (const [k, label] of [['all', 'All'], ['instant', 'Ready to play'], ['4k', '4K'], ['1080p', '1080p'], ['720p', '720p'], ['pack', 'Season packs']]) {
      if (k !== 'all' && !counts[k]) continue;
      filters.append(h('button.chip' + (filter === k ? '.on' : ''), { type: 'button', on: { click: () => { filter = k; draw(); } } }, label, h('span.chip-count', String(counts[k]))));
    }
    // providers
    clear(strip);
    const done = state.providers.filter(p => p.status !== 'pending').length;
    const failed = state.providers.filter(p => p.status === 'error');
    const summary = h('button.provider-summary', { type: 'button', 'aria-expanded': 'false' },
      h('span.dot' + (state.done ? (failed.length ? '.warn' : '.ok') : '.spin')),
      state.providers.length ? `${state.done ? 'Searched' : 'Searching'} ${state.providers.length} provider${state.providers.length === 1 ? '' : 's'} · ${done} done${failed.length ? ` · ${failed.length} failed` : ''}` : 'No providers configured', icon('chevronDown'));
    const detail = h('div.provider-detail');
    for (const p of state.providers) detail.append(h('div.provider-line.' + p.status, h('span.dot'), h('b', p.name), h('small', p.kind), h('span', p.status === 'pending' ? 'Searching…' : p.status === 'ok' ? `${p.count} result${p.count === 1 ? '' : 's'}` : p.status === 'skipped' ? p.error : `Failed — ${p.error}`)));
    summary.onclick = () => { const o = strip.classList.toggle('open'); summary.setAttribute('aria-expanded', String(o)); };
    if (strip.dataset.open === '1') strip.classList.add('open');
    strip.append(summary, detail);
    // sources
    clear(list);
    if (incompatible.length && state.done) {
      const reasons = [...new Set(incompatible.flatMap(s => sourceCompat(s).problems.map(p => p.replace(/ \(no sound\)$/, ''))))].slice(0, 4).join(', ');
      list.append(h('div.compat-note', icon(hideBad ? 'eye' : 'alert'),
        h('span', hideBad ? `${incompatible.length} source${incompatible.length === 1 ? '' : 's'} hidden — Chrome on this PC can’t play them (${reasons}).` : `Showing ${incompatible.length} source${incompatible.length === 1 ? '' : 's'} Chrome can’t play here (${reasons}). They would need an external player.`),
        btn(hideBad ? 'Show them' : 'Hide them', { kind: 'link', onClick: () => { showIncompatible = hideBad; draw(); } })));
    }
    const shown = pool.filter(s => filter === 'all' || (filter === 'instant' ? (s.cloud || s.cached || s.kind === 'direct') : filter === 'pack' ? s.isPack : String(s.quality).toLowerCase() === filter));
    for (const s of shown) list.append(sourceRow(s));
    if (!shown.length) {
      if (!state.done) list.append(...Array.from({ length: 5 }, () => h('div.source.skeleton', h('div.q-badge'), h('div.source-main', h('div.sk-line'), h('div.sk-line.short')))));
      else list.append(emptyHelp());
    }
  };

  const emptyHelp = () => {
    const noProviders = !state.providers.length;
    return h('div.sheet-empty', icon(noProviders ? 'gear' : 'search'),
      h('h3', noProviders ? 'No source providers are set up' : 'No sources found'),
      h('p', noProviders ? 'Install a stream add-on or enable Express providers, and connect Premiumize to search your cloud.' : `None of your providers returned results for ${state.query}. Some providers may be offline — expand the provider list above for details.`),
      h('div.sheet-empty-actions', btn('Manage providers', { kind: 'ghost', onClick: () => { location.href = 'media.html#providers'; } }), !pm.connected() ? btn('Connect Premiumize', { kind: 'ghost', onClick: () => { closeSheet(); actions.navigate('#/settings'); } }) : null));
  };

  draw();
  // A cloud file chosen directly from the details page plays right away.
  if (opts.autoCloudFile) playSource({ kind: 'pmfile', pmFile: opts.autoCloudFile, provider: 'Premiumize', quality: '', title: opts.autoCloudFile.name }, null);

  searchSources(item, ep, s => {
    if (!open || open.back !== back) return;
    state = s;
    query.replaceChildren(icon('search'), h('span', 'Searching for '), h('b', s.query), s.id ? h('span.mono', ` · ${s.id}`) : null);
    if (opts.autoPick && s.done && !autoTried) {
      autoTried = true;
      recommended.s = similarSource(s.sources, opts.autoPick);
      if (recommended.s && opts.autoPlay) { draw(); playSource(recommended.s, list.querySelector('.source.recommended')); return; }
    }
    draw();
  }).catch(e => { toast('Source search failed: ' + e.message, { error: true }); });
}

export const sheetOpen = () => !!open;
