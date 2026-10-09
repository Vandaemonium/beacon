/* Beacon Hub 1.0 storage helpers.
 * - prefs(): small UI preferences in localStorage (shared with older Beacon pages).
 * - cache: IndexedDB key/value store for large synced data (Trakt lists, metadata).
 * - secrets: chrome.storage.local (extension-private) for Trakt OAuth tokens.
 *   On Empyrean (Beacon as a website) they are kept on Sol per signed-in user, via /api/secrets.
 */
'use strict';

const DB_NAME = 'beacon-cache';
const STORE = 'kv';
let dbPromise = null;

function db() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

function tx(mode, fn) {
  return db().then(d => new Promise((resolve, reject) => {
    const t = d.transaction(STORE, mode);
    const s = t.objectStore(STORE);
    const r = fn(s);
    t.oncomplete = () => resolve(r && 'result' in r ? r.result : undefined);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}

export const cache = {
  async get(key) {
    try { const v = await tx('readonly', s => s.get(key)); return v === undefined ? null : v; } catch { return null; }
  },
  async set(key, value) {
    try { await tx('readwrite', s => s.put(value, key)); } catch (e) { console.warn('cache.set failed', key, e); }
  },
  async del(key) { try { await tx('readwrite', s => s.delete(key)); } catch {} },
  async keys() { try { return await tx('readonly', s => s.getAllKeys()); } catch { return []; } },
  async clearPrefix(prefix) {
    const all = await cache.keys();
    await Promise.all(all.filter(k => String(k).startsWith(prefix)).map(k => cache.del(k)));
  },
  /** get value if younger than ttl ms, else null */
  async fresh(key, ttl) {
    const v = await cache.get(key);
    if (v && v.at && Date.now() - v.at < ttl) return v.data;
    return null;
  },
  async stamp(key, data) { await cache.set(key, { at: Date.now(), data }); return data; },
};

const hasChromeStorage = () => typeof chrome !== 'undefined' && chrome?.storage?.local;
const onWeb = () => !hasChromeStorage() && /^https?:$/.test(location.protocol);

async function serverSecret(method, key, value) {
  const r = await fetch('/api/secrets/' + encodeURIComponent(key), {
    method,
    headers: method === 'PUT' ? { 'Content-Type': 'application/json' } : {},
    body: method === 'PUT' ? JSON.stringify({ value }) : undefined,
  });
  if (r.status === 401) { location.href = '/'; throw new Error('Signed out of Beacon'); }
  if (!r.ok) throw new Error(`Saving settings failed: HTTP ${r.status}`);
  return method === 'GET' ? (await r.json()).value ?? null : undefined;
}

export const secrets = {
  async get(key) {
    if (onWeb()) return serverSecret('GET', key);
    if (hasChromeStorage()) {
      const o = await chrome.storage.local.get(key);
      return o[key] ?? null;
    }
    return cache.get('secret:' + key);
  },
  async set(key, value) {
    if (onWeb()) return serverSecret('PUT', key, value);
    if (hasChromeStorage()) return chrome.storage.local.set({ [key]: value });
    return cache.set('secret:' + key, value);
  },
  async del(key) {
    if (onWeb()) return serverSecret('DELETE', key);
    if (hasChromeStorage()) return chrome.storage.local.remove(key);
    return cache.del('secret:' + key);
  },
};

const PREF_KEY = 'beacon:ui:prefs:v1';
const defaults = {
  collapsed: {},          // rowId -> true
  hiddenRows: {},         // rowId -> true
  upNextCountdown: true,  // show countdown to next episode's sources
  autoPlayNext: false,    // auto-play a similar source for the next episode
  preferTranscoded: 'auto', // auto | original | transcoded (Premiumize stream_link)
  hiddenPlayback: [],     // Trakt playback ids hidden locally from Continue Watching
  heroRotate: true,
};
export function prefs() {
  try { return { ...defaults, ...JSON.parse(localStorage.getItem(PREF_KEY) || '{}') }; } catch { return { ...defaults }; }
}
export function setPref(key, value) {
  const p = prefs(); p[key] = value; localStorage.setItem(PREF_KEY, JSON.stringify(p)); return p;
}

/* Website (Empyrean): settings from Beacon's server — which shared accounts exist, the Trakt app,
 * a stream key for Live TV links. Loaded once at startup (loadEmpyrean) so checks stay synchronous. */
export const onEmpyrean = () => onWeb();
export let empyrean = null;
export async function loadEmpyrean() {
  if (!onEmpyrean()) return null;
  try { empyrean = (await fetchJson('/api/config')).body; } catch (e) { if (e.status === 401) location.href = '/'; empyrean = empyrean || { providers: {} }; }
  return empyrean;
}
export const shared = name => !!empyrean?.providers?.[name];

/** Shared credentials written by the original Media Hub (media.js). */
export const hubKey = name => localStorage.getItem('beacon:hub:' + name) || sessionStorage.getItem('beacon:hub:' + name) || '';
export const setHubKey = (name, value) => {
  if (value) localStorage.setItem('beacon:hub:' + name, value); else localStorage.removeItem('beacon:hub:' + name);
  sessionStorage.removeItem('beacon:hub:' + name);
};

/* Tiny event bus */
const bus = new EventTarget();
export const on = (name, fn) => bus.addEventListener(name, e => fn(e.detail));
export const emit = (name, detail) => bus.dispatchEvent(new CustomEvent(name, { detail }));

export async function fetchJson(url, opts = {}, timeout = 20000) {
  const r = await fetch(url, { ...opts, signal: opts.signal || AbortSignal.timeout(timeout) });
  const text = await r.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!r.ok) {
    const err = new Error(`HTTP ${r.status}${body && body.error_description ? ' — ' + body.error_description : body && body.error ? ' — ' + body.error : ''}`);
    err.status = r.status; err.body = body; err.headers = r.headers;
    throw err;
  }
  return { body, headers: r.headers, status: r.status };
}
