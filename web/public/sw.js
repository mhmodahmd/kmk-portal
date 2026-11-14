/**
 * Service Worker: يحفظ هيكل الواجهة لتفتح فوراً.
 * طلبات البيانات (Apps Script) لا تُخزَّن هنا أبداً.
 */
const CACHE = 'kmk-shell-v1';
const BASE = '/kmk-portal/';

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll([BASE, BASE + 'index.html', BASE + 'icon-192.png', BASE + 'logo-on-dark.png', BASE + 'logo.png'])).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin || !url.pathname.startsWith(BASE)) return;
  // الصفحة: الشبكة أولاً ثم النسخة المحفوظة (ليصل التحديث فوراً)
  if (e.request.mode === 'navigate') {
    e.respondWith(fetch(e.request).then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(BASE + 'index.html', copy)); return res; }).catch(() => caches.match(BASE + 'index.html')));
    return;
  }
  // الملفات ذات البصمة (assets/) ثابتة: المحفوظ أولاً
  e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
    if (res.ok && url.pathname.startsWith(BASE + 'assets/')) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
    return res;
  })));
});
