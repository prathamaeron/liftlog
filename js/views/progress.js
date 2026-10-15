// Progress: per exercise and per template, with charts and PRs.
import { sortedExercises, sortedTemplates, get, put, remove, getUnit, toDisplay, fmtWeight, round1, list } from '../store.js';
import { esc, fmtDate, fmtDuration, fmtNum, relativeDay } from '../util.js';
import { exerciseHistory, exercisePRs, templateHistory, summarizeEntry } from '../stats.js';
import { lineChart } from '../charts.js';
import { emptyState, unitToggle, openSheet } from '../ui.js';
import { setText } from './workout.js';

const ui = { tab: 'exercises', metric: {}, range: 'all' };
const RANGES = [['3m', '3M', 91], ['6m', '6M', 182], ['1y', '1Y', 365], ['all', 'All', null]];

function inRange(ts) {
  const r = RANGES.find(x => x[0] === ui.range);
  return !r?.[2] || ts >= Date.now() - r[2] * 86400000;
}
function rangeChips() {
  return `<div class="seg sm" data-group="range">${RANGES.map(([k, l]) => `<button data-v="${k}" class="${ui.range === k ? 'on' : ''}">${l}</button>`).join('')}</div>`;
}

export function render(el, params, ctx) {
  if (params.kind === 'exercise') return exerciseDetail(el, params.id, ctx);
  if (params.kind === 'template') return templateDetail(el, params.id, ctx);
  return overview(el, ctx);
}

function overview(el, { rerender }) {
  const unit = getUnit();
  let body = '';
  if (ui.tab === 'exercises') {
    const rows = sortedExercises().map(ex => ({ ex, h: exerciseHistory(ex.id) }));
    rows.sort((a, b) => (b.h.at(-1)?.session.date || 0) - (a.h.at(-1)?.session.date || 0));
    body = rows.length ? `<div class="prog-list">${rows.map(({ ex, h }) => {
      const last = h.at(-1), first = h[0];
      const bw = ex.type === 'bodyweight';
      let trend = '';
      if (h.length >= 2) {
        const a = bw ? first.maxReps : first.bestE1rm, b = bw ? last.maxReps : last.bestE1rm;
        const pct = a ? ((b - a) / a) * 100 : 0;
        trend = `<span class="trend ${pct >= 0 ? 'up' : 'down'}">${pct >= 0 ? '▲' : '▼'} ${Math.abs(pct).toFixed(0)}%</span>`;
      }
      return `<a class="card prog" href="#/progress/exercise/${ex.id}">
        <div class="grow"><b>${esc(ex.name)}</b>${bw ? ' <span class="tag">BW</span>' : ''}
          <div class="muted small">${h.length ? `${h.length} session${h.length > 1 ? 's' : ''} · last ${relativeDay(last.session.date).toLowerCase()}` : 'Not logged yet'}</div></div>
        <div class="right">${last ? `<b>${esc(setText(last.bestSet, bw, unit))}</b>` : ''}${trend}</div>
      </a>`;
    }).join('')}</div>` : emptyState('No exercises yet', 'Exercises appear here once you add them to a template or workout.');
  } else {
    const ts = sortedTemplates({ includeArchived: true });
    body = ts.length ? `<div class="prog-list">${ts.map(t => {
      const h = templateHistory(t.id);
      return `<a class="card prog" href="#/progress/template/${t.id}">
        <div class="grow"><b>${esc(t.name)}</b><div class="muted small">${h.length} workout${h.length === 1 ? '' : 's'}${h.length ? ' · last ' + relativeDay(h.at(-1).session.date).toLowerCase() : ''}</div></div>
        <div class="right">${h.length ? `<b>${fmtNum(toDisplay(h.at(-1).volume, unit))} ${unit}</b><span class="muted small">last volume</span>` : ''}</div>
      </a>`;
    }).join('')}</div>` : emptyState('No templates yet', 'Create a template on the Train tab.');
  }

  el.innerHTML = `<div class="page">
    <header class="hero row between"><h1>Progress</h1>${unitToggle(unit)}</header>
    <div class="seg" data-group="tab">
      <button data-v="exercises" class="${ui.tab === 'exercises' ? 'on' : ''}">Exercises</button>
      <button data-v="templates" class="${ui.tab === 'templates' ? 'on' : ''}">Templates</button>
    </div>
    ${body}
  </div>`;
  el.addEventListener('click', e => {
    const b = e.target.closest('[data-group="tab"] [data-v]');
    if (b) { ui.tab = b.dataset.v; rerender(); }
  });
}

