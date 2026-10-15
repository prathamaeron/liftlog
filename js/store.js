// Data layer: local persistence, units, and record-level merge for sync.
// All weights are stored in kilograms (full precision) and converted for display.

const STORAGE_KEY = 'liftlog:data:v1';
export const KG_PER_LB = 0.45359237;

const COLLECTIONS = ['exercises', 'templates', 'sessions', 'bodyweights'];

function emptyData() {
  return {
    schema: 1,
    settings: { unit: 'lb', updatedAt: 0 },
    exercises: {},
    templates: {},
    sessions: {},
    bodyweights: {},
  };
}

let data = load();
const listeners = new Set();

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyData();
    return normalize(JSON.parse(raw));
  } catch (e) {
    console.error('Failed to load data', e);
    return emptyData();
  }
}

export function normalize(d) {
  const base = emptyData();
  if (!d || typeof d !== 'object') return base;
  base.settings = { ...base.settings, ...(d.settings || {}) };
  for (const c of COLLECTIONS) base[c] = { ...(d[c] || {}) };
  return base;
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit(meta) { listeners.forEach(fn => fn(meta)); }

export function getData() { return data; }

/** Replace all data (used by import/merge). */
export function replaceData(next, { silentSync = false } = {}) {
  data = normalize(next);
  persist();
  emit({ source: silentSync ? 'sync' : 'replace' });
}

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export const now = () => Date.now();

// ---------- generic record helpers ----------

export function list(collection, { includeDeleted = false } = {}) {
  return Object.values(data[collection]).filter(r => includeDeleted || !r.deleted);
}

export function get(collection, id) {
  const r = data[collection][id];
  return r && !r.deleted ? r : null;
}

export function put(collection, record) {
  const r = { ...record, updatedAt: now() };
  if (!r.id) r.id = uid();
  if (!r.createdAt) r.createdAt = r.updatedAt;
  data[collection][r.id] = r;
  persist();
  emit({ source: 'local', collection, id: r.id });
  return r;
}

/** Soft delete (a tombstone), so deletions sync to other devices. */
export function remove(collection, id) {
  const r = data[collection][id];
  if (!r) return;
  data[collection][id] = { id, deleted: true, updatedAt: now() };
  persist();
  emit({ source: 'local', collection, id });
}

// ---------- settings & units ----------

export function getUnit() { return data.settings.unit || 'lb'; }

export function setUnit(unit) {
  data.settings = { ...data.settings, unit, updatedAt: now() };
  persist();
  emit({ source: 'local', collection: 'settings' });
}

export function toDisplay(kg, unit = getUnit()) {
  if (kg == null || kg === '' || isNaN(kg)) return null;
  return unit === 'lb' ? kg / KG_PER_LB : kg;
}

export function fromDisplay(value, unit = getUnit()) {
  if (value === '' || value == null) return null;
  const n = parseFloat(String(value).replace(',', '.'));
  if (isNaN(n)) return null;
  return unit === 'lb' ? n * KG_PER_LB : n;
}

/** Round a display number nicely: up to 1 decimal, no trailing ".0". */
export function round1(n) {
  if (n == null || isNaN(n)) return '';
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

export function fmtWeight(kg, unit = getUnit(), withUnit = true) {
  const v = toDisplay(kg, unit);
  if (v == null) return '—';
  return withUnit ? `${round1(v)} ${unit}` : round1(v);
}

export function otherUnit(unit = getUnit()) { return unit === 'lb' ? 'kg' : 'lb'; }

// ---------- merge (used by sync and JSON import) ----------

/** Merge two datasets record-by-record; the newer updatedAt wins. */
export function merge(a, b) {
  a = normalize(a); b = normalize(b);
  const out = emptyData();
  out.settings = (b.settings.updatedAt || 0) > (a.settings.updatedAt || 0) ? b.settings : a.settings;
  for (const c of COLLECTIONS) {
    const ids = new Set([...Object.keys(a[c]), ...Object.keys(b[c])]);
    for (const id of ids) {
      const ra = a[c][id], rb = b[c][id];
      if (!ra) out[c][id] = rb;
      else if (!rb) out[c][id] = ra;
      else out[c][id] = (rb.updatedAt || 0) > (ra.updatedAt || 0) ? rb : ra;
    }
  }
  return out;
}

/** Stable fingerprint so we can tell whether two datasets differ. */
export function fingerprint(d) {
  d = normalize(d);
  const parts = [`s:${d.settings.unit}:${d.settings.updatedAt}`];
  for (const c of COLLECTIONS) {
    const ids = Object.keys(d[c]).sort();
    for (const id of ids) parts.push(`${c}:${id}:${d[c][id].updatedAt}`);
  }
  return parts.join('|');
}

// ---------- domain helpers ----------

export function exerciseByName(name) {
  const n = name.trim().toLowerCase();
  return list('exercises').find(e => e.name.trim().toLowerCase() === n) || null;
}

export function sortedExercises() {
  return list('exercises').sort((a, b) => a.name.localeCompare(b.name));
}

export function sortedTemplates({ includeArchived = false } = {}) {
  return list('templates')
    .filter(t => includeArchived || !t.archived)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name));
}

/** Finished sessions, newest first. */
export function finishedSessions() {
  return list('sessions').filter(s => s.finishedAt).sort((a, b) => b.date - a.date);
}

export function activeSession() {
  return list('sessions').filter(s => !s.finishedAt).sort((a, b) => b.updatedAt - a.updatedAt)[0] || null;
}

export function sortedBodyweights() {
  return list('bodyweights').sort((a, b) => a.date - b.date);
}

/** Most recent finished session entry for an exercise (optionally before a date). */
export function lastEntryFor(exerciseId, beforeDate = Infinity, excludeSessionId = null) {
  for (const s of finishedSessions()) {
    if (s.id === excludeSessionId || s.date >= beforeDate) continue;
    const entry = s.entries.find(e => e.exerciseId === exerciseId && e.sets.some(isCountedSet));
    if (entry) return { session: s, entry };
  }
  return null;
}

export function isCountedSet(set) {
  return set.done && set.reps > 0;
}
