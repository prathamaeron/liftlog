// Train tab: active workout, templates, quick stats.
import { sortedTemplates, activeSession, finishedSessions, get, sortedBodyweights, fmtWeight, put, getUnit, fromDisplay } from '../store.js';
import { esc, relativeDay, fmtClock, toast } from '../util.js';
import { startWorkout } from './workout.js';
import { workoutsThisWeek } from '../stats.js';
import { emptyState, openSheet } from '../ui.js';

export function render(el, _params, { navigate, rerender }) {
  const active = activeSession();
  const templates = sortedTemplates();
  const sessions = finishedSessions();
  const lastByTemplate = {};
  for (const s of sessions) if (s.templateId && !lastByTemplate[s.templateId]) lastByTemplate[s.templateId] = s.date;
  const bws = sortedBodyweights();
  const latestBw = bws.at(-1);

  el.innerHTML = `
  <div class="page">
    <header class="hero">
      <p class="eyebrow">${new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</p>
      <h1>Train</h1>
    </header>

    ${active ? `
    <a class="active-banner" href="#/workout/${active.id}">
      <span class="dot-live"></span>
      <div class="grow"><b>${esc(active.name)}</b><span class="small">In progress · <span data-clock>${fmtClock(Date.now() - active.startedAt)}</span></span></div>
      <span class="btn primary sm">Resume</span>
    </a>` : ''}

    <div class="stat-cards">
      <div class="stat"><span class="k">This week</span><b>${workoutsThisWeek()}</b><span class="muted small">workouts</span></div>
      <div class="stat"><span class="k">Last</span><b>${sessions[0] ? relativeDay(sessions[0].date, true) : '—'}</b><span class="muted small">${sessions[0] ? esc(sessions[0].name) : 'none yet'}</span></div>
      <button class="stat tap" data-act="bw"><span class="k">Bodyweight</span><b>${latestBw ? fmtWeight(latestBw.weightKg) : '—'}</b><span class="muted small">${latestBw ? relativeDay(latestBw.date, true) : 'tap to log'}</span></button>
    </div>

    <div class="section-head"><h2>Templates</h2><a class="btn sm" href="#/templates/new">+ New</a></div>
    ${templates.length ? `<div class="tpl-list">${templates.map(t => `
      <div class="tpl card">
        <button class="tpl-main" data-start="${t.id}">
          <b>${esc(t.name)}</b>
          <span class="muted small">${(t.items || []).length} exercise${(t.items || []).length === 1 ? '' : 's'} · ${lastByTemplate[t.id] ? 'last ' + relativeDay(lastByTemplate[t.id]).toLowerCase() : 'never done'}</span>
          <span class="tpl-ex small">${(t.items || []).slice(0, 4).map(i => esc(get('exercises', i.exerciseId)?.name || '')).filter(Boolean).join(' · ')}${(t.items || []).length > 4 ? ' …' : ''}</span>
        </button>
        <div class="tpl-actions">
          <a class="btn ghost sm" href="#/templates/${t.id}" aria-label="Edit ${esc(t.name)}">Edit</a>
          <button class="btn primary sm" data-start="${t.id}">Start</button>
        </div>
      </div>`).join('')}</div>`
      : emptyState('No templates yet', 'Create a template like “Push Day” with the exercises you usually do.', '<a class="btn primary" href="#/templates/new">Create your first template</a>')}

    <button class="btn block dashed" data-act="empty">Start an empty workout</button>
  </div>`;

  const clock = el.querySelector('[data-clock]');
  const timer = clock ? setInterval(() => (clock.textContent = fmtClock(Date.now() - active.startedAt)), 1000) : null;

  el.addEventListener('click', e => {
    const s = e.target.closest('[data-start]');
    if (s) { startWorkout(s.dataset.start, navigate); return; }
    const a = e.target.closest('[data-act]');
    if (a?.dataset.act === 'empty') startWorkout(null, navigate);
    if (a?.dataset.act === 'bw') quickBodyweight(rerender);
  });
  return () => clearInterval(timer);
}

export function quickBodyweight(after) {
  const unit = getUnit();
  const { el, close } = openSheet(`
    <div class="sheet-head"><h2>Log bodyweight</h2><button class="btn ghost sm" data-close>Cancel</button></div>
    <form class="row gap">
      <input class="input big grow" name="w" inputmode="decimal" placeholder="Weight in ${unit}" required autocomplete="off">
      <button class="btn primary">Save</button>
    </form>`);
  const input = el.querySelector('input');
  setTimeout(() => input.focus(), 250);
  el.querySelector('form').addEventListener('submit', e => {
    e.preventDefault();
    const kg = fromDisplay(input.value, unit);
    if (!kg) { toast('Enter a number'); return; }
    put('bodyweights', { date: Date.now(), weightKg: kg });
    toast('Bodyweight saved');
    close(); after?.();
  });
}
