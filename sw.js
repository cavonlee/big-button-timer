/* 大按键计时器：离线缓存（加桌面后打开就能用，不用等网络）。
   策略：
   · 导航（打开页面 / 从桌面图标启动）：**只从本版本缓存里取** index.html；断网也直接起，
     同时在后台拉一次新的（版本号变了才会换缓存，避免把旧页面一直喂给用户）。
   · 应用外壳（index.html / 字体 / 图标 / manifest / favicon）：cache-first（限本版本缓存）。
   · 其它同源请求：网络优先，失败回缓存。
   ⚠️ 取缓存一定要 `caches.open(CACHE)` 再 match —— 直接 `caches.match()` 会跨所有历史版本缓存命中旧页面。 */
const CACHE = 'timer-cache-v5';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './fonts/DSEG7Classic-Bold.woff2',
  './favicon.ico',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon-180.png',
  './icons/favicon-32.png',
  './icons/favicon-16.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function matchShell(req, fallback) {
  const c = await caches.open(CACHE);
  return (await c.match(req, { ignoreSearch: true })) || (fallback ? await c.match(fallback) : undefined);
}

async function putShell(req, res) {
  if (!res || !res.ok) return;
  const c = await caches.open(CACHE);
  await c.put(req, res.clone()).catch(() => {});
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  const isShell = url.pathname.endsWith('/') || url.pathname.endsWith('/index.html') ||
    url.pathname.includes('/fonts/') || url.pathname.includes('/icons/') ||
    url.pathname.endsWith('/manifest.webmanifest') || url.pathname.endsWith('/favicon.ico');

  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      const hit = await matchShell(req, './index.html');
      /* 后台顺手更新（不阻塞打开）；断网时就是纯缓存。 */
      e.waitUntil?.(fetch(req).then((res) => putShell('./index.html', res)).catch(() => {}));
      if (hit) return hit;
      try { return await fetch(req); } catch (err) { return (await caches.match('./')) || Response.error(); }
    })());
    return;
  }

  if (isShell) {
    e.respondWith((async () => {
      const hit = await matchShell(req);
      if (hit) return hit;
      try {
        const res = await fetch(req);
        putShell(req, res);
        return res;
      } catch (err) {
        return Response.error();
      }
    })());
    return;
  }

  e.respondWith(fetch(req).catch(async () => (await matchShell(req)) || Response.error()));
});
