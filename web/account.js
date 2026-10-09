/* Beacon sign-in page: login, who's signed in, and the admin's allowlist. */
'use strict';

const $ = id => document.getElementById(id);

async function api(path, body) {
  const r = await fetch('/api/' + path, body === undefined ? {} : {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(data.error || `HTTP ${r.status}`), { status: r.status });
  return data;
}

function show(id, on) { $(id).hidden = !on; }

async function loadUsers() {
  const list = $('users');
  $('admin-error').textContent = '';
  let users;
  try { users = await api('admin/users'); } catch (e) { $('admin-error').textContent = e.message; return; }
  list.replaceChildren(...users.map(u => {
    const li = document.createElement('li');
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = u.allowed;
    box.disabled = u.admin || u.disabled;
    box.id = 'u-' + u.id;
    box.addEventListener('change', async () => {
      box.disabled = true;
      try { box.checked = (await api('admin/allow', { id: u.id, allowed: box.checked })).allowed; }
      catch (e) { box.checked = !box.checked; $('admin-error').textContent = e.message; }
      box.disabled = false;
    });
    const label = document.createElement('label');
    label.htmlFor = box.id;
    label.textContent = u.name;
    const note = document.createElement('span');
    note.className = 'muted';
    note.textContent = u.admin ? 'admin' : u.disabled ? 'disabled in Jellyfin' : '';
    li.append(box, label, note);
    return li;
  }));
}

const KIND = { login: '🔑', 'login-failed': '⛔', watch: '▶', convert: '🎧', limit: '🚦', silent: '🔇', error: '⚠️' };
async function loadActivity() {
  let a;
  try { a = await api('admin/activity'); } catch { return; }
  const d = a.today || {};
  $('act-now').textContent = `${a.viewers.watching} of ${a.viewers.max} watching now · Live TV ${a.live.inUse} of ${a.live.max} slots`;
  const hits = Object.values(d.limitHits || {}).reduce((s, n) => s + n, 0);
  const rows = [
    ['Watched', Object.entries(d.watchers || {}).map(([n, c]) => `${n} (${c})`).join(', ') || 'nobody yet'],
    ['Plays', `${d.films || 0} films · ${d.live || 0} Live TV · ${d.conversions || 0} audio converted`],
    ['Peak at once', `${d.peakViewers || 0} of ${a.viewers.max}`],
    ['Turned away', String(hits)],
    ['No sound reported', String((d.silent || []).length)],
    ['Errors', String(d.errors || 0)],
    ['Sign-ins', `${d.logins || 0}${d.failedLogins ? ` · ${d.failedLogins} failed` : ''}`]
  ];
  $('act-stats').replaceChildren(...rows.flatMap(([k, v]) => { const dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = k; dd.textContent = v; return [dt, dd]; }));
  $('act-events').replaceChildren(...(a.recent || []).slice(0, 15).map(e => {
    const li = document.createElement('li');
    const time = document.createElement('span'); time.className = 'muted';
    time.textContent = new Date(e.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    li.append(time, ` ${KIND[e.kind] || '·'} ${e.text}`);
    return li;
  }));
  if (!a.recent?.length) $('act-events').replaceChildren(Object.assign(document.createElement('li'), { className: 'muted', textContent: 'Nothing yet today.' }));
}

async function start() {
  show('loading', false);
  try {
    const me = await api('me');
    $('me-name').textContent = me.name;
    show('login', false);
    show('home', true);
    show('admin', me.admin);
    show('activity', me.admin);
    if (me.admin) { loadUsers(); loadActivity(); clearInterval(start.timer); start.timer = setInterval(loadActivity, 30000); }
  } catch {
    show('home', false);
    show('admin', false);
    show('activity', false);
    show('login', true);
  }
}

$('login').addEventListener('submit', async ev => {
  ev.preventDefault();
  const f = ev.target, btn = f.querySelector('button');
  $('login-error').textContent = '';
  btn.disabled = true;
  try {
    await api('login', { username: f.username.value.trim(), password: f.password.value });
    f.password.value = '';
    await start();
  } catch (e) {
    $('login-error').textContent = e.message;
  } finally {
    btn.disabled = false;
  }
});

$('logout').addEventListener('click', async () => {
  await api('logout', {}).catch(() => {});
  start();
});

start();
