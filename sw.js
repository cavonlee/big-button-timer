/* 大按键计时器：离线缓存（加桌面后打开就能用，不用等网络）。
   策略：应用外壳 cache-first（index.html / 字体 / 图标 / manifest），
   其它同源请求走网络、失败回缓存；页面导航失败时回 index.html。 */
const CACHE = 'timer-cache-v2';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './fonts/DSEG7Classic-Bold.woff2',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  const isShell = url.pathname.endsWith('/') || url.pathname.endsWith('/index.html') ||
    url.pathname.includes('/fonts/') || url.pathname.includes('/icons/') ||
    url.pathname.endsWith('/manifest.webmanifest');

  /* 导航请求（打开页面 / 加桌面后启动）：缓存优先，断网也直接起。 */
  if (req.mode === 'navigate') {
    e.respondWith(
      caches.match('./index.html').then((hit) => hit || fetch(req).catch(() => caches.match('./')))
    );
    return;
  }
  if (isShell) {
    e.respondWith(
      caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      }))
    );
    return;
  }
  e.respondWith(
    fetch(req).catch(() => caches.match(req))
  );
});
