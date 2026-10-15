// Small shared helpers.

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function fmtDate(ts, short = false) {
  const d = new Date(ts);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  if (short) return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: '2-digit' }) });
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) });
}

export function fmtTime(ts) {
  return new Date(ts).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function fmtDuration(ms) {
  if (!ms || ms < 0) return '—';
  const m = Math.round(ms / 60000);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${m % 60} min`;
}

export function fmtClock(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const mm = String(m).padStart(h ? 2 : 1, '0'), ss = String(sec).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function relativeDay(ts, compact = false) {
  const day = 86400000;
  const start = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x.getTime(); };
  const diff = Math.round((start(Date.now()) - start(ts)) / day);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 7) return compact ? `${diff}d ago` : `${diff} days ago`;
  if (diff < 30) return compact ? `${Math.round(diff / 7)}w ago` : `${Math.round(diff / 7)} wk ago`;
  return fmtDate(ts, true);
}

/** Value for <input type="datetime-local"> */
export function toLocalInput(ts) {
  const d = new Date(ts);
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d - off).toISOString().slice(0, 16);
}
export function toDateInput(ts) { return toLocalInput(ts).slice(0, 10); }

export function fmtNum(n) {
  if (n == null || isNaN(n)) return '—';
  return Math.round(n).toLocaleString();
}

export function toast(msg, ms = 2400) {
  let el = document.getElementById('toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; document.body.appendChild(el); }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), ms);
}

export function downloadBlob(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

export function dateStamp() { return toDateInput(Date.now()); }
