// Create / edit a workout template.
import { get, put, remove, list } from '../store.js';
import { esc, toast } from '../util.js';
import { pickExercise } from '../ui.js';

export function render(el, { id }, { navigate }) {
  const isNew = id === 'new';
  const existing = isNew ? null : get('templates', id);
  if (!isNew && !existing) {
    el.innerHTML = `<div class="page"><p class="muted">Template not found.</p><a class="btn" href="#/">Back</a></div>`;
    return;
  }
  // Work on a draft; nothing is saved until "Save".
  const draft = existing ? structuredClone(existing) : { name: '', items: [], archived: false };
  let dirty = false;

  const paint = () => {
    el.innerHTML = `
    <div class="page">
      <div class="page-head">
        <a class="back" href="#/" aria-label="Back">‹</a>
        <h1 class="grow">${isNew ? 'New template' : 'Edit template'}</h1>
      </div>
      <div class="card">
        <label class="lbl" for="tname">Name</label>
        <input id="tname" class="input big" data-f="name" value="${esc(draft.name)}" placeholder="e.g. Push Day" autocomplete="off">
      </div>

      <div class="section-head"><h2>Exercises</h2><span class="muted small">${draft.items.length}</span></div>
      <div class="tpl-items">
        ${draft.items.map((it, i) => {
          const ex = get('exercises', it.exerciseId);
          return `<div class="tpl-item card">
            <div class="tpl-item-head">
              <span class="num">${i + 1}</span>
              <b class="grow">${esc(ex?.name || 'Deleted exercise')}${ex?.type === 'bodyweight' ? ' <span class="tag">BW</span>' : ''}</b>
              <button class="icon-btn" data-act="up" data-i="${i}" ${i === 0 ? 'disabled' : ''} aria-label="Move up">↑</button>
              <button class="icon-btn" data-act="down" data-i="${i}" ${i === draft.items.length - 1 ? 'disabled' : ''} aria-label="Move down">↓</button>
              <button class="icon-btn danger" data-act="rm" data-i="${i}" aria-label="Remove">×</button>
            </div>
            <div class="row gap">
              <label class="mini">Sets<input class="input" data-f="sets" data-i="${i}" inputmode="numeric" value="${it.sets ?? 3}"></label>
              <label class="mini grow">Target reps<input class="input" data-f="reps" data-i="${i}" value="${esc(it.reps ?? '')}" placeholder="e.g. 8-12 or AMRAP"></label>
            </div>
          </div>`;
        }).join('') || '<p class="muted pad">Add the exercises for this workout, in order.</p>'}
      </div>
      <button class="btn block dashed" data-act="add">+ Add exercise</button>

      <div class="row gap end sticky-actions">
        ${!isNew ? `<button class="btn ghost danger" data-act="delete">Delete</button>
          <button class="btn ghost" data-act="dup">Duplicate</button>` : ''}
        <button class="btn primary" data-act="save">Save</button>
      </div>
    </div>`;
  };
  paint();

  el.addEventListener('input', e => {
    const t = e.target, f = t.dataset.f;
    if (!f) return;
    dirty = true;
    if (f === 'name') draft.name = t.value;
    if (f === 'sets') draft.items[+t.dataset.i].sets = Math.max(1, Math.min(20, parseInt(t.value, 10) || 1));
    if (f === 'reps') draft.items[+t.dataset.i].reps = t.value.trim();
  });

  el.addEventListener('click', async e => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const i = +b.dataset.i;
    const a = b.dataset.act;
    if (a === 'add') {
      const exId = await pickExercise({ exclude: draft.items.map(x => x.exerciseId) });
      if (exId) { draft.items.push({ exerciseId: exId, sets: 3, reps: '' }); dirty = true; paint(); }
    }
    if (a === 'up' && i > 0) { [draft.items[i - 1], draft.items[i]] = [draft.items[i], draft.items[i - 1]]; dirty = true; paint(); }
    if (a === 'down' && i < draft.items.length - 1) { [draft.items[i + 1], draft.items[i]] = [draft.items[i], draft.items[i + 1]]; dirty = true; paint(); }
    if (a === 'rm') { draft.items.splice(i, 1); dirty = true; paint(); }
    if (a === 'save') {
      if (!draft.name.trim()) { toast('Give the template a name'); el.querySelector('#tname').focus(); return; }
      if (isNew) draft.order = list('templates').length;
      draft.name = draft.name.trim();
      put('templates', draft);
      dirty = false;
      toast('Template saved');
      navigate('');
    }
    if (a === 'dup') {
      const copy = put('templates', { ...structuredClone(draft), id: undefined, createdAt: undefined, name: `${draft.name} (copy)`, order: list('templates').length });
      navigate(`templates/${copy.id}`);
    }
    if (a === 'delete') {
      if (!confirm(`Delete “${draft.name}”? Past workouts from it are kept.`)) return;
      remove('templates', id);
      navigate('');
    }
  });

  const guard = e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
  window.addEventListener('beforeunload', guard);
  return () => window.removeEventListener('beforeunload', guard);
}