function exerciseDetail(el, id, { rerender, navigate }) {
  const ex = get('exercises', id);
  if (!ex) { el.innerHTML = `<div class="page"><p class="muted">Exercise not found.</p><a class="btn" href="#/progress">Back</a></div>`; return; }
  const unit = getUnit();
  const bw = ex.type === 'bodyweight';
  const all = exerciseHistory(id);
  const h = all.filter(r => inRange(r.session.date));
  const pr = exercisePRs(all);
  const usesWeight = all.some(r => r.topWeight > 0);

  const metrics = bw
    ? [['maxReps', 'Best set reps'], ['reps', 'Total reps'], ...(usesWeight ? [['topWeight', 'Added weight']] : [])]
    : [['bestE1rm', 'Est. 1RM'], ['topWeight', 'Top weight'], ['volume', 'Volume'], ['reps', 'Total reps']];
  const metric = metrics.find(m => m[0] === ui.metric[id])?.[0] || metrics[0][0];
  const isWeight = ['bestE1rm', 'topWeight', 'volume'].includes(metric);
  const points = h.map(r => ({
    x: r.session.date,
    y: isWeight ? toDisplay(r[metric], unit) : r[metric],
    label: isWeight ? `${metric === 'volume' ? fmtNum(toDisplay(r[metric], unit)) : round1(toDisplay(r[metric], unit))} ${unit}` : `${r[metric]} reps`,
  }));

  const prCards = bw && !usesWeight
    ? [['Best set', pr.maxReps ? `${pr.maxReps.value} reps` : '—', pr.maxReps?.date], ['Most total reps', pr.reps ? `${pr.reps.value}` : '—', pr.reps?.date]]
    : [
      ['Heaviest set', pr.topWeight ? setText(pr.topWeight.set, bw, unit) + ` ${bw ? '' : unit}` : '—', pr.topWeight?.date],
      ['Best est. 1RM', pr.bestE1rm?.value ? fmtWeight(pr.bestE1rm.value) : '—', pr.bestE1rm?.date],
      ['Best volume', pr.volume?.value ? `${fmtNum(toDisplay(pr.volume.value, unit))} ${unit}` : '—', pr.volume?.date],
      ['Most reps in a set', pr.maxReps ? `${pr.maxReps.value}` : '—', pr.maxReps?.date],
    ];

  el.innerHTML = `<div class="page">
    <div class="page-head">
      <a class="back" href="#/progress" aria-label="Back">‹</a>
      <h1 class="grow">${esc(ex.name)}</h1>
      <button class="icon-btn" data-act="edit" aria-label="Edit exercise">✎</button>
    </div>
    <div class="pr-grid">${prCards.map(([k, v, d]) => `<div class="stat"><span class="k">${k}</span><b>${esc(v)}</b><span class="muted small">${d ? fmtDate(d, true) : ''}</span></div>`).join('')}</div>

    <div class="card">
      <div class="row between wrap gap">
        <div class="seg sm" data-group="metric">${metrics.map(([k, l]) => `<button data-v="${k}" class="${metric === k ? 'on' : ''}">${l}</button>`).join('')}</div>
        ${rangeChips()}
      </div>
      ${lineChart(points, { empty: all.length ? 'No sessions in this range' : 'Log this exercise to see progress', title: ex.name })}
      ${!bw && metric === 'bestE1rm' ? `<p class="muted small">Estimated 1-rep max uses the Epley formula: weight × (1 + reps ÷ 30).</p>` : ''}
    </div>

    <div class="section-head"><h2>History</h2>${unitToggle(unit)}</div>
    <div class="hist-list">${[...h].reverse().map(r => `
      <a class="card hist" href="#/workout/${r.session.id}">
        <div class="row between"><b>${fmtDate(r.session.date)}</b><span class="muted small">${esc(r.session.name)}</span></div>
        <div class="sets-line">${r.entry.sets.filter(s => s.done && s.reps > 0).map(s => `<span>${esc(setText(s, bw, unit))}</span>`).join('')}</div>
        ${!bw ? `<div class="muted small">e1RM ${fmtWeight(r.bestE1rm)} · volume ${fmtNum(toDisplay(r.volume, unit))} ${unit}</div>` : `<div class="muted small">${r.reps} total reps</div>`}
      </a>`).join('') || '<p class="muted pad">Nothing logged yet.</p>'}</div>
  </div>`;

  el.addEventListener('click', e => {
    const m = e.target.closest('[data-group="metric"] [data-v]');
    if (m) { ui.metric[id] = m.dataset.v; rerender(); return; }
    const r = e.target.closest('[data-group="range"] [data-v]');
    if (r) { ui.range = r.dataset.v; rerender(); return; }
    if (e.target.closest('[data-act="edit"]')) editExercise(ex, rerender, navigate);
  });
}

