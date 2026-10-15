// App shell, router and global wiring.
import { onChange, getUnit, setUnit } from './store.js';
import { initAutoSync, onStatus, getStatus, isConfigured, sync } from './sync.js';
import { initChartInteraction } from './charts.js';
import { relativeDay } from './util.js';

import * as home from './views/home.js';
import * as templateEdit from './views/template-edit.js';
import * as workout from './views/workout.js';
import * as history from './views/history.js';
import * as progress from './views/progress.js';
import * as body from './views/body.js';
import * as settings from './views/settings.js';

const routes = [
  { re: /^$/, view: home, nav: 'train' },
  { re: /^templates\/(new|[\w-]+)$/, view: templateEdit, nav: 'train', keys: ['id'] },
  { re: /^workout\/([\w-]+)$/, view: workout, nav: 'train', keys: ['id'] },
  { re: /^history$/, view: history, nav: 'history' },
  { re: /^progress$/, view: progress, nav: 'progress' },
  { re: /^progress\/(exercise|template)\/([\w-]+)$/, view: progress, nav: 'progress', keys: ['kind', 'id'] },
  { re: /^body$/, view: body, nav: 'body' },
  { re: /^settings$/, view: settings, nav: 'settings' },
];

const viewEl = document.getElementById('view');
let cleanup = null;
let current = null;

export function navigate(path) {
  const target = '#/' + path.replace(/^#?\/?/, '');
  if (location.hash === target) render(); else location.hash = target;
}

function parse() {
  const path = location.hash.replace(/^#\/?/, '').replace(/\/$/, '');
  for (const r of routes) {
    const m = path.match(r.re);
    if (m) {
      const params = {};
      (r.keys || []).forEach((k, i) => (params[k] = m[i + 1]));
      return { route: r, params };
    }
  }
  return { route: routes[0], params: {} };
}

function render({ keepScroll = false } = {}) {
  const { route, params } = parse();
  const scroll = window.scrollY;
  if (typeof cleanup === 'function') cleanup();
  cleanup = null;
  current = { route, params };
  document.querySelectorAll('[data-nav]').forEach(a => a.classList.toggle('active', a.dataset.nav === route.nav));
  // Fresh container per render so view event listeners never pile up.
  const container = document.createElement('div');
  container.className = 'view-root';
  viewEl.replaceChildren(container);
  cleanup = route.view.render(container, params, { navigate, rerender: () => render({ keepScroll: true }) });
  if (keepScroll) window.scrollTo(0, scroll); else window.scrollTo(0, 0);
}

// Re-render when data arrives from another device, unless the user is typing.
onChange(meta => {
  if (meta.source !== 'sync' && meta.source !== 'replace') return;
  const a = document.activeElement;
  if (a && /INPUT|TEXTAREA|SELECT/.test(a.tagName) && viewEl.contains(a)) return;
  render({ keepScroll: true });
});

// Global unit toggles (anywhere on the page).
document.addEventListener('click', e => {
  const b = e.target.closest('.unit-toggle [data-unit]');
  if (!b) return;
  if (b.dataset.unit !== getUnit()) { setUnit(b.dataset.unit); render({ keepScroll: true }); }
});

// Sync indicator in the header.
const syncBtn = document.getElementById('sync-indicator');
function paintSync(s = getStatus()) {
  if (!isConfigured()) { syncBtn.hidden = true; return; }
  syncBtn.hidden = false;
  syncBtn.dataset.state = s.state;
  const label = {
    syncing: 'Syncing…', ok: 'Synced', error: 'Sync error', offline: 'Offline', pending: 'Unsynced', idle: 'Sync',
  }[s.state] || 'Sync';
  syncBtn.querySelector('.label').textContent = label;
  syncBtn.title = s.message + (s.lastSyncAt ? ` · last synced ${relativeDay(s.lastSyncAt).toLowerCase()}` : '');
}
onStatus(paintSync);
syncBtn.addEventListener('click', () => sync());
document.addEventListener('liftlog:sync-config', () => paintSync());

window.addEventListener('hashchange', () => render());

// Charts are drawn to fit the screen width; redraw after a real resize/rotation.
let lastW = window.innerWidth, resizeT = null;
window.addEventListener('resize', () => {
  clearTimeout(resizeT);
  resizeT = setTimeout(() => {
    if (Math.abs(window.innerWidth - lastW) < 40 || !viewEl.querySelector('.chart')) return;
    lastW = window.innerWidth;
    const a = document.activeElement;
    if (a && /INPUT|TEXTAREA|SELECT/.test(a.tagName)) return;
    render({ keepScroll: true });
  }, 250);
});
initChartInteraction(viewEl);
render();
paintSync();
initAutoSync();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('./sw.js').catch(err => console.warn('SW registration failed', err));
}
