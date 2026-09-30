// Cross-device sync through Supabase (see supabase/schema.sql).
// Local-first: the app never waits for the network; this module uploads dirty rows
// and pulls rows other devices changed since the last pull.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import * as store from './store.js';
import * as db from './db.js';

export const enabled = !!(SUPABASE_URL && SUPABASE_ANON_KEY);

let client = null;
let session = null;
let running = null;
let timer = null;
const state = { status: enabled ? 'signed-out' : 'disabled', lastSync: null, error: null, email: null };
const listeners = new Set();

export const getState = () => ({ ...state });
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function set(patch) {
  Object.assign(state, patch);
  listeners.forEach((fn) => fn(getState()));
}

async function getClient() {
  if (!enabled) return null;
  if (!client) {
    const { createClient } = await import('../vendor/supabase.js');
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    });
  }
  return client;
}

export async function init() {
  state.lastSync = await db.getMeta('lastSync');
  if (!enabled) return;
  const c = await getClient();
  const { data } = await c.auth.getSession();
  session = data.session;
  set({ status: session ? 'idle' : 'signed-out', email: session?.user?.email || null });
  c.auth.onAuthStateChange((_evt, s) => {
    session = s;
    set({ status: s ? 'idle' : 'signed-out', email: s?.user?.email || null });
  });
  store.setDirtyHandler(() => schedule(4000));
  window.addEventListener('online', () => schedule(500));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') schedule(500);
    else syncNow(); // flush when the app is backgrounded
  });
  if (session) syncNow();
}

// Email + password sign-in (free tier; no email templates or SMTP needed).
export async function signIn(email, password) {
  const c = await getClient();
  const { data, error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw error;
  await afterLogin(data.session, email);
}

export async function signUp(email, password) {
  const c = await getClient();
  const { data, error } = await c.auth.signUp({ email, password });
  if (error) throw error;
  if (!data.session) {
    // "Confirm email" is switched on in Supabase: the account exists but must be confirmed first.
    throw new Error('帳號已建立，請先點擊確認信中的連結，再回來登入。· Account created — click the link in the confirmation email, then sign in here.');
  }
  await afterLogin(data.session, email);
}

async function afterLogin(s, email) {
  session = s;
  set({ status: 'idle', email });
  // First sync after login: everything local that was never uploaded is still dirty.
  await syncNow();
}

export async function signOut() {
  const c = await getClient();
  await c.auth.signOut();
  await db.setMeta('pullDocs', null);
  await db.setMeta('pullReviews', null);
  set({ status: 'signed-out', email: null });
}

export function schedule(ms = 3000) {
  if (!enabled || !session) return;
  clearTimeout(timer);
  timer = setTimeout(syncNow, ms);
}

export function syncNow() {
  if (!enabled || !session) return Promise.resolve();
  if (running) return running;
  if (!navigator.onLine) {
    set({ status: 'offline' });
    return Promise.resolve();
  }
  running = (async () => {
    set({ status: 'syncing', error: null });
    try {
      const c = await getClient();
      await push(c);
      const n = await pull(c);
      const now = Date.now();
      await db.setMeta('lastSync', now);
      set({ status: 'idle', lastSync: now, pulled: n });
    } catch (e) {
      console.warn('sync failed', e);
      set({ status: 'error', error: e.message || String(e) });
    } finally {
      running = null;
    }
  })();
  return running;
}

const chunks = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

async function push(c) {
  const docs = store.dirtyDocs();
  for (const part of chunks(docs, 200)) {
    const payload = part.map((r) => ({ kind: r.kind, key: r.key, data: { v: r.data, deleted: !!r.deleted }, updated_at: r.updatedAt }));
    const { error } = await c.rpc('upsert_docs', { docs: payload });
    if (error) throw error;
    await store.markClean(part, []);
  }
  const reviews = store.dirtyReviews();
  for (const part of chunks(reviews, 500)) {
    const rows = part.map(({ dirty, id, ...data }) => ({ id, data }));
    const { error } = await c.from('reviews').upsert(rows, { onConflict: 'id', ignoreDuplicates: true });
    if (error) throw error;
    await store.markClean([], part);
  }
}

// Pull rows changed since the last cursor. The cursor overlaps by 5 minutes so rows
// committed slightly out of order are not missed; merging is idempotent.
async function pull(c) {
  let total = 0;
  for (const [table, metaKey, merge, cols] of [
    ['user_docs', 'pullDocs', store.mergeRemoteDocs, 'kind,key,data,updated_at,synced_at'],
    ['reviews', 'pullReviews', store.mergeRemoteReviews, 'id,data,synced_at'],
  ]) {
    const cursor = await db.getMeta(metaKey);
    const since = cursor ? new Date(new Date(cursor).getTime() - 5 * 60000).toISOString() : null;
    let newest = cursor;
    for (let offset = 0; ; offset += 1000) {
      let q = c.from(table).select(cols).order('synced_at', { ascending: true }).range(offset, offset + 999);
      if (since) q = q.gt('synced_at', since);
      const { data, error } = await q;
      if (error) throw error;
      total += await merge(data);
      if (data.length) newest = data.at(-1).synced_at;
      if (data.length < 1000) break;
    }
    if (newest) await db.setMeta(metaKey, newest);
  }
  return total;
}