export function editExercise(ex, after, navigate) {
  const used = list('sessions').filter(s => s.entries?.some(e => e.exerciseId === ex.id)).length
    + list('templates').filter(t => t.items?.some(i => i.exerciseId === ex.id)).length;
  const { el, close } = openSheet(`
    <div class="sheet-head"><h2>Edit exercise</h2><button class="btn ghost sm" data-close>Cancel</button></div>
    <form class="stack">
      <label class="lbl">Name<input class="input" name="name" value="${esc(ex.name)}" required></label>
      <label class="lbl">Type
        <select class="input" name="type">
          <option value="weighted" ${ex.type !== 'bodyweight' ? 'selected' : ''}>Weighted (barbell, dumbbell, machine…)</option>
          <option value="bodyweight" ${ex.type === 'bodyweight' ? 'selected' : ''}>Bodyweight (optional added weight)</option>
        </select></label>
      <div class="row gap end">
        <button type="button" class="btn ghost danger" data-del ${used ? 'disabled title="Used in workouts or templates"' : ''}>Delete</button>
        <button class="btn primary">Save</button>
      </div>
      ${used ? `<p class="muted small">Used in ${used} workout${used > 1 ? 's' : ''}/template${used > 1 ? 's' : ''}, so it can’t be deleted.</p>` : ''}
    </form>`);
  el.querySelector('form').addEventListener('submit', e => {
    e.preventDefault();
    const f = new FormData(e.target);
    put('exercises', { ...ex, name: f.get('name').trim() || ex.name, type: f.get('type') });
    close(); after();
  });
  el.querySelector('[data-del]')?.addEventListener('click', () => {
    if (!confirm(`Delete “${ex.name}”?`)) return;
    remove('exercises', ex.id); close();
    if (navigate && location.hash.includes(ex.id)) navigate('progress'); else after();
  });
}

