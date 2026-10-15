// Progress calculations for exercises, templates and bodyweight.
import { finishedSessions, isCountedSet, get } from './store.js';

/** Epley estimated one-rep max. */
export function e1rm(weightKg, reps) {
  if (!weightKg || !reps) return 0;
  if (reps === 1) return weightKg;
  return weightKg * (1 + reps / 30);
}

/** Per-session summary for one exercise. */
export function summarizeEntry(entry, exerciseType) {
  const sets = entry.sets.filter(isCountedSet);
  if (!sets.length) return null;
  const s = { sets: sets.length, reps: 0, volume: 0, topWeight: 0, bestE1rm: 0, maxReps: 0, bestSet: null };
  for (const set of sets) {
    const w = set.weightKg || 0;
    s.reps += set.reps;
    s.volume += w * set.reps;
    s.maxReps = Math.max(s.maxReps, set.reps);
    if (w > s.topWeight || (w === s.topWeight && (!s.bestSet || set.reps > s.bestSet.reps))) {
      s.topWeight = w;
      s.bestSet = set;
    }
    s.bestE1rm = Math.max(s.bestE1rm, e1rm(w, set.reps));
  }
  if (exerciseType === 'bodyweight' && s.topWeight === 0) {
    // For pure bodyweight work, the "best set" is the one with most reps.
    s.bestSet = sets.reduce((a, b) => (b.reps > a.reps ? b : a));
  }
  return s;
}

/** Chronological history of an exercise across all finished sessions. */
export function exerciseHistory(exerciseId) {
  const ex = get('exercises', exerciseId);
  const type = ex?.type || 'weighted';
  const rows = [];
  for (const session of finishedSessions()) {
    for (const entry of session.entries) {
      if (entry.exerciseId !== exerciseId) continue;
      const sum = summarizeEntry(entry, type);
      if (sum) rows.push({ session, entry, ...sum });
    }
  }
  return rows.sort((a, b) => a.session.date - b.session.date);
}

/** Personal records for an exercise. */
export function exercisePRs(history) {
  const pr = { topWeight: null, bestE1rm: null, volume: null, maxReps: null, reps: null };
  for (const h of history) {
    if (!pr.topWeight || h.topWeight > pr.topWeight.value) pr.topWeight = { value: h.topWeight, set: h.bestSet, date: h.session.date };
    if (!pr.bestE1rm || h.bestE1rm > pr.bestE1rm.value) pr.bestE1rm = { value: h.bestE1rm, date: h.session.date };
    if (!pr.volume || h.volume > pr.volume.value) pr.volume = { value: h.volume, date: h.session.date };
    if (!pr.maxReps || h.maxReps > pr.maxReps.value) pr.maxReps = { value: h.maxReps, date: h.session.date };
    if (!pr.reps || h.reps > pr.reps.value) pr.reps = { value: h.reps, date: h.session.date };
  }
  return pr;
}

/** Totals for an entire session. */
export function summarizeSession(session) {
  let sets = 0, reps = 0, volume = 0;
  for (const entry of session.entries) {
    for (const set of entry.sets) {
      if (!isCountedSet(set)) continue;
      sets++; reps += set.reps; volume += (set.weightKg || 0) * set.reps;
    }
  }
  const duration = session.finishedAt && session.startedAt ? session.finishedAt - session.startedAt : null;
  return { sets, reps, volume, duration, exercises: session.entries.filter(e => e.sets.some(isCountedSet)).length };
}

export function templateHistory(templateId) {
  return finishedSessions()
    .filter(s => s.templateId === templateId)
    .map(s => ({ session: s, ...summarizeSession(s) }))
    .sort((a, b) => a.session.date - b.session.date);
}

/** PRs set in a given session (compared against all earlier sessions). */
export function sessionPRs(session) {
  const prs = [];
  for (const entry of session.entries) {
    const ex = get('exercises', entry.exerciseId);
    if (!ex) continue;
    const cur = summarizeEntry(entry, ex.type);
    if (!cur) continue;
    const prior = exerciseHistory(entry.exerciseId).filter(h => h.session.date < session.date);
    if (!prior.length) continue;
    const best = exercisePRs(prior);
    if (ex.type === 'bodyweight' && cur.topWeight === 0) {
      if (cur.maxReps > best.maxReps.value) prs.push({ exercise: ex, kind: 'reps', value: cur.maxReps });
    } else {
      if (cur.topWeight > best.topWeight.value + 1e-6) prs.push({ exercise: ex, kind: 'weight', value: cur.topWeight });
      else if (cur.bestE1rm > best.bestE1rm.value + 1e-6) prs.push({ exercise: ex, kind: 'e1rm', value: cur.bestE1rm });
    }
  }
  return prs;
}

export function weekStart(ts) {
  const d = new Date(ts);
  const day = (d.getDay() + 6) % 7; // Monday = 0
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - day);
  return d.getTime();
}

export function workoutsThisWeek() {
  const start = weekStart(Date.now());
  return finishedSessions().filter(s => s.date >= start).length;
}
