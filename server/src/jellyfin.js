/* Jellyfin client: checks a user's password, and lists users for the admin page.
 * A login creates a Jellyfin session; we end it straight away so users' device
 * lists don't fill up with "Beacon" entries. Beacon keeps its own session cookie.
 */
'use strict';

const VERSION = '0.1.0';

function authHeader(token) {
  const parts = ['Client="Beacon"', 'Device="Beacon server"', 'DeviceId="beacon-server"', `Version="${VERSION}"`];
  if (token) parts.push(`Token="${token}"`);
  return 'MediaBrowser ' + parts.join(', ');
}

// Sol's library disk is sometimes so busy that Jellyfin takes many seconds to check a password
// (a 10 s limit turned a coworker away on 2026-10-09), so sign-ins get 30 s.
export function jellyfinClient({ url, apiKey, timeout = 15000, loginTimeout = 30000 }) {
  async function call(path, { method = 'GET', token, body, wait = timeout } = {}) {
    try {
      return await fetch(url + path, {
        method,
        headers: { 'Authorization': authHeader(token), ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(wait)
      });
    } catch (e) {
      throw Object.assign(new Error(e.name === 'TimeoutError' ? 'Jellyfin took too long to answer' : "Couldn't reach Jellyfin"), { jellyfin: true, slow: e.name === 'TimeoutError' });
    }
  }

  return {
    // → { id, name, admin } for a good password, null for a wrong one; throws if Jellyfin is unreachable.
    async authenticate(username, password) {
      const r = await call('/Users/AuthenticateByName', { method: 'POST', body: { Username: username, Pw: password }, wait: loginTimeout });
      if (r.status === 401 || r.status === 400) return null;
      if (!r.ok) throw new Error(`Jellyfin login failed: HTTP ${r.status}`);
      const j = await r.json();
      const u = j.User || {};
      if (j.AccessToken) call('/Sessions/Logout', { method: 'POST', token: j.AccessToken }).catch(() => {});
      if (u.Policy?.IsDisabled) return null;
      return { id: u.Id, name: u.Name, admin: !!u.Policy?.IsAdministrator };
    },

    // → [{ id, name, admin, disabled }] (needs the server API key)
    async users() {
      const r = await call('/Users', { token: apiKey });
      if (!r.ok) throw new Error(`Jellyfin users failed: HTTP ${r.status}`);
      const list = await r.json();
      return list.map(u => ({ id: u.Id, name: u.Name, admin: !!u.Policy?.IsAdministrator, disabled: !!u.Policy?.IsDisabled }));
    },

    // → { id, name, admin, disabled } or null (used to re-check a session's user)
    async user(id) {
      const r = await call('/Users/' + encodeURIComponent(id), { token: apiKey });
      if (r.status === 404 || r.status === 400) return null;
      if (!r.ok) throw new Error(`Jellyfin user failed: HTTP ${r.status}`);
      const u = await r.json();
      return { id: u.Id, name: u.Name, admin: !!u.Policy?.IsAdministrator, disabled: !!u.Policy?.IsDisabled };
    }
  };
}
