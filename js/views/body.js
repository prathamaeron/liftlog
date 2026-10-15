// Bodyweight tracking.
import { sortedBodyweights, put, remove, getUnit, toDisplay, fromDisplay, fmtWeight, round1 } from '../store.js';
import { esc, fmtDate, toDateInput, toast } from '../util.js';
import { lineChart } from '../charts.js';
import { unitToggle } from '../ui.js';

const RANGES = [['1m', '1M', 31], ['3m', '3M', 91], ['1y', '1Y', 365], ['all', 'All', null]];
let range = '3m';

export function render(el, _p, { rerender }) {
  const unit = getUnit();
  const all = sortedBodyweights();
  const days = RANGES.find(r => r[0] === range)[2];
  const shown = all.filter(b => !days || b.date >= Date.now() - days * 86400000);
  const latest = all.at(-1);

  const avgSince = d => {
    const xs = all.filter(b => b.date >= Date.now() - d * 86400000);
    return xs.length ? xs.reduce((a, b) => a + b.weightKg, 0) / xs.length : null;
  };
  const ref = (() => { // value ~30 days ago for change
    const target = Date.now() - 30 * 86400000;
    let best = null;
    for (const b of all) if (b.date <= target) best = b;
    return best;
  })();
  const change = latest && ref ? latest.weightKg - ref.weightKg : null;

  el.innerHTML = `<div class="page">
    <header class="hero row between"><h1>Bodyweight</h1>${unitToggle(unit)}</header>
    <form class="card log-bw">
      <div class="row gap">
        <label class="mini grow">Weight (${unit})<input class="input big" name="w" inputmode="decimal" placeholder="${latest ? round1(toDisplay(latest.weightKg, unit)) : '0'}" autocomplete="off" required></label>
        <label class="mini">Date<input class="input" type="date" name="d" value="${toDateInput(Date.now())}"></label>
      </div>
      <button class="btn primary block">Log weight</button>
    </form>
    <div class="pr-grid three">
      <div class="stat"><span class="k">Current</span><b>${latest ? fmtWeight(latest.weightKg) : '—'}</b><span class="muted small">${latest ? fmtDate(latest.date, true) : ''}</span></div>
      <div class="stat"><span class="k">7-day avg</span><b>${avgSince(7) ? fmtWeight(avgSince(7)) : '—'}</b></div>
      <div class="stat"><span class="k">30-day change</span><b class="${change == null ? '' : change <= 0 ? 'neutral' : 'neutral'}">${change == null ? '—' : (change >= 0 ? '+' : '−') + fmtWeight(Math.abs(change))}</b></div>
    </div>
    <div class="card">
      <div class="row end"><div class="seg sm" data-group="range">${RANGES.map(([k, l]) => `<button data-v="${k}" class="${range === k ? 'on' : ''}">${l}</button>`).join('')}</div></div>
      ${lineChart(shown.map(b => ({ x: b.date, y: toDisplay(b.weightKg, unit), label: fmtWeight(b.weightKg) })), { empty: 'Log your weight to see the trend', title: 'Bodyweight' })}
    </div>
    <div class="section-head"><h2>Entries</h2><span class="muted small">${all.length}</span></div>
    <div class="card list">${[...all].reverse().map(b => `
      <div class="list-row"><span>${fmtDate(b.date)}</span><b>${fmtWeight(b.weightKg)}</b><span class="muted small">${fmtWeight(b.weightKg, unit === 'lb' ? 'kg' : 'lb')}</span>
      <button class="icon-btn danger" data-del="${b.id}" aria-label="Delete entry">×</button></div>`).join('') || '<p class="muted pad">No entries yet.</p>'}</div>
  </div>`;

  el.querySelector('form').addEventListener('submit', e => {
    e.preventDefault();
    const f = new FormData(e.target);
    const kg = fromDisplay(f.get('w'), unit);
    if (!kg) { toast('Enter a weight'); return; }
    const d = f.get('d');
    // Use the chosen day; keep the current time if it's today so multiple entries sort sensibly.
    let ts = Date.now();
    if (d && d !== toDateInput(ts)) ts = new Date(d + 'T08:00').getTime();
    put('bodyweights', { date: ts, weightKg: kg });
    toast('Saved');
    rerender();
  });
  el.addEventListener('click', e => {
    const r = e.target.closest('[data-group="range"] [data-v]');
    if (r) { range = r.dataset.v; rerender(); return; }
    const d = e.target.closest('[data-del]');
    if (d && confirm('Delete this entry?')) { remove('bodyweights', d.dataset.del); rerender(); }
  });
}
