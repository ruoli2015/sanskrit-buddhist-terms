// Service worker: offline support. VERSION and FILES are stamped by scripts/build.mjs.
const VERSION = '0d5a1fdbcf';
const FILES = [
  "./",
  "audio/abhidharma.mp3",
  "audio/adhimoksa.mp3",
  "audio/advesa.mp3",
  "audio/ahrikya.mp3",
  "audio/akasa.mp3",
  "audio/akusala.mp3",
  "audio/alambana.mp3",
  "audio/alaya-vijnana.mp3",
  "audio/alobha.mp3",
  "audio/amoha.mp3",
  "audio/anagamin.mp3",
  "audio/anapatrapya.mp3",
  "audio/anasrava.mp3",
  "audio/anatman.mp3",
  "audio/anitya.mp3",
  "audio/anusaya.mp3",
  "audio/apatrapya.mp3",
  "audio/apramada.mp3",
  "audio/apramana.mp3",
  "audio/apratisamkhya-nirodha.mp3",
  "audio/arhat.mp3",
  "audio/asamjni-samapatti.mp3",
  "audio/asamkhyeya.mp3",
  "audio/asamprajanya.mp3",
  "audio/asamskrta.mp3",
  "audio/asraddhya.mp3",
  "audio/asraya-paravrtti.mp3",
  "audio/atman.mp3",
  "audio/auddhatya.mp3",
  "audio/avidya.mp3",
  "audio/avihimsa.mp3",
  "audio/avijnapti.mp3",
  "audio/avyakrta.mp3",
  "audio/ayatana.mp3",
  "audio/bhava.mp3",
  "audio/bhiksu.mp3",
  "audio/bhiksuni.mp3",
  "audio/bija.mp3",
  "audio/bodhi.mp3",
  "audio/bodhicitta.mp3",
  "audio/bodhisattva.mp3",
  "audio/buddha.mp3",
  "audio/buddhaksetra.mp3",
  "audio/caitasika.mp3",
  "audio/caksur-vijnana.mp3",
  "audio/caksus.mp3",
  "audio/catvarah-pratyayah.mp3",
  "audio/cetana.mp3",
  "audio/chanda.mp3",
  "audio/citta.mp3",
  "audio/dana.mp3",
  "audio/dharma-nairatmya.mp3",
  "audio/dharma.mp3",
  "audio/dharmakaya.mp3",
  "audio/dharmayatana.mp3",
  "audio/dhatu.mp3",
  "audio/dhyana.mp3",
  "audio/dravya.mp3",
  "audio/drsti.mp3",
  "audio/gandha.mp3",
  "audio/gatha.mp3",
  "audio/gati.mp3",
  "audio/ghrana-vijnana.mp3",
  "audio/ghrana.mp3",
  "audio/hetu.mp3",
  "audio/hri.mp3",
  "audio/indriya.mp3",
  "audio/irsya.mp3",
  "audio/jaramarana.mp3",
  "audio/jati.mp3",
  "audio/jihva-vijnana.mp3",
  "audio/jihva.mp3",
  "audio/jivitendriya.mp3",
  "audio/jneyavarana.mp3",
  "audio/kalpa.mp3",
  "audio/karma.mp3",
  "audio/karuna.mp3",
  "audio/kaukrtya.mp3",
  "audio/kausidya.mp3",
  "audio/kaya-vijnana.mp3",
  "audio/kaya.mp3",
  "audio/klesa.mp3",
  "audio/klesavarana.mp3",
  "audio/klista-manas.mp3",
  "audio/krodha.mp3",
  "audio/ksanti.mp3",
  "audio/kusala-moral.mp3",
  "audio/mada.mp3",
  "audio/mahabhuta.mp3",
  "audio/maitri.mp3",
  "audio/mana.mp3",
  "audio/manas.mp3",
  "audio/manaskara.mp3",
  "audio/mano-vijnana.mp3",
  "audio/mara.mp3",
  "audio/matsarya.mp3",
  "audio/maya.mp3",
  "audio/middha.mp3",
  "audio/mraksa.mp3",
  "audio/mudita.mp3",
  "audio/musitasmrtita.mp3",
  "audio/namarupa.mp3",
  "audio/nihsvabhava.mp3",
  "audio/nirmanakaya.mp3",
  "audio/nirodha-samapatti.mp3",
  "audio/nirvana.mp3",
  "audio/nivarana.mp3",
  "audio/paramartha-satya.mp3",
  "audio/paramita.mp3",
  "audio/paratantra.mp3",
  "audio/parikalpita.mp3",
  "audio/parinamana.mp3",
  "audio/parinispanna.mp3",
  "audio/pradasa.mp3",
  "audio/prajna.mp3",
  "audio/prajnapti.mp3",
  "audio/pramada.mp3",
  "audio/prapti.mp3",
  "audio/prasrabdhi.mp3",
  "audio/pratigha.mp3",
  "audio/pratimoksa.mp3",
  "audio/pratisamkhya-nirodha.mp3",
  "audio/pratityasamutpada.mp3",
  "audio/pratyaya.mp3",
  "audio/pratyekabuddha.mp3",
  "audio/pudgala-nairatmya.mp3",
  "audio/pudgala.mp3",
  "audio/punya.mp3",
  "audio/raga.mp3",
  "audio/rasa.mp3",
  "audio/rupa.mp3",
  "audio/rupayatana.mp3",
  "audio/sabda.mp3",
  "audio/sadayatana.mp3",
  "audio/sakrdagamin.mp3",
  "audio/samadhi.mp3",
  "audio/samatha.mp3",
  "audio/sambhogakaya.mp3",
  "audio/samjna.mp3",
  "audio/samsara.mp3",
  "audio/samskara.mp3",
  "audio/samskrta-laksana.mp3",
  "audio/samskrta.mp3",
  "audio/samvrti-satya.mp3",
  "audio/sangha.mp3",
  "audio/sarana.mp3",
  "audio/sarvatraga.mp3",
  "audio/sasrava.mp3",
  "audio/sathya.mp3",
  "audio/sattva.mp3",
  "audio/sila.mp3",
  "audio/skandha.mp3",
  "audio/smrti.mp3",
  "audio/smrtyupasthana.mp3",
  "audio/sparsa.mp3",
  "audio/sprastavya.mp3",
  "audio/sraddha.mp3",
  "audio/sramana.mp3",
  "audio/sravaka.mp3",
  "audio/srotaapanna.mp3",
  "audio/srotra-vijnana.mp3",
  "audio/srotra.mp3",
  "audio/styana.mp3",
  "audio/sunyata.mp3",
  "audio/sutra.mp3",
  "audio/tathagata.mp3",
  "audio/tathagatagarbha.mp3",
  "audio/tathata.mp3",
  "audio/traidhatuka.mp3",
  "audio/triratna.mp3",
  "audio/trsna.mp3",
  "audio/upadana.mp3",
  "audio/upanaha.mp3",
  "audio/upasaka.mp3",
  "audio/upasika.mp3",
  "audio/upaya.mp3",
  "audio/upeksa.mp3",
  "audio/vasana.mp3",
  "audio/vedana.mp3",
  "audio/vicara.mp3",
  "audio/vicikitsa.mp3",
  "audio/vihimsa.mp3",
  "audio/vijnana.mp3",
  "audio/vijnaptimatra.mp3",
  "audio/viksepa.mp3",
  "audio/vinaya.mp3",
  "audio/vipaka.mp3",
  "audio/vipasyana.mp3",
  "audio/viprayukta-samskara.mp3",
  "audio/virya.mp3",
  "audio/visaya.mp3",
  "audio/vitarka.mp3",
  "audio/yojana.mp3",
  "css/app.css",
  "data/content.json",
  "icons/apple-touch-icon.png",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon-maskable-512.png",
  "index.html",
  "js/audio.js",
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

  // Pronunciation audio: cache-first, answering Range requests (Safari plays media through
  // ranged requests and won't accept a full 200 response from a service worker).
  if (url.pathname.includes('/audio/')) {
    e.respondWith(audioResponse(req));
    return;
  }

  // App shell: cache-first (a new service worker version brings new files).
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then(
      (hit) => hit || fetch(req).catch(() => (req.mode === 'navigate' ? caches.match('./') : Response.error())),
    ),
  );
});

async function audioResponse(req) {
  const cache = await caches.open(CACHE);
  const key = new URL(req.url).pathname;
  let res = await cache.match(key, { ignoreSearch: true }) || await cache.match(req.url, { ignoreSearch: true });
  if (!res) {
    res = await fetch(req.url); // full file, no Range header
    if (res.ok) cache.put(req.url, res.clone());
  }
  const range = req.headers.get('range');
  if (!range || !res.ok) return res;
  const buf = await res.arrayBuffer();
  const m = /bytes=(\d*)-(\d*)/.exec(range) || [];
  const size = buf.byteLength;
  const start = m[1] ? Math.min(+m[1], size - 1) : 0;
  const end = m[2] ? Math.min(+m[2], size - 1) : size - 1;
  return new Response(buf.slice(start, end + 1), {
    status: 206,
    headers: {
      'Content-Type': res.headers.get('Content-Type') || 'audio/mpeg',
      'Content-Range': `bytes ${start}-${end}/${size}`,
      'Content-Length': String(end - start + 1),
      'Accept-Ranges': 'bytes',
    },
  });
}
