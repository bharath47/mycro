// app.js — UI for mycro (browser Ragasiyam vault manager).
import { Vault, VaultError, makeEntry, generatePassword } from './vault.js';

const $ = (id) => document.getElementById(id);

const state = {
  fileText: null,
  fileName: 'ragasiyam.vault',
  vault: null,
  editingId: null,   // null while adding
  clipToken: null,
};

// ---------- helpers ----------
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (t.hidden = true), 2200);
}
function show(screen) {
  $('unlockScreen').hidden = screen !== 'unlock';
  $('appScreen').hidden = screen !== 'app';
}
async function copySecret(label, value) {
  try { await navigator.clipboard.writeText(value); } catch { return toast('Clipboard blocked by browser'); }
  state.clipToken = value;
  toast(`${label} copied (clears in 20s)`);
  setTimeout(async () => {
    if (state.clipToken === value) {
      try { const cur = await navigator.clipboard.readText(); if (cur === value) await navigator.clipboard.writeText(''); }
      catch { /* readText may be blocked; best effort */ }
      state.clipToken = null;
    }
  }, 20000);
}
function openUrl(raw) {
  let u = (raw || '').trim();
  if (!u) return;
  if (!u.includes('://')) u = 'https://' + u;
  if (!/^https?:\/\//i.test(u)) return toast('Only http/https links can be opened');
  window.open(u, '_blank', 'noopener');
}

// ---------- file loading ----------
function setFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    state.fileText = reader.result;
    state.fileName = file.name || 'ragasiyam.vault';
    const fd = $('fileDrop');
    fd.classList.add('loaded');
    $('fileName').innerHTML = `Loaded <b>${escapeHtml(state.fileName)}</b>`;
  };
  reader.readAsText(file);
}
$('fileInput').addEventListener('change', (e) => { if (e.target.files[0]) setFile(e.target.files[0]); });
['dragover', 'dragenter'].forEach((ev) => $('fileDrop').addEventListener(ev, (e) => {
  e.preventDefault(); $('fileDrop').classList.add('drag');
}));
['dragleave', 'drop'].forEach((ev) => $('fileDrop').addEventListener(ev, (e) => {
  e.preventDefault(); $('fileDrop').classList.remove('drag');
}));
$('fileDrop').addEventListener('drop', (e) => { if (e.dataTransfer.files[0]) setFile(e.dataTransfer.files[0]); });

// Load a vault from a URL (OneDrive share or direct link).
function resolveDownloadUrl(url) {
  const l = url.toLowerCase();
  const share = l.includes('1drv.ms') || l.includes('onedrive.live.com') || l.includes('sharepoint.com');
  if (share && !l.includes('/shares/')) {
    const enc = btoa(url).replace(/=+$/, '').replace(/\//g, '_').replace(/\+/g, '-');
    return `https://api.onedrive.com/v1.0/shares/u!${enc}/root/content`;
  }
  return url;
}
async function loadFromUrl() {
  const url = $('urlInput').value.trim();
  const err = $('unlockError'); err.hidden = true;
  if (!url) return;
  const btn = $('fetchBtn'); const old = btn.textContent; btn.disabled = true; btn.textContent = 'Loading…';
  try {
    const resp = await fetch(resolveDownloadUrl(url), { redirect: 'follow' });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const text = await resp.text();
    if (!text.includes('RAGASIYAM-VAULT')) throw new Error('that URL did not return a Ragasiyam vault');
    state.fileText = text;
    state.fileName = (url.split('?')[0].split('/').pop()) || 'vault.vault';
    $('fileDrop').classList.add('loaded');
    $('fileName').innerHTML = `Loaded from URL: <b>${escapeHtml(state.fileName)}</b>`;
    toast('Vault loaded — now enter your password');
    $('secret').focus();
  } catch (e) {
    err.textContent = `Could not load from URL (${e.message}). Some links (e.g. OneDrive) block cross-site download — in that case download the file and use “Choose file”.`;
    err.hidden = false;
  } finally {
    btn.disabled = false; btn.textContent = old;
  }
}
$('fetchBtn').addEventListener('click', loadFromUrl);
$('urlInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') loadFromUrl(); });

