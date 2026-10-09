/* Beacon Hub 1.2 — connection / VPN check UI (used in Settings and Live TV). */
'use strict';
import { h, btn, icon, clear } from './dom.js';
import { checkConnection, lastCheck, placeOf } from '../lib/netcheck.js';
import { timeAgo } from './pages.js';

export function connectionPanel() {
  const out = h('div.net-result');
  const show = r => {
    clear(out);
    if (!r) { out.append(h('p.muted.small', 'Not checked yet.')); return; }
    const verdict = r.looksVpn === true ? h('div.net-verdict.ok', icon('check'), 'This looks like a VPN / hosting network.')
      : r.looksVpn === false ? h('div.net-verdict.warn', icon('alert'), 'This looks like a regular internet provider. If it’s your own home ISP, your VPN is NOT covering Beacon Hub.')
      : h('div.net-verdict', icon('info'), 'Compare this address with the one your VPN app shows.');
    out.append(
      h('div.net-grid',
        h('span.k', 'IP address'), h('b.mono', r.ip),
        r.city || r.country ? [h('span.k', 'Location'), h('b', placeOf(r))] : null,
        r.org ? [h('span.k', 'Network'), h('b', r.org)] : null),
      verdict,
      h('p.muted.small', `Checked ${timeAgo(r.at)} via ${r.service}. Your IPTV, Premiumize and provider requests use this same browser connection.`));
  };
  const run = async b => {
    b.disabled = true; b.classList.add('spinning');
    clear(out).append(h('div.loading-inline.tight', h('div.ring.small'), 'Checking which address Beacon Hub is using…'));
    try { show(await checkConnection()); } catch (e) { clear(out).append(h('p.error.small', e.message)); }
    b.disabled = false; b.classList.remove('spinning');
  };
  const button = btn('Check my connection', { icon: 'sync', kind: 'primary', onClick: e => run(e.currentTarget) });
  show(lastCheck());
  return { el: h('div.net-panel', h('div.btn-row', button), out), run: () => run(button) };
}

/** Pop-up version for the Live TV page. */
export function connectionDialog() {
  const p = connectionPanel();
  const back = h('div.dialog-back', { on: { click: e => { if (e.target === back) done(); } } });
  const done = () => { back.classList.remove('in'); setTimeout(() => back.remove(), 200); };
  back.append(h('div.dialog', h('h3', 'Is your VPN covering Beacon Hub?'),
    h('p.muted', 'This shows the internet address Beacon Hub’s requests come from. It should match the location your VPN app shows, not your home connection.'),
    p.el, h('div.dialog-actions', btn('Done', { kind: 'ghost', onClick: done }))));
  document.body.append(back);
  requestAnimationFrame(() => back.classList.add('in'));
  p.run();
}
