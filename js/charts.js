// Tiny dependency-free SVG line chart with tap/hover readout.
import { esc, fmtDate } from './util.js';

const H = 220, PL = 46, PR = 14, PT = 16, PB = 28;
// Match the viewBox to the on-screen width so text and strokes aren't distorted.
function chartWidth() {
  const vw = window.innerWidth;
  const content = vw >= 900 ? Math.min(760, vw - 220) : Math.min(760, vw);
  return Math.max(280, Math.round(content - 32 - 30));
}

function niceTicks(min, max, count = 4) {
  if (min === max) { const pad = Math.abs(min) * 0.1 || 1; min -= pad; max += pad; }
  const span = max - min;
  const step0 = span / count;
  const mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const norm = step0 / mag;
  const step = (norm >= 5 ? 10 : norm >= 2 ? 5 : norm >= 1 ? 2 : 1) * mag;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(+v.toFixed(6));
  return { lo, hi, ticks };
}

function fmtTick(v) {
  if (Math.abs(v) >= 10000) return (v / 1000).toFixed(0) + 'k';
  if (Math.abs(v) >= 1000) return (v / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

/**
 * points: [{ x: timestamp, y: number, label?: string }]
 * opts: { suffix: 'lb', empty: 'text' }
 */
export function lineChart(points, opts = {}) {
  const W = chartWidth();
  points = points.filter(p => p.y != null && !isNaN(p.y)).sort((a, b) => a.x - b.x);
  if (!points.length) return `<div class="chart-empty">${esc(opts.empty || 'No data yet')}</div>`;

  const xs = points.map(p => p.x), ys = points.map(p => p.y);
  let xMin = Math.min(...xs), xMax = Math.max(...xs);
  if (xMin === xMax) { xMin -= 86400000 * 3; xMax += 86400000 * 3; }
  const { lo, hi, ticks } = niceTicks(Math.min(...ys), Math.max(...ys));
  const sx = x => PL + ((x - xMin) / (xMax - xMin)) * (W - PL - PR);
  const sy = y => PT + (1 - (y - lo) / (hi - lo || 1)) * (H - PT - PB);

  const coords = points.map(p => [sx(p.x), sy(p.y)]);
  const path = coords.map((c, i) => `${i ? 'L' : 'M'}${c[0].toFixed(1)},${c[1].toFixed(1)}`).join('');
  const area = `${path}L${coords.at(-1)[0].toFixed(1)},${H - PB}L${coords[0][0].toFixed(1)},${H - PB}Z`;
  const gid = 'g' + Math.random().toString(36).slice(2, 8);

  const grid = ticks.map(t => `
    <line x1="${PL}" x2="${W - PR}" y1="${sy(t)}" y2="${sy(t)}" class="c-grid"/>
    <text x="${PL - 8}" y="${sy(t) + 4}" class="c-tick" text-anchor="end">${fmtTick(t)}</text>`).join('');

  // up to 4 date labels on the x axis
  const n = Math.min(4, points.length);
  const xLabels = [];
  for (let i = 0; i < n; i++) {
    const p = points[Math.round(i * (points.length - 1) / Math.max(1, n - 1))];
    const anchor = i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle';
    xLabels.push(`<text x="${sx(p.x)}" y="${H - 8}" class="c-tick" text-anchor="${anchor}">${esc(fmtDate(p.x, true))}</text>`);
  }

  const dots = points.length <= 60
    ? coords.map(c => `<circle cx="${c[0]}" cy="${c[1]}" r="3.5" class="c-dot"/>`).join('') : '';
  const last = coords.at(-1);

  const payload = esc(JSON.stringify(points.map((p, i) => ({ cx: coords[i][0], cy: coords[i][1], d: fmtDate(p.x), v: p.label ?? fmtTick(p.y) + (opts.suffix ? ' ' + opts.suffix : '') }))));

  return `<div class="chart" data-w="${W}" data-points="${payload}">
  <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${esc(opts.title || 'chart')}">
    <defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="var(--accent)" stop-opacity="0.28"/>
      <stop offset="100%" stop-color="var(--accent)" stop-opacity="0"/></linearGradient></defs>
    ${grid}
    <path d="${area}" fill="url(#${gid})"/>
    <path d="${path}" class="c-line"/>
    ${dots}
    <circle cx="${last[0]}" cy="${last[1]}" r="5.5" class="c-last"/>
    <line class="c-cursor" x1="0" x2="0" y1="${PT}" y2="${H - PB}" style="display:none"/>
    <circle class="c-hover" r="6" style="display:none"/>
    ${xLabels.join('')}
  </svg>
  <div class="c-tip" hidden></div>
</div>`;
}

/** Delegated interaction for every chart on the page. */
export function initChartInteraction(root) {
  const handle = ev => {
    const chart = ev.target.closest?.('.chart');
    if (!chart) return;
    const svg = chart.querySelector('svg');
    const pts = JSON.parse(chart.dataset.points);
    const rect = svg.getBoundingClientRect();
    const W = +chart.dataset.w;
    const x = ((ev.clientX - rect.left) / rect.width) * W;
    let best = pts[0];
    for (const p of pts) if (Math.abs(p.cx - x) < Math.abs(best.cx - x)) best = p;
    const cursor = svg.querySelector('.c-cursor'), dot = svg.querySelector('.c-hover');
    cursor.setAttribute('x1', best.cx); cursor.setAttribute('x2', best.cx); cursor.style.display = '';
    dot.setAttribute('cx', best.cx); dot.setAttribute('cy', best.cy); dot.style.display = '';
    const tip = chart.querySelector('.c-tip');
    tip.innerHTML = `<b>${esc(best.v)}</b><span>${esc(best.d)}</span>`;
    tip.hidden = false;
    const left = (best.cx / W) * rect.width;
    tip.style.left = Math.min(Math.max(left, 60), rect.width - 60) + 'px';
  };
  root.addEventListener('pointermove', handle);
  root.addEventListener('pointerdown', handle);
  root.addEventListener('pointerleave', ev => {
    root.querySelectorAll('.chart').forEach(c => {
      c.querySelector('.c-tip').hidden = true;
      c.querySelectorAll('.c-cursor,.c-hover').forEach(el => (el.style.display = 'none'));
    });
  }, true);
}
