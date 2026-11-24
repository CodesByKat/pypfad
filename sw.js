// Service Worker: macht die App offline-faehig.
// App-Dateien: sofort aus dem Cache, im Hintergrund aktualisieren.
// Python (Pyodide) und Bibliotheken: einmal laden, dann dauerhaft aus dem Cache.
const VERSION = 'v1';
const APP_CACHE = 'pypfad-app-' + VERSION;
const PY_CACHE = 'pypfad-pyodide';
const SHELL = [
  './', 'index.html', 'manifest.webmanifest', 'css/style.css',
  'js/app.js', 'js/util.js', 'js/progress.js', 'js/python.js', 'js/py-worker.js', 'js/runner.py',
  'js/exercises.js', 'js/editor.js', 'data/course.json',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(APP_CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('pypfad-app-') && k !== APP_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function cacheFirst(req) {
  const cache = await caches.open(PY_CACHE);
  const hit = await cache.match(req, { ignoreVary: true });
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
  return res;
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(APP_CACHE);
  const hit = await cache.match(req, { ignoreSearch: true });
  const net = fetch(req).then((res) => {
    if (res.ok) cache.put(req, res.clone());
    return res;
  }).catch(() => null);
  if (hit) return hit;
  const res = await net;
  if (res) return res;
  if (req.mode === 'navigate') return cache.match('index.html');
  return new Response('offline', { status: 503 });
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.hostname === 'cdn.jsdelivr.net' && url.pathname.startsWith('/pyodide/')) {
    e.respondWith(cacheFirst(req));
  } else if (url.origin === location.origin) {
    e.respondWith(staleWhileRevalidate(req));
  }
});
