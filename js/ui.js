// Shared UI pieces: bottom sheet and exercise picker.
import { esc } from './util.js';
import { sortedExercises, exerciseByName, put } from './store.js';

/** Open a bottom sheet. Returns { el, close }. */
export function openSheet(innerHtml, { onClose } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'sheet-backdrop';
  wrap.innerHTML = `<div class="sheet" role="dialog" aria-modal="true"><div class="sheet-grip"></div>${innerHtml}</div>`;
  document.body.appendChild(wrap);
  document.body.classList.add('no-scroll');
  requestAnimationFrame(() => wrap.classList.add('open'));
  let closed = false;
  const close = () => {
    if (closed) return; closed = true;
    wrap.classList.remove('open');
    document.body.classList.remove('no-scroll');
    setTimeout(() => wrap.remove(), 220);
    document.removeEventListener('keydown', onKey);
    onClose?.();
  };
  const onKey = e => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  wrap.addEventListener('click', e => {
    if (e.target === wrap || e.target.closest('[data-close]')) close();
  });
  return { el: wrap.querySelector('.sheet'), close };
}

/** Let the user pick an exercise or create one. Resolves to an exercise id or null. */
export function pickExercise({ title = 'Add exercise', exclude = [] } = {}) {
  return new Promise(resolve => {
    let done = false;
    const finish = v => { if (!done) { done = true; resolve(v); } };
    const { el, close } = openSheet(`
      <div class="sheet-head"><h2>${esc(title)}</h2><button class="btn ghost sm" data-close>Cancel</button></div>
      <input class="input search" type="search" placeholder="Search or type a new exercise" autocomplete="off" />
      <div class="picker-list"></div>`, { onClose: () => finish(null) });
    const input = el.querySelector('input');
    const listEl = el.querySelector('.picker-list');

    const render = () => {
      const q = input.value.trim().toLowerCase();
      const items = sortedExercises().filter(e => !q || e.name.toLowerCase().includes(q));
      const exact = q && exerciseByName(q);
      let html = '';
      if (q && !exact) {
        html += `<div class="picker-create">
          <div class="muted small">Create “${esc(input.value.trim())}” as</div>
          <div class="row gap">
            <button class="btn primary sm" data-create="weighted">Weighted</button>
            <button class="btn sm" data-create="bodyweight">Bodyweight</button>
          </div></div>`;
      }
      html += items.map(e => `
        <button class="picker-item ${exclude.includes(e.id) ? 'dim' : ''}" data-id="${e.id}">
          <span>${esc(e.name)}</span><span class="tag">${e.type === 'bodyweight' ? 'BW' : ''}</span>
        </button>`).join('');
      if (!items.length && !q) html += `<p class="muted pad">No exercises yet. Type a name above to create one.</p>`;
      listEl.innerHTML = html;
    };
    input.addEventListener('input', render);
    el.addEventListener('click', e => {
      const item = e.target.closest('[data-id]');
      if (item) { finish(item.dataset.id); close(); return; }
      const c = e.target.closest('[data-create]');
      if (c) {
        const ex = put('exercises', { name: input.value.trim(), type: c.dataset.create });
        finish(ex.id); close();
      }
    });
    input.addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      const first = listEl.querySelector('[data-id]');
      const q = input.value.trim();
      const exact = q && exerciseByName(q);
      if (exact) { finish(exact.id); close(); }
      else if (q) { const ex = put('exercises', { name: q, type: 'weighted' }); finish(ex.id); close(); }
      else if (first) { finish(first.dataset.id); close(); }
    });
    render();
    setTimeout(() => input.focus(), 250);
  });
}

/** Simple action menu in a sheet. actions: [{label, value, danger}] */
export function actionMenu(title, actions) {
  return new Promise(resolve => {
    let done = false;
    const finish = v => { if (!done) { done = true; resolve(v); } };
    const { el, close } = openSheet(`
      <div class="sheet-head"><h2>${esc(title)}</h2></div>
      <div class="menu">${actions.map((a, i) => `<button class="menu-item ${a.danger ? 'danger' : ''}" data-i="${i}">${esc(a.label)}</button>`).join('')}
      <button class="menu-item muted" data-close>Cancel</button></div>`, { onClose: () => finish(null) });
    el.addEventListener('click', e => {
      const b = e.target.closest('[data-i]');
      if (b) { finish(actions[+b.dataset.i].value); close(); }
    });
  });
}

export function unitToggle(unit) {
  return `<div class="seg sm unit-toggle" role="group" aria-label="Units">
    <button data-unit="lb" class="${unit === 'lb' ? 'on' : ''}">lb</button>
    <button data-unit="kg" class="${unit === 'kg' ? 'on' : ''}">kg</button></div>`;
}

export function emptyState(title, text, actionHtml = '') {
  return `<div class="empty"><h3>${esc(title)}</h3><p class="muted">${esc(text)}</p>${actionHtml}</div>`;
}