// ---------- unlock ----------
$('toggleSecret').addEventListener('click', () => {
  const el = $('secret');
  el.type = el.type === 'password' ? 'text' : 'password';
  $('toggleSecret').textContent = el.type === 'password' ? 'Show' : 'Hide';
});
$('useRecovery').addEventListener('change', (e) => {
  $('secretLabel').textContent = e.target.checked ? 'Recovery key' : 'Master password';
});
$('secret').addEventListener('keydown', (e) => { if (e.key === 'Enter') unlock(); });
$('unlockBtn').addEventListener('click', unlock);

async function unlock() {
  const err = $('unlockError');
  err.hidden = true;
  if (!state.fileText) { err.textContent = 'Choose your .vault file first.'; err.hidden = false; return; }
  const secret = $('secret').value;
  if (!secret) { err.textContent = 'Enter your master password or recovery key.'; err.hidden = false; return; }

  const btn = $('unlockBtn');
  btn.disabled = true; btn.textContent = 'Unlocking…';
  try {
    state.vault = await Vault.open(state.fileText, secret, $('useRecovery').checked);
    $('secret').value = '';
    $('openName').textContent = state.fileName;
    renderFilters();
    render();
    show('app');
  } catch (e) {
    err.textContent = e instanceof VaultError ? e.message : `Could not open vault: ${e}`;
    err.hidden = false;
  } finally {
    btn.disabled = false; btn.textContent = 'Unlock';
  }
}

