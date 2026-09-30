// In-memory app state backed by IndexedDB. Every change is written locally first
// (so the app works offline) and marked dirty for the sync module to upload.
import * as db from './db.js';
import { uid, dayKey } from './util.js';
import { DEFAULT_SETTINGS } from './srs.js';

// Doc kinds: 'progress' (key 't:<termId>' | 'c:<cmpId>'), 'custom' (custom term), 'note', 'settings' (key 'main')
const docs = new Map(); // id -> row
let reviews = [];
const listeners = new Set();
let onDirty = () => {};
const versions = {}; // kind -> change counter (cheap cache keys)
const bump = (kind) => (versions[kind] = (versions[kind] || 0) + 1);
export const kindVersion = (kind) => versions[kind] || 0;

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
const emit = () => listeners.forEach((fn) => fn());

export function setDirtyHandler(fn) {
  onDirty = fn;
}

export async function load() {
  for (const row of await db.getAll('docs')) docs.set(row.id, row);
  reviews = await db.getAll('reviews');
  reviews.sort((a, b) => a.ts - b.ts);
}

const docId = (kind, key) => `${kind}:${key}`;

export function getDoc(kind, key) {
  const row = docs.get(docId(kind, key));
  return row && !row.deleted ? row.data : undefined;
}

export function listDocs(kind) {
  const out = [];
  for (const row of docs.values()) if (row.kind === kind && !row.deleted) out.push([row.key, row.data]);
  return out;
}

export async function saveDoc(kind, key, data, { deleted = false } = {}) {
  const row = { id: docId(kind, key), kind, key, data, deleted, updatedAt: Date.now(), dirty: 1 };
  docs.set(row.id, row);
  bump(kind);
  await db.put('docs', row);
  emit();
  onDirty();
}

export const deleteDoc = (kind, key) => saveDoc(kind, key, null, { deleted: true });

export async function saveDocsBulk(items) {
  const now = Date.now();
  const rows = items.map(({ kind, key, data }) => ({ id: docId(kind, key), kind, key, data, deleted: false, updatedAt: now, dirty: 1 }));
  rows.forEach((r) => { docs.set(r.id, r); bump(r.kind); });
  await db.putMany('docs', rows);
  emit();
  onDirty();
}

// ---- progress & settings shortcuts ----
export const progress = (key) => getDoc('progress', key);
export const setProgress = (key, p) => saveDoc('progress', key, p);

export function settings() {
  return { ...DEFAULT_SETTINGS, ...(getDoc('settings', 'main') || {}) };
}
export const saveSettings = (patch) => saveDoc('settings', 'main', { ...settings(), ...patch });

// ---- review log ----
export function getReviews() {
  return reviews;
}

export async function addReview(r) {
  const row = { id: uid(), ts: Date.now(), dirty: 1, ...r };
  reviews.push(row);
  await db.put('reviews', row);
  emit();
  onDirty();
}

export function newIntroducedToday() {
  const today = dayKey();
  let n = 0;
  for (const [key, p] of listDocs('progress')) {
    if (key.startsWith('t:') && p.introducedAt && dayKey(p.introducedAt) === today) n++;
  }
  return n;
}

// ---- used by sync.js ----
export const dirtyDocs = () => [...docs.values()].filter((r) => r.dirty);
export const dirtyReviews = () => reviews.filter((r) => r.dirty);

export async function markClean(docRows, reviewRows) {
  const docUpdates = [];
  for (const sent of docRows) {
    const cur = docs.get(sent.id);
    // Only clear the flag if the doc hasn't changed again since it was sent.
    if (cur && cur.updatedAt === sent.updatedAt) {
      cur.dirty = 0;
      docUpdates.push(cur);
    }
  }
  reviewRows.forEach((r) => (r.dirty = 0));
  await db.putMany('docs', docUpdates);
  await db.putMany('reviews', reviewRows);
}

/** Merge docs pulled from the server (last-writer-wins on updatedAt). */
export async function mergeRemoteDocs(remote) {
  const changed = [];
  for (const r of remote) {
    const id = docId(r.kind, r.key);
    const cur = docs.get(id);
    if (cur && cur.updatedAt >= r.updated_at) continue;
    const row = { id, kind: r.kind, key: r.key, data: r.data?.v ?? null, deleted: !!r.data?.deleted, updatedAt: r.updated_at, dirty: 0 };
    docs.set(id, row);
    bump(r.kind);
    changed.push(row);
  }
  await db.putMany('docs', changed);
  if (changed.length) emit();
  return changed.length;
}

export async function mergeRemoteReviews(remote) {
  const have = new Set(reviews.map((r) => r.id));
  const fresh = remote.filter((r) => !have.has(r.id)).map((r) => ({ ...r.data, id: r.id, dirty: 0 }));
  if (!fresh.length) return 0;
  reviews.push(...fresh);
  reviews.sort((a, b) => a.ts - b.ts);
  await db.putMany('reviews', fresh);
  emit();
  return fresh.length;
}

// ---- backup ----
export function exportAll() {
  return { app: 'sanskrit-buddhist-terms', exportedAt: new Date().toISOString(), docs: [...docs.values()], reviews };
}

export async function importAll(data) {
  if (data?.app !== 'sanskrit-buddhist-terms') throw new Error('Not a backup file from this app');
  const rows = data.docs.map((r) => ({ ...r, dirty: 1, updatedAt: Math.max(r.updatedAt || 0, Date.now()) }));
  rows.forEach((r) => { docs.set(r.id, r); bump(r.kind); });
  await db.putMany('docs', rows);
  const have = new Set(reviews.map((r) => r.id));
  const fresh = data.reviews.filter((r) => !have.has(r.id)).map((r) => ({ ...r, dirty: 1 }));
  reviews.push(...fresh);
  reviews.sort((a, b) => a.ts - b.ts);
  await db.putMany('reviews', fresh);
  emit();
  onDirty();
}

export async function resetProgress() {
  const rows = [];
  for (const row of docs.values()) {
    if (row.kind === 'progress' && !row.deleted) {
      const r = { ...row, data: null, deleted: true, updatedAt: Date.now(), dirty: 1 };
      docs.set(r.id, r);
      rows.push(r);
    }
  }
  await db.putMany('docs', rows);
  emit();
  onDirty();
}
