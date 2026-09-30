// Service worker: offline support. VERSION and FILES are stamped by scripts/build.mjs.
const VERSION = '95a60c97cd';
const FILES = [
  "./",
  "css/app.css",
  "data/content.json",
  "icons/apple-touch-icon.png",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon-maskable-512.png",
  "index.html",
  "js/config.js",
  "js/content.js",
  "js/db.js",
  "js/grade.js",
  "js/main.js",
  "js/srs.js",
  "js/stats.js",
  "js/store.js",
  "js/sync.js",
  "js/ui/add.js",
  "js/ui/browse.js",
  "js/ui/common.js",
  "js/ui/compare.js",
  "js/ui/home.js",
  "js/ui/progress.js",
  "js/ui/session.js",
  "js/ui/settings.js",
  "js/ui/term.js",
  "js/util.js",
  "manifest.webmanifest",
  "vendor/fsrs.js",
  "vendor/preact.js",
  "vendor/supabase.js"
];
const CACHE = `sbt-${VERSION}`;
const FONT_CACHE = 'sbt-fonts';

self.addEventListener('install', (e) => {
  // cache: 'reload' bypasses the browser's HTTP cache (GitHub Pages sends max-age=600), so a new
  // version never precaches stale files.
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: 'reload' })))));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k.startsWith('sbt-') && k !== CACHE && k !== FONT_CACHE).map((k) => caches.delete(k))),
    ).then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (e) => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Google Fonts: cache-first, kept across versions.
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(
      caches.open(FONT_CACHE).then(async (c) => {
        const hit = await c.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) c.put(req, res.clone());
        return res;
      }),
    );
    return;
  }
  if (url.origin !== self.location.origin) return; // Supabase etc. go straight to the network

  // Content: network-first so new terms show up quickly, cache as fallback offline.
  if (url.pathname.endsWith('/data/content.json')) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req, { ignoreSearch: true })),
    );
    return;
  }

  // App shell: cache-first (a new service worker version brings new files).
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then(
      (hit) => hit || fetch(req).catch(() => (req.mode === 'navigate' ? caches.match('./') : Response.error())),
    ),
  );
});
