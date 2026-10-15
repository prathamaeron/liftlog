// GitHub sync: stores all data as one JSON file in a (private) repository
// using the GitHub Contents API. Merges record-by-record, newest edit wins.
import { getData, replaceData, merge, fingerprint, onChange } from './store.js';

const CONFIG_KEY = 'liftlog:sync:v1';
const API = 'https://api.github.com';

let status = { state: 'idle', message: '', lastSyncAt: null };
const statusListeners = new Set();
let inflight = null;
let debounceTimer = null;

export function getConfig() {
  try { return JSON.parse(localStorage.getItem(CONFIG_KEY)) || {}; } catch { return {}; }
}

export function saveConfig(cfg) {
  const clean = {
    owner: (cfg.owner || '').trim(),
    repo: (cfg.repo || '').trim(),
    branch: (cfg.branch || 'main').trim() || 'main',
    path: (cfg.path || 'liftlog-data.json').trim().replace(/^\/+/, '') || 'liftlog-data.json',
    token: (cfg.token || '').trim(),
    auto: cfg.auto !== false,
    lastSyncAt: cfg.lastSyncAt || null,
  };
  localStorage.setItem(CONFIG_KEY, JSON.stringify(clean));
  return clean;
}

export function clearConfig() {
  localStorage.removeItem(CONFIG_KEY);
  setStatus({ state: 'idle', message: '', lastSyncAt: null });
}

export function isConfigured(cfg = getConfig()) {
  return !!(cfg.owner && cfg.repo && cfg.token);
}

export function getStatus() {
  return { ...status, lastSyncAt: status.lastSyncAt || getConfig().lastSyncAt || null };
}
export function onStatus(fn) { statusListeners.add(fn); return () => statusListeners.delete(fn); }
function setStatus(s) { status = { ...status, ...s }; statusListeners.forEach(fn => fn(getStatus())); }

// ---------- encoding ----------

function toBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
function fromBase64(b64) {
  const bin = atob(b64.replace(/\s/g, ''));
  const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

// ---------- API ----------

async function gh(cfg, path, opts = {}) {
  const res = await fetch(API + path, {
    ...opts,
    cache: 'no-store',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${cfg.token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
  return res;
}

function filePath(cfg) {
  return `/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}/contents/${cfg.path.split('/').map(encodeURIComponent).join('/')}`;
}

async function fetchRemote(cfg) {
  const res = await gh(cfg, `${filePath(cfg)}?ref=${encodeURIComponent(cfg.branch)}&t=${Date.now()}`);
  if (res.status === 404) return null;
  if (!res.ok) throw await apiError(res);
  const meta = await res.json();
  let content = meta.content;
  if (!content && meta.sha) {
    // Files over 1 MB are not inlined; fetch the blob instead.
    const blob = await gh(cfg, `/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}/git/blobs/${meta.sha}`);
    if (!blob.ok) throw await apiError(blob);
    content = (await blob.json()).content;
  }
  const text = content ? fromBase64(content) : '{}';
  return { data: JSON.parse(text || '{}'), sha: meta.sha };
}

async function pushRemote(cfg, data, sha) {
  const body = {
    message: `LiftLog sync ${new Date().toISOString()}`,
    content: toBase64(JSON.stringify(data, null, 1)),
    branch: cfg.branch,
    ...(sha ? { sha } : {}),
  };
  const res = await gh(cfg, filePath(cfg), { method: 'PUT', body: JSON.stringify(body) });
  if (res.status === 409 || res.status === 422) {
    const err = await apiError(res); err.conflict = true; throw err;
  }
  if (!res.ok) throw await apiError(res);
  return (await res.json()).content.sha;
}

async function apiError(res) {
  let msg = `GitHub error ${res.status}`;
  try { const j = await res.json(); if (j.message) msg += `: ${j.message}`; } catch {}
  if (res.status === 401) msg = 'GitHub rejected the token (401). Check that it is correct and not expired.';
  if (res.status === 403) msg = 'Token lacks permission (403). It needs Contents: Read and write on the data repo.';
  if (res.status === 404) msg = 'Repository or branch not found (404). Check owner, repo, branch, and token access.';
  const e = new Error(msg); e.status = res.status; return e;
}

/** Check credentials against the repository. */
export async function testConnection(cfg) {
  const res = await gh(cfg, `/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}`);
  if (!res.ok) throw await apiError(res);
  const repo = await res.json();
  return { private: repo.private, fullName: repo.full_name, defaultBranch: repo.default_branch };
}

// ---------- sync ----------

export function sync() {
  if (inflight) return inflight;
  inflight = doSync().finally(() => { inflight = null; });
  return inflight;
}

async function doSync(attempt = 0) {
  const cfg = getConfig();
  if (!isConfigured(cfg)) return;
  if (!navigator.onLine) { setStatus({ state: 'offline', message: 'Offline: will sync when back online' }); return; }
  setStatus({ state: 'syncing', message: 'Syncing…' });
  try {
    const remote = await fetchRemote(cfg);
    const local = getData();
    const merged = remote ? merge(local, remote.data) : local;
    if (fingerprint(merged) !== fingerprint(local)) replaceData(merged, { silentSync: true });
    if (!remote || fingerprint(merged) !== fingerprint(remote.data)) {
      await pushRemote(cfg, merged, remote?.sha);
    }
    const at = Date.now();
    saveConfig({ ...getConfig(), lastSyncAt: at });
    setStatus({ state: 'ok', message: 'Synced', lastSyncAt: at });
  } catch (e) {
    if (e.conflict && attempt < 2) return doSync(attempt + 1); // another device pushed first; re-merge
    console.error(e);
    setStatus({ state: 'error', message: e.message || 'Sync failed' });
  }
}

/** Wire up automatic syncing: on start, on reconnect, on focus, and after edits. */
export function initAutoSync() {
  onChange(meta => {
    if (meta.source === 'sync') return;
    const cfg = getConfig();
    if (!isConfigured(cfg) || !cfg.auto) return;
    setStatus({ state: 'pending', message: 'Changes not yet synced' });
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(sync, 4000);
  });
  const autoSync = () => { const c = getConfig(); if (isConfigured(c) && c.auto) sync(); };
  window.addEventListener('online', autoSync);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') autoSync(); });
  autoSync();
}
