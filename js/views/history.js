// History: every finished workout, grouped by month. Tap to view/edit.
import { finishedSessions, get, getUnit, toDisplay } from '../store.js';
import { esc, fmtDate, fmtDuration, fmtNum } from '../util.js';
import { summarizeSession } from '../stats.js';
import { addPastWorkout, setText } from './workout.js';
import { emptyState } from '../ui.js';
import { isCountedSet } from '../store.js';

export function render(el, _p, { navigate }) {
  const sessions = finishedSessions();
  const unit = getUnit();
  const groups = new Map();
  for (const s of sessions) {
    const key = new Date(s.date).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(s);
  }

  el.innerHTML = `
  <div class="page">
    <header class="hero row between"><h1>History</h1><button class="btn sm" data-act="past">+ Log past workout</button></header>
    ${sessions.length ? [...groups].map(([month, list]) => `
      <div class="section-head"><h2>${esc(month)}</h2><span class="muted small">${list.length} workout${list.length > 1 ? 's' : ''}</span></div>
      <div class="hist-list">${list.map(s => {
        const sum = summarizeSession(s);
        const lines = s.entries.filter(e => e.sets.some(isCountedSet)).map(e => {
          const ex = get('exercises', e.exerciseId);
          return `<div class="hist-ex"><span>${esc(ex?.name || 'Deleted exercise')}</span><span class="muted">${e.sets.filter(isCountedSet).map(x => setText(x, ex?.type === 'bodyweight', unit)).join(', ')}</span></div>`;
        }).join('');
        return `<a class="card hist" href="#/workout/${s.id}">
          <div class="row between"><b>${esc(s.name)}</b><span class="muted small">${fmtDate(s.date)}</span></div>
          <div class="chips small"><span>${fmtDuration(sum.duration)}</span><span>${sum.sets} sets</span><span>${fmtNum(toDisplay(sum.volume, unit))} ${unit}</span></div>
          ${lines}
          ${s.notes ? `<p class="note small">${esc(s.notes)}</p>` : ''}
        </a>`;
      }).join('')}</div>`).join('')
      : emptyState('No workouts yet', 'Finished workouts show up here. You can also log one you did earlier.')}
  </div>`;

  el.addEventListener('click', e => {
    if (e.target.closest('[data-act="past"]')) addPastWorkout(navigate);
  });
}
