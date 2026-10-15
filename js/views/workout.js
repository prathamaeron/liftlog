// Workout logging (active) and editing of past workouts.
import {
  get, put, remove, uid, now, getUnit, toDisplay, fromDisplay, round1, fmtWeight, otherUnit,
  lastEntryFor, isCountedSet, activeSession,
} from '../store.js';
import { esc, fmtClock, fmtDuration, fmtDate, toLocalInput, toast, fmtNum } from '../util.js';
import { pickExercise, actionMenu, openSheet, unitToggle } from '../ui.js';
import { summarizeSession, sessionPRs } from '../stats.js';

// ---------- creating sessions ----------

function setsFromLast(exerciseId, count, beforeDate = Infinity) {
  const last = lastEntryFor(exerciseId, beforeDate);
  const prev = last ? last.entry.sets.filter(isCountedSet) : [];
  const n = count || prev.length || 3;
  const sets = [];
  for (let i = 0; i < n; i++) {
    const p = prev[i] || prev[prev.length - 1];
    sets.push({ weightKg: p ? p.weightKg ?? null : null, reps: p ? p.reps : null, done: false });
  }
  return sets;
}

export function newEntry(exerciseId, { sets, target } = {}) {
  return { id: uid(), exerciseId, target: target || '', sets: setsFromLast(exerciseId, sets) };
}

/** Start a workout from a template (or empty if templateId is null). Returns the session. */
export function startWorkout(templateId, navigate) {
  const existing = activeSession();
  if (existing) {
    if (!confirm(`You already have a workout in progress (“${existing.name}”). Discard it and start a new one?`)) {
      navigate(`workout/${existing.id}`);
      return existing;
    }
    remove('sessions', existing.id);
  }
  const t = templateId ? get('templates', templateId) : null;
  const ts = now();
  const session = put('sessions', {
    templateId: t?.id || null,
    name: t?.name || 'Workout',
    date: ts, startedAt: ts, finishedAt: null, notes: '',
    entries: (t?.items || []).filter(i => get('exercises', i.exerciseId))
      .map(i => newEntry(i.exerciseId, { sets: i.sets, target: i.reps ? `${i.sets || ''}×${i.reps}` : '' })),
  });
  navigate(`workout/${session.id}`);
  return session;
}

/** Create an empty, already-finished workout for back-filling history. */
export function addPastWorkout(navigate) {
  const ts = now();
  const s = put('sessions', { templateId: null, name: 'Workout', date: ts, startedAt: ts, finishedAt: ts + 3600000, notes: '', entries: [] });
  navigate(`workout/${s.id}`);
}

// ---------- view ----------

let restStart = null; // shared across re-renders while a workout is open

