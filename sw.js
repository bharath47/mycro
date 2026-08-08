// Service worker: cache the app shell so mycro installs and works offline.
// Bump CACHE whenever app files change so clients pick up the update.
const CACHE = 'mycro-v2';
const ASSETS = [
  './',
  './index.html',
  './css/styles.css',
  './js/app.js',
  './js/vault.js',
  './vendor/argon2.umd.min.js',
  './assets/logo.svg',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './manifest.webmanifest',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return; // let cross-origin (vault URLs) pass through
  // Network-first so updates arrive immediately; cache is the offline fallback.
  e.respondWith(
    fetch(e.request)
      .then((resp) => {
        const copy = resp.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        return resp;
      })
      .catch(() => caches.match(e.request))
  );
});
