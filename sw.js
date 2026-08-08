// Service worker: cache the app shell so mycro installs and works offline.
const CACHE = 'mycro-v1';
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
  if (e.request.method !== 'GET') return; // don't touch anything but reads
  // Cache-first for the app shell; everything else (e.g. a vault URL) passes through.
  e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request)));
});