// ---------- rendering ----------
function escapeHtml(s) {
  return (s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function renderFilters() {
  const cat = $('catFilter'), per = $('personaFilter');
  cat.innerHTML = '<option>All</option>' + state.vault.categories().map((c) => `<option>${escapeHtml(c)}</option>`).join('');
  per.innerHTML = '<option>All</option>' + state.vault.personas().map((p) => `<option>${escapeHtml(p)}</option>`).join('');
  $('catList').innerHTML = state.vault.categories().map((c) => `<option value="${escapeHtml(c)}">`).join('');
  $('personaList').innerHTML = state.vault.personas().map((p) => `<option value="${escapeHtml(p)}">`).join('');
}
function filtered() {
  const q = $('search').value.trim().toLowerCase();
  const cat = $('catFilter').value, per = $('personaFilter').value;
  return state.vault.entries.filter((e) => {
    if (cat !== 'All' && (e.category || 'General') !== cat) return false;
    if (per !== 'All' && (e.persona || '') !== per) return false;
    if (q && !([e.title, e.username, e.url, e.persona].some((v) => (v || '').toLowerCase().includes(q)))) return false;
    return true;
  });
}
function render() {
  const list = $('list');
  const items = filtered();
  if (!items.length) { list.innerHTML = '<div class="empty">No entries</div>'; return; }
  const groups = {};
  for (const e of items) (groups[e.category || 'General'] ||= []).push(e);
  const cats = Object.keys(groups).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
  list.innerHTML = cats.map((c) => {
    const rows = groups[c].sort((a, b) => a.title.toLowerCase().localeCompare(b.title.toLowerCase())).map((e) => {
      const sub = [e.username, e.persona].filter(Boolean).map(escapeHtml).join(' &middot; ');
      return `<div class="row" data-id="${e.id}">
        <div class="avatar">${escapeHtml((e.title[0] || '?').toUpperCase())}</div>
        <div class="meta"><div class="title">${escapeHtml(e.title)}</div>
          <div class="sub">${sub || '&nbsp;'}</div></div>
        <div class="acts">
          ${e.password ? '<button class="btn ghost small" data-act="pw">Copy&nbsp;pw</button>' : ''}
          ${e.url ? '<button class="btn ghost small" data-act="url">Open</button>' : ''}
        </div></div>`;
    }).join('');
    return `<div class="group"><div class="group-h">${escapeHtml(c)} (${groups[c].length})</div>${rows}</div>`;
  }).join('');
}

$('list').addEventListener('click', (e) => {
  const row = e.target.closest('.row');
  if (!row) return;
  const id = row.dataset.id;
  const entry = state.vault.entries.find((x) => x.id === id);
  if (!entry) return;
  const act = e.target.dataset.act;
  if (act === 'pw') return copySecret('Password', entry.password);
  if (act === 'url') return openUrl(entry.url);
  openModal(entry);
});

$('search').addEventListener('input', render);
$('catFilter').addEventListener('change', render);
$('personaFilter').addEventListener('change', render);

// ---------- modal (add / edit) ----------
function openModal(entry) {
  state.editingId = entry ? entry.id : null;
  $('modalTitle').textContent = entry ? 'Edit entry' : 'Add entry';
  $('mTitle').value = entry?.title || '';
  $('mCategory').value = entry?.category || 'General';
  $('mPersona').value = entry?.persona || '';
  $('mUsername').value = entry?.username || '';
  $('mPassword').value = entry?.password || '';
  $('mPassword').type = 'password'; $('mToggle').textContent = 'Show';
  $('mUrl').value = entry?.url || '';
  $('mNotes').value = entry?.notes || '';
  $('mDelete').style.display = entry ? '' : 'none';
  $('modalError').hidden = true;
  $('modal').hidden = false;
  $('mTitle').focus();
}
function closeModal() { $('modal').hidden = true; state.editingId = null; }

$('addBtn').addEventListener('click', () => openModal(null));
$('mCancel').addEventListener('click', closeModal);
$('modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeModal(); });
$('mToggle').addEventListener('click', () => {
  const el = $('mPassword');
  el.type = el.type === 'password' ? 'text' : 'password';
  $('mToggle').textContent = el.type === 'password' ? 'Show' : 'Hide';
});
$('mGen').addEventListener('click', () => { $('mPassword').value = generatePassword(20); $('mPassword').type = 'text'; $('mToggle').textContent = 'Hide'; });

$('mSave').addEventListener('click', () => {
  const title = $('mTitle').value.trim();
  if (!title) { $('modalError').textContent = 'Title is required.'; $('modalError').hidden = false; return; }
  const data = {
    title,
    category: $('mCategory').value,
    persona: $('mPersona').value,
    username: $('mUsername').value,
    password: $('mPassword').value,
    url: $('mUrl').value.trim(),
    notes: $('mNotes').value.trim(),
  };
  if (state.editingId) {
    const i = state.vault.entries.findIndex((x) => x.id === state.editingId);
    data.id = state.editingId;
    state.vault.entries[i] = makeEntry(data);
  } else {
    state.vault.entries.push(makeEntry(data));
  }
  closeModal();
  renderFilters();
  render();
  toast('Saved — remember to Download to keep your changes');
});

$('mDelete').addEventListener('click', () => {
  if (!state.editingId) return;
  const entry = state.vault.entries.find((x) => x.id === state.editingId);
  if (!confirm(`Delete "${entry?.title}"? This cannot be undone.`)) return;
  state.vault.entries = state.vault.entries.filter((x) => x.id !== state.editingId);
  closeModal();
  renderFilters();
  render();
  toast('Deleted — Download to keep your changes');
});

// ---------- download / lock ----------
$('downloadBtn').addEventListener('click', async () => {
  const text = await state.vault.toFileText();
  const blob = new Blob([text], { type: 'application/octet-stream' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = state.fileName || 'ragasiyam.vault';
  a.click();
  URL.revokeObjectURL(a.href);
  toast('Encrypted vault downloaded');
});

$('lockBtn').addEventListener('click', () => {
  state.vault = null; state.fileText = null; state.clipToken = null;
  $('fileDrop').classList.remove('loaded');
  $('fileName').innerHTML = 'Choose or drop your <b>.vault</b> file';
  $('fileInput').value = '';
  show('unlock');
});

document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('modal').hidden) closeModal(); });