export function render(el, { id }, { navigate, rerender }) {
  let session = get('sessions', id);
  if (!session) {
    el.innerHTML = `<div class="page"><p class="muted">This workout no longer exists.</p><a class="btn" href="#/">Back</a></div>`;
    return;
  }
  const active = !session.finishedAt;
  const unit = getUnit();
  const save = () => { session = put('sessions', session); };

  el.innerHTML = `
  <div class="page workout ${active ? 'is-active' : ''}">
    <div class="page-head">
      <a class="back" href="${active ? '#/' : '#/history'}" aria-label="Back">‹</a>
      <input class="title-input" data-f="name" value="${esc(session.name)}" aria-label="Workout name" />
      ${unitToggle(unit)}
    </div>
    ${active ? `<div class="live-bar"><span class="dot-live"></span><span>Started ${new Date(session.startedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span><b class="clock" data-clock>${fmtClock(now() - session.startedAt)}</b></div>`
      : `<div class="card meta-edit">
          <label>Date & start time<input class="input" type="datetime-local" data-f="date" value="${toLocalInput(session.date)}"></label>
          <label>Duration (min)<input class="input" type="number" inputmode="numeric" min="0" data-f="duration" value="${Math.round((session.finishedAt - session.startedAt) / 60000)}"></label>
        </div>`}

    <div class="entries">
      ${session.entries.map((e, ei) => entryHtml(e, ei, session, unit)).join('') ||
        `<div class="empty small"><p class="muted">No exercises yet.</p></div>`}
    </div>

    <button class="btn block dashed" data-act="add-ex">+ Add exercise</button>

    <div class="card">
      <label class="lbl" for="notes">Session notes</label>
      <textarea id="notes" class="input" rows="3" data-f="notes" placeholder="How did it feel? Sleep, energy, anything to remember…">${esc(session.notes || '')}</textarea>
    </div>

    ${active ? `
      <div class="finish-bar">
        <button class="btn ghost danger" data-act="discard">Discard</button>
        <button class="btn primary grow" data-act="finish">Finish workout</button>
      </div>` : `
      <div class="row gap end">
        <button class="btn ghost danger" data-act="delete">Delete workout</button>
        <a class="btn primary" href="#/history">Done</a>
      </div>`}
  </div>
  ${active ? `<button class="rest-pill" data-act="rest" ${restStart ? '' : 'hidden'}>Rest <b data-rest>${restStart ? fmtClock(now() - restStart) : '0:00'}</b><span class="x">×</span></button>` : ''}`;

  // ----- timers -----
  let timer = null;
  if (active) {
    timer = setInterval(() => {
      const c = el.querySelector('[data-clock]');
      if (c) c.textContent = fmtClock(now() - session.startedAt);
      const r = el.querySelector('[data-rest]');
      if (r && restStart) r.textContent = fmtClock(now() - restStart);
    }, 1000);
  }

  // ----- input handling (no re-render, keeps focus) -----
  el.addEventListener('input', e => {
    const t = e.target;
    const f = t.dataset.f;
    if (!f) return;
    if (f === 'name') { session.name = t.value; save(); return; }
    if (f === 'notes') { session.notes = t.value; save(); return; }
    if (f === 'w' || f === 'r') {
      const set = session.entries[+t.dataset.e].sets[+t.dataset.s];
      if (f === 'w') {
        set.weightKg = fromDisplay(t.value, unit);
        const conv = t.parentElement.querySelector('.conv');
        if (conv) conv.textContent = set.weightKg ? `${fmtWeight(set.weightKg, otherUnit(unit))}` : '';
      } else {
        const n = parseInt(t.value, 10);
        set.reps = isNaN(n) ? null : n;
      }
      save();
    }
  });
  el.addEventListener('change', e => {
    const t = e.target;
    if (t.dataset.f === 'date') {
      const ts = new Date(t.value).getTime();
      if (!isNaN(ts)) {
        const dur = session.finishedAt - session.startedAt;
        session.date = ts; session.startedAt = ts; session.finishedAt = ts + dur; save();
      }
    }
    if (t.dataset.f === 'duration') {
      const m = Math.max(0, parseInt(t.value, 10) || 0);
      session.finishedAt = session.startedAt + m * 60000; save();
    }
  });
  // Select the whole number on focus so it's quick to overwrite on a phone.
  el.addEventListener('focusin', e => { if (e.target.matches('.set-input')) setTimeout(() => e.target.select(), 0); });

  // ----- clicks -----
  el.addEventListener('click', async e => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const ei = b.dataset.e != null ? +b.dataset.e : null;
    const act = b.dataset.act;

    if (act === 'done') {
      const set = session.entries[ei].sets[+b.dataset.s];
      if (!set.done && !(set.reps > 0)) {
        el.querySelector(`[data-f="r"][data-e="${ei}"][data-s="${b.dataset.s}"]`)?.focus();
        toast('Enter reps first');
        return;
      }
      set.done = !set.done;
      save();
      if (set.done && active) { restStart = now(); }
      const row = b.closest('.set-row');
      row.classList.toggle('done', set.done);
      b.setAttribute('aria-pressed', set.done);
      const pill = el.querySelector('.rest-pill');
      if (pill && set.done) { pill.hidden = false; pill.querySelector('[data-rest]').textContent = '0:00'; }
      if (navigator.vibrate && set.done) navigator.vibrate(15);
      return;
    }
    if (act === 'rest') { restStart = null; b.hidden = true; return; }
    if (act === 'add-set') {
      const sets = session.entries[ei].sets;
      const p = sets[sets.length - 1];
      sets.push({ weightKg: p?.weightKg ?? null, reps: p?.reps ?? null, done: false });
      save(); rerender(); return;
    }
    if (act === 'del-set') {
      const sets = session.entries[ei].sets;
      if (sets.length) { sets.pop(); save(); rerender(); }
      return;
    }
    if (act === 'add-ex') {
      const exId = await pickExercise({ exclude: session.entries.map(x => x.exerciseId) });
      if (!exId) return;
      const entry = newEntry(exId);
      if (!active) entry.sets = setsFromLast(exId, null, session.date);
      session.entries.push(entry);
      save(); rerender();
      setTimeout(() => el.querySelector('.entry:last-child')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
      return;
    }
    if (act === 'ex-menu') {
      const entry = session.entries[ei];
      const ex = get('exercises', entry.exerciseId);
      const choice = await actionMenu(ex?.name || 'Exercise', [
        ...(ei > 0 ? [{ label: 'Move up', value: 'up' }] : []),
        ...(ei < session.entries.length - 1 ? [{ label: 'Move down', value: 'down' }] : []),
        { label: 'Swap exercise', value: 'swap' },
        { label: 'View progress', value: 'progress' },
        { label: 'Remove exercise', value: 'remove', danger: true },
      ]);
      if (!choice) return;
      const arr = session.entries;
      if (choice === 'up') [arr[ei - 1], arr[ei]] = [arr[ei], arr[ei - 1]];
      if (choice === 'down') [arr[ei + 1], arr[ei]] = [arr[ei], arr[ei + 1]];
      if (choice === 'remove') {
        if (entry.sets.some(isCountedSet) && !confirm('Remove this exercise and its logged sets?')) return;
        arr.splice(ei, 1);
      }
      if (choice === 'swap') {
        const exId = await pickExercise({ title: 'Swap for…' });
        if (!exId) return;
        entry.exerciseId = exId;
        if (!entry.sets.some(s => s.done)) entry.sets = setsFromLast(exId, entry.sets.length, active ? Infinity : session.date);
      }
      if (choice === 'progress') { navigate(`progress/exercise/${entry.exerciseId}`); return; }
      save(); rerender(); return;
    }
    if (act === 'discard') {
      if (!confirm('Discard this workout? Nothing from it will be saved.')) return;
      remove('sessions', session.id); restStart = null;
      navigate(''); return;
    }
    if (act === 'delete') {
      if (!confirm('Delete this workout permanently?')) return;
      remove('sessions', session.id);
      navigate('history'); return;
    }
    if (act === 'finish') finish();
  });

  function finish() {
    const filled = [];
    session.entries.forEach(en => en.sets.forEach(s => { if (!s.done && s.reps > 0) filled.push(s); }));
    if (filled.length && confirm(`${filled.length} set${filled.length > 1 ? 's are' : ' is'} filled in but not checked off. Count ${filled.length > 1 ? 'them' : 'it'} as done?`)) {
      filled.forEach(s => (s.done = true));
    }
    const counted = session.entries.reduce((n, en) => n + en.sets.filter(isCountedSet).length, 0);
    if (!counted && !confirm('No sets were completed. Finish anyway?')) return;
    session.finishedAt = now();
    save();
    restStart = null;
    showSummary(session, navigate);
  }

  return () => clearInterval(timer);
}

function entryHtml(entry, ei, session, unit) {
  const ex = get('exercises', entry.exerciseId);
  const bw = ex?.type === 'bodyweight';
  const last = lastEntryFor(entry.exerciseId, session.finishedAt ? session.date : Infinity, session.id);
  const lastText = last ? last.entry.sets.filter(isCountedSet).map(s => setText(s, bw, unit)).join(' · ') : '';
  const weightLabel = bw ? `+${unit}` : unit;

  return `<section class="entry card">
    <div class="entry-head">
      <div>
        <h3>${esc(ex?.name || 'Deleted exercise')}${bw ? ' <span class="tag">BW</span>' : ''}</h3>
        ${entry.target ? `<span class="muted small">Target ${esc(entry.target)}</span>` : ''}
      </div>
      <button class="icon-btn" data-act="ex-menu" data-e="${ei}" aria-label="Exercise options">⋯</button>
    </div>
    ${lastText ? `<div class="last small"><span class="muted">Last (${fmtDate(last.session.date, true)}):</span> ${esc(lastText)}</div>` : ''}
    <div class="set-grid">
      <div class="set-row head"><span>Set</span><span>${weightLabel}</span><span>Reps</span><span></span></div>
      ${entry.sets.map((s, si) => `
      <div class="set-row ${s.done ? 'done' : ''}">
        <span class="set-n">${si + 1}</span>
        <span class="cell">
          <input class="set-input" data-f="w" data-e="${ei}" data-s="${si}" inputmode="decimal" enterkeyhint="next"
            value="${s.weightKg != null ? round1(toDisplay(s.weightKg, unit)) : ''}" placeholder="${bw ? '0' : '—'}" aria-label="Weight set ${si + 1}">
          <span class="conv">${s.weightKg ? fmtWeight(s.weightKg, otherUnit(unit)) : ''}</span>
        </span>
        <span class="cell">
          <input class="set-input" data-f="r" data-e="${ei}" data-s="${si}" inputmode="numeric" pattern="[0-9]*" enterkeyhint="done"
            value="${s.reps ?? ''}" placeholder="—" aria-label="Reps set ${si + 1}">
        </span>
        <button class="check" data-act="done" data-e="${ei}" data-s="${si}" aria-pressed="${!!s.done}" aria-label="Mark set ${si + 1} done">✓</button>
      </div>`).join('')}
    </div>
    <div class="row gap entry-foot">
      <button class="btn sm ghost" data-act="del-set" data-e="${ei}" ${entry.sets.length ? '' : 'disabled'}>− Set</button>
      <button class="btn sm" data-act="add-set" data-e="${ei}">+ Add set</button>
    </div>
  </section>`;
}

export function setText(s, bw, unit = getUnit()) {
  if (bw) return s.weightKg ? `+${round1(toDisplay(s.weightKg, unit))}×${s.reps}` : `${s.reps} reps`;
  return `${round1(toDisplay(s.weightKg || 0, unit))}×${s.reps}`;
}

function showSummary(session, navigate) {
  const sum = summarizeSession(session);
  const prs = sessionPRs(session);
  const unit = getUnit();
  const t = session.templateId ? get('templates', session.templateId) : null;
  const differs = t && templateDiffers(t, session);
  const { el, close } = openSheet(`
    <div class="summary">
      <div class="summary-badge">✓</div>
      <h2>Workout complete</h2>
      <p class="muted">${esc(session.name)} · ${fmtDuration(sum.duration)}</p>
      <div class="stat-row">
        <div><b>${sum.exercises}</b><span>exercises</span></div>
        <div><b>${sum.sets}</b><span>sets</span></div>
        <div><b>${fmtNum(toDisplay(sum.volume, unit))}</b><span>${unit} volume</span></div>
      </div>
      ${prs.length ? `<div class="prs"><h3>New personal records</h3>${prs.map(p => `<div class="pr-line">🏆 <b>${esc(p.exercise.name)}</b> ${p.kind === 'reps' ? `${p.value} reps` : p.kind === 'weight' ? `${fmtWeight(p.value)} top set` : `${fmtWeight(p.value)} est. 1RM`}</div>`).join('')}</div>` : ''}
      ${differs ? `<button class="btn block" data-upd>Update “${esc(t.name)}” template to match this workout</button>` : ''}
      <button class="btn primary block" data-close>Done</button>
    </div>`, { onClose: () => navigate('') });
  el.querySelector('[data-upd]')?.addEventListener('click', ev => {
    const oldReps = Object.fromEntries((t.items || []).map(i => [i.exerciseId, i.reps]));
    put('templates', { ...t, items: session.entries.map(e => ({ exerciseId: e.exerciseId, sets: e.sets.length, reps: oldReps[e.exerciseId] || '' })) });
    ev.target.textContent = 'Template updated ✓';
    ev.target.disabled = true;
  });
}

function templateDiffers(t, session) {
  const a = (t.items || []).map(i => `${i.exerciseId}:${i.sets}`).join(',');
  const b = session.entries.map(e => `${e.exerciseId}:${e.sets.length}`).join(',');
  return a !== b;
}
