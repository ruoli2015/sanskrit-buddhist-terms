// Service worker: offline support. VERSION and FILES are stamped by scripts/build.mjs.
const VERSION = '5e6c3ffae4';
const FILES = [
  "./",
  "audio/abhidharma.m4a",
  "audio/adhimoksa.m4a",
  "audio/advesa.m4a",
  "audio/ahrikya.m4a",
  "audio/akasa.m4a",
  "audio/akusala.m4a",
  "audio/alambana.m4a",
  "audio/alaya-vijnana.m4a",
  "audio/alobha.m4a",
  "audio/amoha.m4a",
  "audio/anagamin.m4a",
  "audio/anapatrapya.m4a",
  "audio/anasrava.m4a",
  "audio/anatman.m4a",
  "audio/anitya.m4a",
  "audio/anusaya.m4a",
  "audio/apatrapya.m4a",
  "audio/apramada.m4a",
  "audio/apramana.m4a",
  "audio/apratisamkhya-nirodha.m4a",
  "audio/arhat.m4a",
  "audio/asamjni-samapatti.m4a",
  "audio/asamkhyeya.m4a",
  "audio/asamprajanya.m4a",
  "audio/asamskrta.m4a",
  "audio/asraddhya.m4a",
  "audio/asraya-paravrtti.m4a",
  "audio/atman.m4a",
  "audio/auddhatya.m4a",
  "audio/avidya.m4a",
  "audio/avihimsa.m4a",
  "audio/avijnapti.m4a",
  "audio/avyakrta.m4a",
  "audio/ayatana.m4a",
  "audio/bhava.m4a",
  "audio/bhiksu.m4a",
  "audio/bhiksuni.m4a",
  "audio/bija.m4a",
  "audio/bodhi.m4a",
  "audio/bodhicitta.m4a",
  "audio/bodhisattva.m4a",
  "audio/buddha.m4a",
  "audio/buddhaksetra.m4a",
  "audio/caitasika.m4a",
  "audio/caksur-vijnana.m4a",
  "audio/caksus.m4a",
  "audio/catvarah-pratyayah.m4a",
  "audio/cetana.m4a",
  "audio/chanda.m4a",
  "audio/citta.m4a",
  "audio/dana.m4a",
  "audio/dharma-nairatmya.m4a",
  "audio/dharma.m4a",
  "audio/dharmakaya.m4a",
  "audio/dharmayatana.m4a",
  "audio/dhatu.m4a",
  "audio/dhyana.m4a",
  "audio/dravya.m4a",
  "audio/drsti.m4a",
  "audio/gandha.m4a",
  "audio/gatha.m4a",
  "audio/gati.m4a",
  "audio/ghrana-vijnana.m4a",
  "audio/ghrana.m4a",
  "audio/hetu.m4a",
  "audio/hri.m4a",
  "audio/indriya.m4a",
  "audio/irsya.m4a",
  "audio/jaramarana.m4a",
  "audio/jati.m4a",
  "audio/jihva-vijnana.m4a",
  "audio/jihva.m4a",
  "audio/jivitendriya.m4a",
  "audio/jneyavarana.m4a",
  "audio/kalpa.m4a",
  "audio/karma.m4a",
  "audio/karuna.m4a",
  "audio/kaukrtya.m4a",
  "audio/kausidya.m4a",
  "audio/kaya-vijnana.m4a",
  "audio/kaya.m4a",
  "audio/klesa.m4a",
  "audio/klesavarana.m4a",
  "audio/klista-manas.m4a",
  "audio/krodha.m4a",
  "audio/ksanti.m4a",
  "audio/kusala-moral.m4a",
  "audio/mada.m4a",
  "audio/mahabhuta.m4a",
  "audio/maitri.m4a",
  "audio/mana.m4a",
  "audio/manas.m4a",
  "audio/manaskara.m4a",
  "audio/mano-vijnana.m4a",
  "audio/mara.m4a",
  "audio/matsarya.m4a",
  "audio/maya.m4a",
  "audio/middha.m4a",
  "audio/mraksa.m4a",
  "audio/mudita.m4a",
  "audio/musitasmrtita.m4a",
  "audio/namarupa.m4a",
  "audio/nihsvabhava.m4a",
  "audio/nirmanakaya.m4a",
  "audio/nirodha-samapatti.m4a",
  "audio/nirvana.m4a",
  "audio/nivarana.m4a",
  "audio/paramartha-satya.m4a",
  "audio/paramita.m4a",
  "audio/paratantra.m4a",
  "audio/parikalpita.m4a",
  "audio/parinamana.m4a",
  "audio/parinispanna.m4a",
  "audio/pradasa.m4a",
  "audio/prajna.m4a",
  "audio/prajnapti.m4a",
  "audio/pramada.m4a",
  "audio/prapti.m4a",
  "audio/prasrabdhi.m4a",
  "audio/pratigha.m4a",
  "audio/pratimoksa.m4a",
  "audio/pratisamkhya-nirodha.m4a",
  "audio/pratityasamutpada.m4a",
  "audio/pratyaya.m4a",
  "audio/pratyekabuddha.m4a",
  "audio/pudgala-nairatmya.m4a",
  "audio/pudgala.m4a",
  "audio/punya.m4a",
  "audio/raga.m4a",
  "audio/rasa.m4a",
  "audio/rupa.m4a",
  "audio/rupayatana.m4a",
  "audio/sabda.m4a",
  "audio/sadayatana.m4a",
  "audio/sakrdagamin.m4a",
  "audio/samadhi.m4a",
  "audio/samatha.m4a",
  "audio/sambhogakaya.m4a",
  "audio/samjna.m4a",
  "audio/samsara.m4a",
  "audio/samskara.m4a",
  "audio/samskrta-laksana.m4a",
  "audio/samskrta.m4a",
  "audio/samvrti-satya.m4a",
  "audio/sangha.m4a",
  "audio/sarana.m4a",
  "audio/sarvatraga.m4a",
  "audio/sasrava.m4a",
  "audio/sathya.m4a",
  "audio/sattva.m4a",
  "audio/sila.m4a",
  "audio/skandha.m4a",
  "audio/smrti.m4a",
  "audio/smrtyupasthana.m4a",
  "audio/sparsa.m4a",
  "audio/sprastavya.m4a",
  "audio/sraddha.m4a",
  "audio/sramana.m4a",
  "audio/sravaka.m4a",
  "audio/srotaapanna.m4a",
  "audio/srotra-vijnana.m4a",
  "audio/srotra.m4a",
  "audio/styana.m4a",
  "audio/sunyata.m4a",
  "audio/sutra.m4a",
  "audio/tathagata.m4a",
  "audio/tathagatagarbha.m4a",
  "audio/tathata.m4a",
  "audio/traidhatuka.m4a",
  "audio/triratna.m4a",
  "audio/trsna.m4a",
  "audio/upadana.m4a",
  "audio/upanaha.m4a",
  "audio/upasaka.m4a",
  "audio/upasika.m4a",
  "audio/upaya.m4a",
  "audio/upeksa.m4a",
  "audio/vasana.m4a",
  "audio/vedana.m4a",
  "audio/vicara.m4a",
  "audio/vicikitsa.m4a",
  "audio/vihimsa.m4a",
  "audio/vijnana.m4a",
  "audio/vijnaptimatra.m4a",
  "audio/viksepa.m4a",
  "audio/vinaya.m4a",
  "audio/vipaka.m4a",
  "audio/vipasyana.m4a",
  "audio/viprayukta-samskara.m4a",
  "audio/virya.m4a",
  "audio/visaya.m4a",
  "audio/vitarka.m4a",
  "audio/yojana.m4a",
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

  // App shell: cache-first (a new service worker version brings new files).
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then(
      (hit) => hit || fetch(req).catch(() => (req.mode === 'navigate' ? caches.match('./') : Response.error())),
    ),
  );
});
