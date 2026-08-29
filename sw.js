/* AquaFlow PMS — service worker (phone PWA offline support).
   v15 — FIX: navigation requests are network-first so a new deployment reaches
   returning users immediately; the cache version is bumped on every change to
   the shell so stale installs self-heal on the next load.
   Sync/API traffic is never cached — it is live data. */
'use strict';
const CACHE = 'aquaflow-shell-v15';
const SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './css/styles.css',
  './js/utils.js',
  './js/seed.js',
  './js/sync.js',
  './js/auth.js',
  './js/app.js',
  './js/pdf.js',
  './js/main.js',
  './js/views/dashboard.js',
  './js/views/leads.js',
  './js/views/jobs.js',
  './js/views/dispatch.js',
  './js/views/customers.js',
  './js/views/quotes.js',
  './js/views/invoices.js',
  './js/views/expenses.js',
  './js/views/reports.js',
  './js/views/inventory.js',
  './js/views/maintenance.js',
  './js/views/whatsapp.js',
  './js/views/sync.js',
  './js/views/settings.js'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  // sync + API traffic is never cached — it's live data
  if (url.pathname.startsWith('/api/')) return;
  if (url.origin !== self.location.origin) return;

  // Page navigation: network-first, update the cache, fall back to the cached
  // shell when offline. This guarantees deploys are picked up on the next load.
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request).then(res => {
        if (res && res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put('./index.html', clone)).catch(() => {});
        }
        return res;
      }).catch(() => caches.match(e.request).then(c => c || caches.match('./index.html')))
    );
    return;
  }

  // Static assets: cache-first with background refresh.
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then(cached => {
      const refresh = fetch(e.request).then(res => {
        if (res && res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone)).catch(() => {});
        }
        return res;
      }).catch(() => cached);
      return cached || refresh;
    })
  );
});
