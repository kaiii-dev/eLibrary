/* ════════════════════════════════════════════════
   My E-Library — Service Worker
   Strategy:
   • App shell (HTML/CSS/JS)  → Cache-first, background update
   • Cover images (CDN/Storage) → Stale-while-revalidate, max 200 items
   • Firebase SDK / Firestore   → Pass-through (SDK has its own IndexedDB)
   • External APIs (Jikan etc.) → Network-only
════════════════════════════════════════════════ */

const SHELL_CACHE = 'elibrary-shell-v1';
const IMAGE_CACHE = 'elibrary-images-v1';
const IMAGE_MAX   = 200;

const APP_SHELL = [
  '/home.html',
  '/explore.html',
  '/update.html',
  '/friends.html',
  '/calendar.html',
  '/import.html',
  '/css/site.css',
  '/js/firebase-service.js',
  '/js/firebase-config.js',
  '/js/nav.js',
  '/js/auth-guard.js',
  '/js/achievements.js',
  '/js/profile.js',
  '/js/toast.js',
  '/manifest.json',
  '/icons/icon.svg',
];

/* ── INSTALL: pre-cache app shell ─────────────── */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then(cache =>
      Promise.allSettled(APP_SHELL.map(url => cache.add(url).catch(() => {})))
    ).then(() => self.skipWaiting())
  );
});

/* ── ACTIVATE: purge old caches ───────────────── */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== SHELL_CACHE && k !== IMAGE_CACHE)
            .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

/* ── FETCH ────────────────────────────────────── */
self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // ① Pass-through: Firebase SDK, Firestore, Auth, Storage (Firestore handles offline itself)
  if (
    url.hostname.endsWith('gstatic.com')       ||
    url.hostname.endsWith('googleapis.com')     ||
    url.hostname.endsWith('google.com')         ||
    url.hostname.endsWith('firebaseapp.com')    ||
    url.hostname.endsWith('firebaseio.com')
  ) return;

  // ② Pass-through: external API calls (no point caching volatile data)
  if (
    url.hostname.includes('jikan.moe')          ||
    url.hostname.includes('mangadex.org')        ||
    url.hostname.includes('themoviedb.org')      ||
    url.pathname.startsWith('/api/')
  ) return;

  // ③ Stale-while-revalidate: cover images (Firebase Storage + CDN sources)
  if (
    url.hostname.endsWith('firebasestorage.googleapis.com') ||
    url.hostname.includes('uploads.mangadex.org')           ||
    url.hostname.includes('cdn.myanimelist.net')            ||
    url.hostname.includes('image.tmdb.org')                 ||
    url.hostname.includes('via.placeholder.com')
  ) {
    event.respondWith(staleWhileRevalidateImage(request));
    return;
  }

  // ④ App shell (same origin HTML/CSS/JS): cache-first, background refresh
  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirstWithRefresh(request));
    return;
  }

  // ⑤ Everything else (Google Fonts, Font Awesome CDN): network-first, cache fallback
  event.respondWith(
    fetch(request).then(resp => {
      if (resp.ok) {
        const clone = resp.clone();
        caches.open(SHELL_CACHE).then(c => c.put(request, clone));
      }
      return resp;
    }).catch(() => caches.match(request))
  );
});

/* ── Strategies ───────────────────────────────── */

async function cacheFirstWithRefresh(request) {
  const cache  = await caches.open(SHELL_CACHE);
  const cached = await cache.match(request);

  // Kick off a background refresh regardless
  const networkFetch = fetch(request).then(resp => {
    if (resp.ok) cache.put(request, resp.clone());
    return resp;
  }).catch(() => null);

  return cached || await networkFetch || new Response('Offline', { status: 503 });
}

async function staleWhileRevalidateImage(request) {
  const cache  = await caches.open(IMAGE_CACHE);
  const cached = await cache.match(request);

  const networkFetch = fetch(request).then(async resp => {
    if (!resp.ok) return resp;
    // Trim cache if over limit
    const keys = await cache.keys();
    if (keys.length >= IMAGE_MAX) {
      await Promise.all(keys.slice(0, 20).map(k => cache.delete(k)));
    }
    cache.put(request, resp.clone());
    return resp;
  }).catch(() => null);

  return cached || await networkFetch || new Response('', { status: 503 });
}

/* ── Message handler (manual cache refresh) ───── */
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data?.type === 'CLEAR_IMAGES') caches.delete(IMAGE_CACHE);
});
