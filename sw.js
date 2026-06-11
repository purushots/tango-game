/* Tango service worker — network-first with cache fallback, versioned, all
 * paths relative so the app works under a GitHub Pages subpath
 * (e.g. /tango-game/). Network-first means deploys reach users on next load
 * while the cache keeps the app fully playable offline. */
'use strict';

const CACHE = 'tango-v2';
const ASSETS = [
  './',
  './index.html',
  './css/styles.css',
  './js/engine.js',
  './js/app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      // cache: 'reload' bypasses the HTTP cache so a new SW never pins
      // stale files served under GitHub Pages' max-age.
      .then((cache) => cache.addAll(ASSETS.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        if (res.ok && new URL(event.request.url).origin === self.location.origin) {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});
