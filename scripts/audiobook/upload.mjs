#!/usr/bin/env node
// Upload a built audiobook to the private Supabase bucket "audiobooks" (see supabase/audiobooks.sql).
//   node scripts/audiobook/upload.mjs private/audiobooks/<id>          upload / replace a book
//   node scripts/audiobook/upload.mjs --remove <id>                    remove a book
//   node scripts/audiobook/upload.mjs --list                           list books in the bucket
// Needs SUPABASE_SECRET_KEY (Project Settings → API Keys → secret key) in .env, which is gitignored.
// The MP3 is split into byte ranges of ≤ 20 MB (the free plan limits single files to 50 MB); the app
// joins them back into one file.
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PART = 20 * 1024 * 1024;
const BUCKET = 'audiobooks';

for (const line of existsSync(join(ROOT, '.env')) ? readFileSync(join(ROOT, '.env'), 'utf8').split('\n') : []) {
  const m = /^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/.exec(line);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const URL_ = /SUPABASE_URL\s*=\s*'([^']+)'/.exec(readFileSync(join(ROOT, 'app/js/config.js'), 'utf8'))[1];
if (!KEY) {
  console.error('Set SUPABASE_SECRET_KEY in .env (Supabase → Project Settings → API Keys → Secret keys).');
  process.exit(1);
}
// New-style secret keys (sb_secret_…) go in the apikey header; legacy service_role keys are JWTs.
const auth = { apikey: KEY, ...(KEY.startsWith('eyJ') ? { Authorization: `Bearer ${KEY}` } : {}) };
const api = (path) => `${URL_}/storage/v1/${path}`;

async function req(method, path, body, headers = {}) {
  const res = await fetch(api(path), { method, headers: { ...auth, ...headers }, body });
  if (!res.ok && !(method === 'GET' && (res.status === 400 || res.status === 404))) {
    throw new Error(`${method} ${path}: ${res.status} ${await res.text()}`);
  }
  return res;
}
const put = (path, data, type) => req('POST', `object/${BUCKET}/${path}`, data, { 'Content-Type': type, 'x-upsert': 'true', 'Cache-Control': 'no-cache' });

async function getIndex() {
  const res = await req('GET', `object/${BUCKET}/index.json`);
  return res.ok ? res.json() : [];
}
const putIndex = (list) => put('index.json', JSON.stringify(list, null, 1), 'application/json');

async function listPrefix(prefix) {
  const out = [];
  const res = await req('POST', `object/list/${BUCKET}`, JSON.stringify({ prefix, limit: 1000 }), { 'Content-Type': 'application/json' });
  for (const o of await res.json()) {
    const p = prefix ? `${prefix}/${o.name}` : o.name;
    if (o.id) out.push(p);
    else out.push(...(await listPrefix(p))); // a folder
  }
  return out;
}
async function remove(paths) {
  if (paths.length) await req('DELETE', `object/${BUCKET}`, JSON.stringify({ prefixes: paths }), { 'Content-Type': 'application/json' });
}

async function upload(dir) {
  const out = join(resolve(dir), 'out');
  const manifest = JSON.parse(readFileSync(join(out, 'manifest.json'), 'utf8'));
  const mp3 = readFileSync(join(out, manifest.audio));
  const version = createHash('sha256').update(mp3).digest('hex').slice(0, 10);
  const parts = [];
  for (let i = 0, k = 0; i < mp3.length; i += PART, k++) {
    const path = `${manifest.id}/${version}/part-${String(k).padStart(2, '0')}.mp3`;
    const chunk = mp3.subarray(i, i + PART);
    process.stdout.write(`↑ ${path} (${(chunk.length / 1e6).toFixed(1)} MB)… `);
    await put(path, chunk, 'audio/mpeg');
    console.log('ok');
    parts.push({ path, bytes: chunk.length });
  }
  const full = { ...manifest, version, bytes: mp3.length, parts, uploaded: new Date().toISOString() };
  await put(`${manifest.id}/manifest.json`, JSON.stringify(full), 'application/json');
  const index = (await getIndex()).filter((b) => b.id !== manifest.id);
  index.push({ id: manifest.id, title_zh: manifest.title_zh, title_en: manifest.title_en, title_skt: manifest.title_skt, duration: manifest.duration, bytes: mp3.length, version });
  await putIndex(index);
  const stale = (await listPrefix(manifest.id)).filter((p) => p.endsWith('.mp3') && !p.startsWith(`${manifest.id}/${version}/`));
  await remove(stale);
  console.log(`✓ ${manifest.id} version ${version}: ${parts.length} part(s), ${(mp3.length / 1e6).toFixed(1)} MB, ${(manifest.duration / 60).toFixed(1)} min${stale.length ? `; removed ${stale.length} old part(s)` : ''}`);
}

const [arg, id] = process.argv.slice(2);
if (arg === '--list') {
  for (const b of await getIndex()) console.log(`${b.id}\t${b.title_zh}\t${(b.duration / 60).toFixed(1)} min\t${(b.bytes / 1e6).toFixed(1)} MB\t${b.version}`);
} else if (arg === '--remove' && id) {
  await remove(await listPrefix(id));
  await putIndex((await getIndex()).filter((b) => b.id !== id));
  console.log(`✓ removed ${id}`);
} else if (arg) {
  await upload(arg);
} else {
  console.error('usage: upload.mjs <book-dir> | --remove <id> | --list');
  process.exit(1);
}
