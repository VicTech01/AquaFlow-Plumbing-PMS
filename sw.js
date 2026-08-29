/* AquaFlow PMS — service worker (phone PWA offline support).
   Caches the app shell; sync/data endpoints are always live-network. */
'use strict';
const CACHE = 'aquaflow-shell-v13';
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
  './js/app.js',
  './js/main.js',
  './js/views/dashboard.js',
  './js/views/leads.js',
  './js/views/jobs.js',
  './js/views/dispatch.js',
  './js/views/customers.js',
  './js/views/quotes.js',
  './js/views/invoices.js',
  './js/views/expenses.js',
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
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then(cached => {
      const fetchPromise = fetch(e.request).then(res => {
        if (res && res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      }).catch(() => cached);
      return cached || fetchPromise;
    })
  );
});
