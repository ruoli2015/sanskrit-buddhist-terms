// Private audiobooks. They live in the Supabase Storage bucket "audiobooks", readable only by
// accounts listed in public.audiobook_readers (supabase/audiobooks.sql), never on GitHub Pages.
// After the first play a book's MP3 is kept on the device in Cache Storage.
//
// Bucket layout (written by scripts/audiobook/upload.mjs):
//   index.json                    [{ id, title_zh, title_en, title_skt, duration, bytes, version }]
//   <id>/manifest.json            segments with times (see bookplan.js) + parts
//   <id>/<version>/part-NN.mp3    the book's single MP3 split into byte ranges (≤ 20 MB each)
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { authed } from './sync.js';

const BUCKET = 'audiobooks';
const CACHE = 'books-v1'; // not "sbt-…": the service worker deletes those caches on update
const cacheKey = (path) => new URL(`__books/${path}`, location.href).href;
const audioKey = (m) => cacheKey(`${m.id}/${m.version}.mp3`);

async function fetchObject(path, onProgress) {
  const a = await authed();
  if (!a) throw Object.assign(new Error('請先登入 · Sign in first'), { code: 'signed-out' });
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/authenticated/${BUCKET}/${path}`, {
    headers: { Authorization: `Bearer ${a.token}`, apikey: SUPABASE_ANON_KEY },
    cache: 'no-store',
  });
  if (!res.ok) throw Object.assign(new Error(`下載失敗 · Download failed (${res.status})`), { code: res.status });
  if (!onProgress || !res.body) return res.blob();
  const reader = res.body.getReader();
  const chunks = [];
  let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    n += value.length;
    onProgress(n);
  }
  return new Blob(chunks);
}

// JSON: network first, the cached copy when offline.
async function getJson(path) {
  const cache = await caches.open(CACHE);
  try {
    const text = await (await fetchObject(path)).text();
    await cache.put(cacheKey(path), new Response(text, { headers: { 'Content-Type': 'application/json' } }));
    return JSON.parse(text);
  } catch (e) {
    const hit = await cache.match(cacheKey(path));
    if (hit) return hit.json();
    throw e;
  }
}

/** The books this account can read; [] when there are none or the account has no access. */
export async function listBooks() {
  try {
    const list = await getJson('index.json');
    try { localStorage.setItem('books-count', String(list.length)); } catch {}
    return list;
  } catch (e) {
    if (e.code === 'signed-out') throw e;
    if (e.code === 400 || e.code === 403 || e.code === 404) return [];
    throw e;
  }
}

export const knownCount = () => { try { return +localStorage.getItem('books-count') || 0; } catch { return 0; } };

export const getManifest = (id) => getJson(`${encodeURIComponent(id)}/manifest.json`);

/** The saved MP3 of this version of the book, or null. */
export async function savedAudio(m) {
  const hit = await (await caches.open(CACHE)).match(audioKey(m));
  return hit ? hit.blob() : null;
}

/** Bytes saved on this device for a book (any version). */
export async function savedBytes(id) {
  const cache = await caches.open(CACHE);
  let n = 0;
  for (const req of await cache.keys()) {
    if (req.url.includes(`/__books/${id}/`) && req.url.endsWith('.mp3')) n += +(await cache.match(req)).headers.get('X-Size') || 0;
  }
  return n;
}

/**
 * Download the book part by part. onPart(blobSoFar, loadedBytes, done) is called after each part,
 * so playback can start before the whole book has arrived; onProgress(bytes) while downloading.
 * The complete MP3 is saved on the device, replacing older versions.
 */
export async function downloadAudio(m, { onPart, onProgress } = {}) {
  const blobs = [];
  let loaded = 0;
  for (const p of m.parts) {
    const b = await fetchObject(p.path, (n) => onProgress?.(loaded + n));
    blobs.push(b);
    loaded += b.size;
    onPart?.(new Blob(blobs, { type: 'audio/mpeg' }), loaded, blobs.length === m.parts.length);
  }
  const full = new Blob(blobs, { type: 'audio/mpeg' });
  await deleteAudio(m.id);
  await (await caches.open(CACHE)).put(audioKey(m), new Response(full, {
    headers: { 'Content-Type': 'audio/mpeg', 'X-Size': String(full.size) }, // Content-Length isn't kept by Cache Storage
  }));
  return full;
}

/** Remove a book's saved MP3 from this device (the manifest stays, so it can be played again). */
export async function deleteAudio(id) {
  const cache = await caches.open(CACHE);
  for (const req of await cache.keys()) if (req.url.includes(`/__books/${id}/`) && req.url.endsWith('.mp3')) await cache.delete(req);
}
