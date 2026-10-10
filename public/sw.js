// Service Worker：仅缓存静态资源（cache-first），页面导航始终走网络（SSR）
// 版本策略：预缓存清单与模板引用（app.js 的 STATIC_VER）共用同一版本号，
// 改 public/ 下任何静态文件后：升 CACHE 版本 + ASSETS 里的 ?v= + app.js 的 STATIC_VER
const CACHE = 'mystuff-v2';
const ASSETS = [
  '/css/style.css?v=2',
  '/js/upload.js?v=2',
  '/js/category-form.js?v=2',
  '/js/outfit-editor.js?v=2',
  '/js/doll.js?v=2',
  '/manifest.webmanifest?v=2',
  '/icons/icon.png?v=2',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      Promise.allSettled(ASSETS.map((a) => cache.add(a)))
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== location.origin) return;
  // 只接管静态资源；导航与 API 走网络
  if (!url.pathname.startsWith('/css/') && !url.pathname.startsWith('/js/') && !url.pathname.startsWith('/icons/')) return;
  event.respondWith(
    caches.match(event.request).then((hit) => hit || fetch(event.request))
  );
});
