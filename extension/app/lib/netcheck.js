/* Beacon Hub 1.2 — "Check my connection": asks a public IP service which address THIS extension page uses.
 * Requests from Beacon Hub (IPTV, Premiumize, providers) use the same Chrome network path, so if this shows
 * your VPN's location, your browser VPN extension is covering Beacon Hub's traffic.
 */
'use strict';
import { onEmpyrean } from './store.js';
const KEY = 'beacon:ui:netcheck:v1';
const SERVICES = [
  ['ipinfo.io', 'https://ipinfo.io/json', b => ({ ip: b.ip, city: b.city, region: b.region, country: b.country, org: b.org })],
  ['ipwho.is', 'https://ipwho.is/', b => b.success === false ? null : ({ ip: b.ip, city: b.city, region: b.region, country: b.country_code || b.country, org: b.connection?.org || b.connection?.isp })],
  ['ipify.org', 'https://api.ipify.org?format=json', b => ({ ip: b.ip })],
];
// Hosting / VPN network names commonly seen on VPN exit addresses (not exhaustive).
const VPNISH = /surfshark|nord|express ?vpn|proton|mullvad|private internet|cyberghost|m247|datacamp|cdn77|leaseweb|clouvider|choopa|vultr|digitalocean|linode|akamai|ovh|hetzner|amazon|google cloud|microsoft|oracle|hostroyale|zenlayer|hydra|tzulo|performive|packethub|quadranet|psychz|colocrossing|g-core|gcore|server|hosting|datacenter|data center|cloud/i;

export async function checkConnection() {
  if (onEmpyrean()) {
    // Website: Live TV and Premiumize traffic leaves from Sol, through its VPN; that's the address that matters.
    const r = await fetch('/api/netcheck', { cache: 'no-store' });
    const info = await r.json().catch(() => ({}));
    if (!r.ok || !info.ip) throw new Error(info.error || 'Beacon couldn’t check Sol’s connection');
    const result = { ...info, service: 'Sol (Beacon server)', at: Date.now(), looksVpn: info.org ? VPNISH.test(info.org) : null };
    try { localStorage.setItem(KEY, JSON.stringify(result)); } catch {}
    return result;
  }
  let lastErr = '';
  for (const [name, url, map] of SERVICES) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(8000), cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const info = map(await r.json());
      if (!info?.ip) throw new Error('No address returned');
      const result = { ...info, service: name, at: Date.now(), looksVpn: info.org ? VPNISH.test(info.org) : null };
      try { localStorage.setItem(KEY, JSON.stringify(result)); } catch {}
      return result;
    } catch (e) { lastErr = `${name}: ${e.message}`; }
  }
  throw new Error('Couldn’t reach an IP-check service (' + lastErr + '). If your VPN blocks these sites, check your IP at whatismyip.com in a normal tab instead.');
}
export function lastCheck() { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; } }
export const placeOf = r => [r.city, r.region, r.country].filter(Boolean).join(', ');
