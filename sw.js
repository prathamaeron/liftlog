// Offline support: serve the app from cache, refresh it in the background.
// Bump VERSION whenever you deploy changes so phones pick them up.
const VERSION = 'liftlog-v1';
const SHELL = [
  './', './index.html', './css/styles.css', './manifest.webmanifest',
  './js/app.js', './js/store.js', './js/sync.js', './js/stats.js', './js/charts.js', './js/util.js', './js/ui.js', './js/export.js',
  './js/views/home.js', './js/views/template-edit.js', './js/views/workout.js', './js/views/history.js',
  './js/views/progress.js', './js/views/body.js', './js/views/settings.js',
  './icons/icon.svg', './icons/mark.svg', './icons/icon-192.png', './icons/apple-touch-icon.png',
  './vendor/jspdf.umd.min.js', './vendor/jspdf.plugin.autotable.min.js',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);
  // Never touch GitHub API calls or anything cross-origin.
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  e.respondWith(
    caches.open(VERSION).then(async cache => {
      const cached = await cache.match(req, { ignoreSearch: true });
      const network = fetch(req).then(res => {
        if (res.ok) cache.put(req, res.clone());
        return res;
      }).catch(() => cached);
      return cached || network;
    })
  );
});
