/* 시드업자산 서비스 워커 — 앱 껍데기만 캐시한다. GitHub 요청은 건드리지 않는다(자료는 앱이 localStorage 에 암호문으로 담아둔다). */
const CACHE = 'sidup-v1.3.0';
const THEMES = ['A', 'B', 'C'];
const SHELL = ['./', 'index.html', 'app.css', 'app.js', 'fonts/Orbit-Regular.woff2',
  ...THEMES.flatMap((k) => [`manifest-${k}.webmanifest`, `icons/${k}/icon-192.png`, `icons/${k}/apple-touch-icon.png`])];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  const isStatic = /\.(woff2|png)$/.test(url.pathname);
  if (isStatic) {
    e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => { const cp = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, cp)); return res; })));
    return;
  }
  e.respondWith(fetch(e.request).then((res) => { if (res.ok) { const cp = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, cp)); } return res; })
    .catch(() => caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || caches.match('index.html'))));
});