function templateDetail(el, id, { rerender }) {
  const t = get('templates', id);
  if (!t) { el.innerHTML = `<div class="page"><p class="muted">Template not found.</p><a class="btn" href="#/progress">Back</a></div>`; return; }
  const unit = getUnit();
  const all = templateHistory(id);
  const h = all.filter(r => inRange(r.session.date));
  const metrics = [['volume', 'Volume'], ['sets', 'Sets'], ['reps', 'Reps'], ['duration', 'Duration']];
  const metric = metrics.find(m => m[0] === ui.metric[id])?.[0] || 'volume';
  const points = h.map(r => {
    if (metric === 'volume') return { x: r.session.date, y: toDisplay(r.volume, unit), label: `${fmtNum(toDisplay(r.volume, unit))} ${unit}` };
    if (metric === 'duration') return { x: r.session.date, y: r.duration ? r.duration / 60000 : null, label: fmtDuration(r.duration) };
    return { x: r.session.date, y: r[metric], label: `${r[metric]} ${metric}` };
  });

  // Exercise-by-exercise change: first vs latest session in range.
  const exRows = (t.items || []).map(it => {
    const ex = get('exercises', it.exerciseId);
    if (!ex) return '';
    const bw = ex.type === 'bodyweight';
    const sums = h.map(r => r.session.entries.find(e => e.exerciseId === ex.id)).filter(Boolean)
      .map(e => summarizeEntry(e, ex.type)).filter(Boolean);
    if (!sums.length) return `<tr><td>${esc(ex.name)}</td><td colspan="3" class="muted">—</td></tr>`;
    const f = sums[0], l = sums.at(-1);
    const val = s => (bw ? `${s.maxReps} reps` : fmtWeight(s.bestE1rm));
    const a = bw ? f.maxReps : f.bestE1rm, b = bw ? l.maxReps : l.bestE1rm;
    const pct = a ? ((b - a) / a) * 100 : 0;
    return `<tr><td><a href="#/progress/exercise/${ex.id}">${esc(ex.name)}</a></td><td>${val(f)}</td><td>${val(l)}</td>
      <td class="trend ${pct >= 0 ? 'up' : 'down'}">${sums.length > 1 ? `${pct >= 0 ? '+' : ''}${pct.toFixed(0)}%` : ''}</td></tr>`;
  }).join('');

  const avg = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
  const durations = h.map(r => r.duration).filter(Boolean);

  el.innerHTML = `<div class="page">
    <div class="page-head">
      <a class="back" href="#/progress" aria-label="Back">‹</a>
      <h1 class="grow">${esc(t.name)}</h1>
      <a class="icon-btn" href="#/templates/${t.id}" aria-label="Edit template">✎</a>
    </div>
    <div class="pr-grid">
      <div class="stat"><span class="k">Workouts</span><b>${h.length}</b></div>
      <div class="stat"><span class="k">Avg duration</span><b>${fmtDuration(avg(durations))}</b></div>
      <div class="stat"><span class="k">Avg volume</span><b>${fmtNum(toDisplay(avg(h.map(r => r.volume)), unit))}</b><span class="muted small">${unit}</span></div>
      <div class="stat"><span class="k">Last done</span><b>${all.length ? relativeDay(all.at(-1).session.date) : '—'}</b></div>
    </div>
    <div class="card">
      <div class="row between wrap gap">
        <div class="seg sm" data-group="metric">${metrics.map(([k, l]) => `<button data-v="${k}" class="${metric === k ? 'on' : ''}">${l}</button>`).join('')}</div>
        ${rangeChips()}
      </div>
      ${lineChart(points, { empty: 'Do this workout to see progress', title: t.name })}
    </div>
    <div class="card">
      <h3>Exercise change <span class="muted small">(first → latest in range · est. 1RM, or best-set reps for bodyweight)</span></h3>
      <table class="tbl"><thead><tr><th>Exercise</th><th>First</th><th>Latest</th><th></th></tr></thead><tbody>${exRows}</tbody></table>
    </div>
    <div class="section-head"><h2>Sessions</h2>${unitToggle(unit)}</div>
    <div class="hist-list">${[...h].reverse().map(r => `
      <a class="card hist" href="#/workout/${r.session.id}">
        <div class="row between"><b>${fmtDate(r.session.date)}</b><span class="muted small">${fmtDuration(r.duration)}</span></div>
        <div class="chips small"><span>${r.sets} sets</span><span>${r.reps} reps</span><span>${fmtNum(toDisplay(r.volume, unit))} ${unit}</span></div>
        ${r.session.notes ? `<p class="note small">${esc(r.session.notes)}</p>` : ''}
      </a>`).join('') || '<p class="muted pad">No sessions in this range.</p>'}</div>
  </div>`;

  el.addEventListener('click', e => {
    const m = e.target.closest('[data-group="metric"] [data-v]');
    if (m) { ui.metric[id] = m.dataset.v; rerender(); return; }
    const r = e.target.closest('[data-group="range"] [data-v]');
    if (r) { ui.range = r.dataset.v; rerender(); }
  });
}
