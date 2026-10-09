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

async function start() {
  show('loading', false);
  try {
    const me = await api('me');
    $('me-name').textContent = me.name;
    show('login', false);
    show('home', true);
    show('admin', me.admin);
    if (me.admin) loadUsers();
  } catch {
    show('home', false);
    show('admin', false);
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
