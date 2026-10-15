// Settings: units, GitHub sync, exercise library, backups.
import { getUnit, setUnit, sortedExercises, getData, replaceData } from '../store.js';
import { getConfig, saveConfig, clearConfig, testConnection, sync, getStatus, onStatus, isConfigured } from '../sync.js';
import { esc, relativeDay, fmtTime, toast } from '../util.js';
import { exportJSON, importJSON, exportPDF } from '../export.js';
import { editExercise } from './progress.js';

export function render(el, _p, { rerender, navigate }) {
  const unit = getUnit();
  const cfg = getConfig();
  const st = getStatus();
  const exercises = sortedExercises();

  el.innerHTML = `<div class="page">
    <header class="hero"><h1>Settings</h1></header>

    <section class="card">
      <h2>Units</h2>
      <p class="muted small">Everything is stored precisely, so switching never loses accuracy. While logging, the other unit is shown under each weight.</p>
      <div class="seg" data-group="unit">
        <button data-v="lb" class="${unit === 'lb' ? 'on' : ''}">Pounds (lb)</button>
        <button data-v="kg" class="${unit === 'kg' ? 'on' : ''}">Kilograms (kg)</button>
      </div>
    </section>

    <section class="card">
      <div class="row between"><h2>GitHub sync</h2>${isConfigured(cfg) ? `<span class="pill ${st.state}">${esc(st.state === 'ok' ? 'Connected' : st.state)}</span>` : ''}</div>
      <p class="muted small">Your data is saved as one JSON file in a <b>private</b> repository you own, so your phone and laptop stay in sync. The token is stored only on this device. Set it up once on each device.</p>
      <form class="stack" id="sync-form">
        <div class="row gap">
          <label class="mini grow">Owner<input class="input" name="owner" value="${esc(cfg.owner || '')}" placeholder="your-github-username" autocapitalize="off" autocomplete="off" spellcheck="false"></label>
          <label class="mini grow">Data repo<input class="input" name="repo" value="${esc(cfg.repo || '')}" placeholder="liftlog-data" autocapitalize="off" autocomplete="off" spellcheck="false"></label>
        </div>
        <div class="row gap">
          <label class="mini grow">Branch<input class="input" name="branch" value="${esc(cfg.branch || 'main')}" autocapitalize="off"></label>
          <label class="mini grow">File<input class="input" name="path" value="${esc(cfg.path || 'liftlog-data.json')}" autocapitalize="off"></label>
        </div>
        <label class="mini">Personal access token<input class="input" name="token" type="password" value="${esc(cfg.token || '')}" placeholder="github_pat_…" autocomplete="off"></label>
        <label class="check-row"><input type="checkbox" name="auto" ${cfg.auto !== false ? 'checked' : ''}> Sync automatically</label>
        <div class="row gap wrap">
          <button class="btn primary">Save & connect</button>
          ${isConfigured(cfg) ? `<button type="button" class="btn" data-act="sync">Sync now</button><button type="button" class="btn ghost danger" data-act="disconnect">Disconnect</button>` : ''}
        </div>
        <p class="small sync-msg ${st.state === 'error' ? 'err' : 'muted'}">${isConfigured(cfg) ? esc(st.message || '') + (st.lastSyncAt ? ` Last synced ${relativeDay(st.lastSyncAt).toLowerCase()} at ${fmtTime(st.lastSyncAt)}.` : '') : ''}</p>
      </form>
      <details class="help">
        <summary>How to create the token</summary>
        <ol class="small">
          <li>On GitHub, create a new <b>private</b> repository (e.g. <code>liftlog-data</code>). Tick “Add a README” so it has a <code>main</code> branch.</li>
          <li>Go to Settings → Developer settings → Personal access tokens → <b>Fine-grained tokens</b> → Generate new token.</li>
          <li>Repository access: <b>Only select repositories</b> → choose your data repo.</li>
          <li>Permissions → Repository permissions → <b>Contents: Read and write</b>. Nothing else is needed.</li>
          <li>Pick an expiration, generate, and paste the token here. Do the same on your other device (or reuse the token).</li>
        </ol>
      </details>
    </section>

    <section class="card">
      <h2>Backup & export</h2>
      <div class="stack">
        <div class="row gap wrap">
          <button class="btn" data-act="json">Export JSON backup</button>
          <label class="btn">Import JSON<input type="file" accept="application/json,.json" hidden data-act="import"></label>
        </div>
        <p class="muted small">Importing merges with what’s already here; newer edits win.</p>
        <div class="row gap wrap">
          <select class="input auto" id="pdf-range">
            <option value="30">Last 30 days</option>
            <option value="90" selected>Last 90 days</option>
            <option value="365">Last 12 months</option>
            <option value="0">All time</option>
          </select>
          <button class="btn" data-act="pdf">Export PDF report</button>
        </div>
      </div>
    </section>

    <section class="card">
      <div class="row between"><h2>Exercise library</h2><span class="muted small">${exercises.length}</span></div>
      <div class="list">${exercises.map(ex => `
        <button class="list-row tap" data-ex="${ex.id}"><span class="grow">${esc(ex.name)}</span>${ex.type === 'bodyweight' ? '<span class="tag">BW</span>' : ''}<span class="muted">›</span></button>`).join('') || '<p class="muted small">Exercises you create while building templates appear here.</p>'}</div>
    </section>

    <section class="card">
      <h2>This device</h2>
      <p class="muted small">Clearing removes data stored in this browser only. If sync is on, your GitHub copy stays and will download again next sync.</p>
      <button class="btn ghost danger" data-act="wipe">Clear local data</button>
    </section>
    <p class="muted small center">LiftLog · your data lives in your browser${isConfigured(cfg) ? ' and your GitHub repo' : ''}.</p>
  </div>`;

  const off = onStatus(s => {
    const msg = el.querySelector('.sync-msg');
    if (msg) {
      msg.className = `small sync-msg ${s.state === 'error' ? 'err' : 'muted'}`;
      msg.textContent = (s.message || '') + (s.lastSyncAt ? ` Last synced ${relativeDay(s.lastSyncAt).toLowerCase()} at ${fmtTime(s.lastSyncAt)}.` : '');
    }
  });

  el.querySelector('#sync-form').addEventListener('submit', async e => {
    e.preventDefault();
    const f = new FormData(e.target);
    const next = { owner: f.get('owner'), repo: f.get('repo'), branch: f.get('branch'), path: f.get('path'), token: f.get('token'), auto: f.get('auto') === 'on', lastSyncAt: cfg.lastSyncAt };
    if (!next.owner || !next.repo || !next.token) { toast('Owner, repo and token are required'); return; }
    const btn = e.target.querySelector('.btn.primary');
    btn.disabled = true; btn.textContent = 'Connecting…';
    try {
      const saved = saveConfig(next);
      const info = await testConnection(saved);
      if (!info.private && !confirm(`${info.fullName} is PUBLIC. Anyone could read your workout data. Continue anyway?`)) {
        clearConfig(); throw new Error('Cancelled: use a private repository.');
      }
      document.dispatchEvent(new Event('liftlog:sync-config'));
      await sync();
      const s = getStatus();
      toast(s.state === 'ok' ? 'Connected and synced' : s.message);
      rerender();
    } catch (err) {
      toast(err.message || 'Could not connect');
      const msg = el.querySelector('.sync-msg');
      msg.className = 'small sync-msg err'; msg.textContent = err.message;
    } finally { btn.disabled = false; btn.textContent = 'Save & connect'; }
  });

  el.addEventListener('change', async e => {
    if (e.target.dataset.act === 'import') {
      const file = e.target.files[0];
      if (!file) return;
      try { const n = await importJSON(file); toast(`Imported ${n} records`); rerender(); }
      catch (err) { toast('Import failed: ' + err.message); }
    }
  });

  el.addEventListener('click', async e => {
    const u = e.target.closest('[data-group="unit"] [data-v]');
    if (u) { setUnit(u.dataset.v); rerender(); return; }
    const ex = e.target.closest('[data-ex]');
    if (ex) { editExercise(sortedExercises().find(x => x.id === ex.dataset.ex), rerender); return; }
    const a = e.target.closest('[data-act]')?.dataset.act;
    if (a === 'sync') { await sync(); rerender(); }
    if (a === 'disconnect' && confirm('Disconnect GitHub sync on this device? Your data stays here and on GitHub.')) {
      clearConfig(); document.dispatchEvent(new Event('liftlog:sync-config')); rerender();
    }
    if (a === 'json') exportJSON();
    if (a === 'pdf') {
      const days = +el.querySelector('#pdf-range').value;
      const btn = e.target.closest('[data-act]');
      btn.disabled = true; btn.textContent = 'Building PDF…';
      try { await exportPDF({ days }); } catch (err) { console.error(err); toast('PDF export failed: ' + err.message); }
      btn.disabled = false; btn.textContent = 'Export PDF report';
    }
    if (a === 'wipe' && confirm('Clear all LiftLog data from this browser? Export a backup first if sync is off.')) {
      replaceData({}); navigate('');
    }
  });

  return off;
}
