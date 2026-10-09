// Service Worker：仅缓存静态资源（cache-first），页面导航始终走网络（SSR）
const CACHE = 'mystuff-v1';
const ASSETS = [
  '/css/style.css',
  '/js/upload.js',
  '/js/category-form.js',
  '/js/outfit-editor.js',
  '/manifest.webmanifest',
  '/icons/icon.png',
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
